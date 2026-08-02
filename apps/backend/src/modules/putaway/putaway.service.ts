import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PutawayRepository } from './putaway.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';




@Injectable()
export class PutawayService {
  constructor(
    private repository: PutawayRepository,
    private numbering: DocumentNumberingService,
  ) {}


  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Putaway task ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const putawayNumber = await this.generateCode();
    return this.repository.create(getCurrentTenantId(), { ...dto, putawayNumber });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Putaway task ${id} not found`);
  }

  async getStats(warehouseId?: string) {
    return this.repository.getEnhancedStats(getCurrentTenantId(), warehouseId);
  }

  async suggestBinsPreview(warehouseId: string, skuId: string) {
    return this.repository.suggestBins(warehouseId, skuId);
  }

  async generateFromGrn(grnId: string) {
    // Verify GRN exists and is completed
    const grnRes = await this.repository['db'].query(
      `SELECT * FROM grn WHERE id = $1 AND tenant_id = $2`,
      [grnId, getCurrentTenantId()],
    );
    const grn = grnRes.rows[0];
    if (!grn) throw new NotFoundException(`GRN ${grnId} not found`);
    if (grn.status !== 'completed') throw new BadRequestException(`GRN ${grnId} is not completed`);

    // Get GRN items
    const itemsRes = await this.repository['db'].query(
      `SELECT * FROM grn_items WHERE grn_id = $1`,
      [grnId],
    );

    const tasks: any[] = [];
    for (const item of itemsRes.rows) {
      const putawayNumber = await this.generateCode();

      // Pre-fill the suggested bin using the §3.2 Step 4 scoring rules. The worker can still
      // override the destination at execution time.
      let suggestedBinId: string | null = null;
      try {
        const suggestions = await this.repository.suggestBins(grn.warehouse_id, item.sku_id);
        suggestedBinId = suggestions[0]?.binId || null;
      } catch {
        // Suggestion is best-effort — if it fails the task is still created without a default bin.
      }

      const task = await this.repository.create(getCurrentTenantId(), {
        putawayNumber,
        grnId: grn.id,
        grnItemId: item.id,
        skuId: item.sku_id,
        batchId: item.batch_id || null,
        quantity: item.quantity_received || item.quantity_expected,
        warehouseId: grn.warehouse_id,
        suggestedBinId,
        priority: 'normal',
        notes: `Auto-generated from GRN ${grn.grn_number}`,
      });
      tasks.push(task);
    }

    return tasks;
  }

  async suggestBins(taskId: string) {
    const task = await this.findOne(taskId);
    if (!task.warehouseId || !task.skuId) {
      throw new BadRequestException('Task must have warehouseId and skuId to suggest bins');
    }
    return this.repository.suggestBins(task.warehouseId, task.skuId);
  }

  async assignBin(taskId: string, binId: string, assignedTo?: string) {
    await this.findOne(taskId);
    const extraFields: Record<string, any> = {
      destinationBinId: binId,
      assignedAt: new Date(),
    };
    if (assignedTo) {
      extraFields.assignedTo = assignedTo;
    }
    return this.repository.updateStatus(taskId, getCurrentTenantId(), 'assigned', extraFields);
  }

  async start(taskId: string) {
    await this.findOne(taskId);
    return this.repository.updateStatus(taskId, getCurrentTenantId(), 'in_progress', {
      startedAt: new Date(),
    });
  }

  async complete(taskId: string) {
    await this.findOne(taskId);
    const result = await this.repository.completePutaway(taskId, getCurrentTenantId());
    if (!result) throw new NotFoundException(`Putaway task ${taskId} not found`);
    return result;
  }

  /**
   * Mobile worker scans a bin label to confirm the destination. Validates the scanned bin
   * matches the task's destination (or suggested) and advances status to 'in_progress' if not yet.
   * Returns a friendly error if the wrong bin is scanned so the worker doesn't dump stock in the wrong place.
   *
   * Label encoding contract (see labels.service.ts): a location label encodes
   * the plain bin `code` and nothing else — `barcode_settings.location_code_type`
   * picks QR vs 1D symbology, not the payload. Comparison is case-insensitive
   * and trimmed. Unchanged on purpose: labels already stuck to racks must keep working.
   */
  async scanBin(taskId: string, barcode: string) {
    const task = await this.findOne(taskId);
    if (!barcode) throw new BadRequestException('barcode is required');

    const db = (this.repository as any).db;
    const expectedBinId = task.destinationBinId || task.suggestedBinId;
    if (!expectedBinId) {
      throw new BadRequestException('Task has no destination bin assigned yet');
    }
    const expected = await db.query(`SELECT id, code FROM bins WHERE id = $1`, [expectedBinId]);
    const expectedCode = expected.rows[0]?.code;
    if (!expectedCode) throw new BadRequestException('Destination bin no longer exists');

    const trimmed = barcode.trim().toUpperCase();
    if (trimmed !== String(expectedCode).toUpperCase()) {
      throw new BadRequestException(
        `Wrong bin. You scanned "${barcode}". Expected "${expectedCode}". Walk to the correct location.`,
      );
    }

    // Auto-advance status to in_progress if still pending/assigned
    if (task.status === 'pending' || task.status === 'assigned') {
      await this.repository.updateStatus(taskId, getCurrentTenantId(), 'in_progress', { startedAt: new Date() });
    }

    return { ok: true, taskId, binCode: expectedCode };
  }

  async cancel(taskId: string) {
    await this.findOne(taskId);
    return this.repository.updateStatus(taskId, getCurrentTenantId(), 'cancelled');
  }

  /**
   * Atomic per-tenant counter (migration 078/089) instead of `count + 1`, which
   * re-issued a number after any delete and raced under concurrency.
   * The `putaway` prefix stays `PA-` — that is what live data already carries.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'putaway');
  }
}
