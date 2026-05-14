import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PickListsRepository } from './pick-lists.repository';
import { GeneratePickListDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class PickListsService {
  constructor(private repository: PickListsRepository) {}


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
    if (!item) throw new NotFoundException(`PickList ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const pickListNumber = dto.pickListNumber || await this.generateCode();
    return this.repository.create(getCurrentTenantId(), { ...dto, pickListNumber });
  }

  async generate(dto: GeneratePickListDto, user?: AuthUser) {
    if (user?.role === 'manager' && user.warehouseId) {
      if (dto.warehouseId && dto.warehouseId !== user.warehouseId) {
        throw new ForbiddenException('Manager can only generate pick lists for their assigned warehouse');
      }
      dto = { ...dto, warehouseId: user.warehouseId };
    }
    const { strategy, orderIds, warehouseId, assignedTo, priority, batchSize, notes } = dto;

    if (!orderIds || orderIds.length === 0) {
      throw new BadRequestException('At least one order ID is required');
    }

    // 1. Query sales order items for all orders
    const soItems = await this.repository.findSalesOrderItems(getCurrentTenantId(), orderIds);
    if (soItems.length === 0) {
      throw new BadRequestException('No items found for the selected orders');
    }

    // 2. Generate pick list number
    const pickListNumber = await this.generateCode();

    // 3. Create pick list header
    const pickList = await this.repository.create(getCurrentTenantId(), {
      pickListNumber,
      soId: strategy === 'single' ? orderIds[0] : null,
      warehouseId,
      strategy: strategy || 'single',
      priority: priority || 'medium',
      batchSize: strategy === 'batch' ? (batchSize || orderIds.length) : null,
      assignedTo: assignedTo || null,
      notes: notes || `${strategy === 'batch' ? 'Batch' : 'Single'} pick for ${orderIds.length} order(s)`,
      status: assignedTo ? 'assigned' : 'pending',
    });

    // Batch picking: assign a tote per SO (Tote A, Tote B, ...). This lets the picker walk once
    // and drop items into the correct slot for each order (PDF §3.3 Batch Picking).
    const toteForSo: Record<string, string | null> = {};
    if (strategy === 'batch') {
      const uniqueSoIds = Array.from(new Set(soItems.map((it) => it.soId)));
      uniqueSoIds.forEach((soId, idx) => {
        toteForSo[soId] = `Tote ${toteCodeForIndex(idx)}`;
      });
    }

    // 4. Allocate items — find bins with stock for each SKU
    const pickItems: any[] = [];

    for (const soItem of soItems) {
      const qtyNeeded = soItem.quantityOrdered - soItem.quantityPicked;
      if (qtyNeeded <= 0) continue;

      const toteCode = toteForSo[soItem.soId] ?? null;

      // Find bins with available stock, ordered by proximity
      const bins = await this.repository.findAvailableStock(getCurrentTenantId(), soItem.skuId, warehouseId);

      let remaining = qtyNeeded;
      for (const bin of bins) {
        if (remaining <= 0) break;
        const pickQty = Math.min(remaining, bin.available);
        pickItems.push({
          skuId: soItem.skuId,
          binId: bin.binId,
          quantityRequired: pickQty,
          soId: soItem.soId,
          toteCode,
        });
        remaining -= pickQty;
      }

      // If no bins found or insufficient stock, create item without bin (worker finds it)
      if (remaining > 0) {
        pickItems.push({
          skuId: soItem.skuId,
          binId: null,
          quantityRequired: remaining,
          soId: soItem.soId,
          toteCode,
        });
      }
    }

    // 5. Sort by bin proximity for efficient walking
    pickItems.sort((a, b) => {
      if (!a.binId) return 1;
      if (!b.binId) return -1;
      return 0; // bins already sorted by proximity from findAvailableStock
    });

    // 6. Insert pick list items
    if (pickItems.length > 0) {
      await this.repository.createItems(pickList.id, pickItems);
    }

    // 7. Return complete pick list with items
    return this.repository.findById(pickList.id, getCurrentTenantId());
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`PickList ${id} not found`);
  }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>) {
    await this.findOne(id);
    return this.repository.updateStatus(id, getCurrentTenantId(), status, extraFields);
  }

  private async generateCode(): Promise<string> {
    const count = await this.repository.countByTenant(getCurrentTenantId());
    return `PL-${String(count + 1).padStart(3, '0')}`;
  }
}

/**
 * Map a zero-based index to a tote label: 0 → A, 25 → Z, 26 → AA, ...
 * Matches the PDF example: SO-001 = Tote A, SO-002 = Tote B.
 */
function toteCodeForIndex(idx: number): string {
  let n = idx;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
