import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GrnRepository } from './grn.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { InvoicesService } from '../invoices/invoices.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class GrnService {
  private readonly logger = new Logger(GrnService.name);

  constructor(
    private repository: GrnRepository,
    private invoices: InvoicesService,
    private purchaseOrders: PurchaseOrdersService,
  ) {}


  async findAll(query: any, user?: AuthUser) {
    const { page = 1, limit = 50 } = query;
    const scopedQuery = user?.role === 'manager' && user.warehouseId
      ? { ...query, warehouseId: user.warehouseId }
      : query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), scopedQuery);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Grn ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const grnNumber = dto.grnNumber || await this.generateCode();
    const { code, ...rest } = dto; return this.repository.create(getCurrentTenantId(), { ...rest, grnNumber });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Grn ${id} not found`);
  }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>) {
    const before = await this.findOne(id);
    const updated = await this.repository.updateStatus(id, getCurrentTenantId(), status, extraFields);

    // Auto-create Purchase Invoice exactly once when GRN transitions to `completed`.
    // Idempotency is enforced by a unique index on (grn_id) where type='purchase', so even if this
    // fires twice the second call returns the existing invoice rather than duplicating.
    if (status === 'completed' && before.status !== 'completed') {
      try {
        const result = await this.invoices.createFromGrn(id);
        if (result.created) {
          this.logger.log(`Auto-created purchase invoice ${result.invoice.invoiceNumber} for GRN ${id}`);
        }
      } catch (err) {
        // Don't fail the GRN status update if invoice creation has a non-fatal issue.
        // The user can always re-trigger via POST /invoices/from-grn/:grnId.
        this.logger.error(`Auto-invoice from GRN ${id} failed`, err as Error);
      }

      // Update associated PO status to 'received'
      if (before.poId) {
        try {
          await this.purchaseOrders.updateStatus(before.poId, 'received');
          this.logger.log(`Updated associated PO ${before.poId} status to 'received'`);
        } catch (err) {
          this.logger.error(`Failed to update PO ${before.poId} status on GRN completion`, err as Error);
        }
      }
    }

    return updated;
  }

  async updateItem(grnId: string, itemId: string, dto: any) {
    await this.findOne(grnId);
    return this.repository.updateItem(grnId, itemId, dto);
  }

  private async generateCode(): Promise<string> {
    const count = await this.repository.countByTenant(getCurrentTenantId());
    return `GRN-${String(count + 1).padStart(3, '0')}`;
  }
}
