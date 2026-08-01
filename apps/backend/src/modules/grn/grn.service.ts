import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GrnRepository } from './grn.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { InvoicesService } from '../invoices/invoices.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { QcService } from '../qc/qc.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';

interface AuthUser { id: string; role: string; fullName?: string | null; warehouseId?: string | null }

@Injectable()
export class GrnService {
  private readonly logger = new Logger(GrnService.name);

  constructor(
    private repository: GrnRepository,
    private invoices: InvoicesService,
    private purchaseOrders: PurchaseOrdersService,
    private qcService: QcService,
    private readonly notifications: NotificationsService,
    private numbering: DocumentNumberingService,
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

  async create(dto: any, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const grnNumber = dto.grnNumber || await this.generateCode();
    const { code, ...rest } = dto;
    const grn = await this.repository.create(tenantId, { ...rest, grnNumber });

    // Committed — now tell the receiving warehouse's manager.
    void this.notifyGrnCreated(tenantId, grn, user).catch(() => undefined);

    return grn;
  }

  /**
   * `grn.created` goes to the managers of the GRN's warehouse, so the
   * warehouse id must be on the context — without it nobody is notified, by
   * design (spec Part 7).
   */
  private async notifyGrnCreated(tenantId: string, grn: any, user?: AuthUser): Promise<void> {
    if (!grn?.id) return;
    const ctxRow = await this.repository.findNotifyContext(grn.id, tenantId).catch(() => null);
    await this.notifications.emit('grn.created', {
      tenantId,
      warehouseId: ctxRow?.warehouseId ?? grn.warehouseId ?? null,
      entityType: 'grn',
      entityId: grn.id,
      data: {
        grnNumber: ctxRow?.grnNumber ?? grn.grnNumber,
        supplierName: ctxRow?.supplierName ?? grn.supplierName,
        warehouseName: ctxRow?.warehouseName,
        totalItems: ctxRow?.totalItems,
        actorUserId: user?.id,
      },
    });
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

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>, user?: AuthUser) {
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

      // Auto-create QC Inspection for each item received with quantity > 0
      if (before.items && Array.isArray(before.items)) {
        for (const item of before.items) {
          if (item.quantityReceived > 0) {
            try {
              const qc = await this.qcService.create({
                grnId: id,
                skuId: item.skuId,
                batchNumber: item.batchNumber || null,
                notes: `Auto-generated from GRN ${before.grnNumber}`,
              });
              this.logger.log(`Auto-created QC inspection ${qc.qcNumber} for SKU ${item.skuId} in GRN ${id}`);
            } catch (err) {
              this.logger.error(`Failed to auto-create QC inspection for SKU ${item.skuId} in GRN ${id}`, err as Error);
            }
          }
        }
      }

      // Completion is the reliable point to reconcile received vs ordered: the
      // line quantities are final here, whereas a per-item PUT is just one
      // keystroke in the middle of a receiving session.
      void this.notifyQtyMismatches(getCurrentTenantId(), id, before, user).catch(() => undefined);
    }

    return updated;
  }

  /**
   * One `grn.qty_mismatch` per line whose received quantity differs from the
   * quantity ordered on the PO. Admin + the warehouse's manager (both), so the
   * warehouse id has to be on the context.
   */
  private async notifyQtyMismatches(
    tenantId: string,
    grnId: string,
    grn: any,
    user?: AuthUser,
  ): Promise<void> {
    const items: any[] = Array.isArray(grn?.items) ? grn.items : [];
    if (items.length === 0) return;

    const mismatched = items.filter((item) => {
      const ordered = Number(item.quantityExpected ?? 0);
      const received = Number(item.quantityReceived ?? 0);
      return Number.isFinite(ordered) && Number.isFinite(received) && ordered !== received;
    });
    if (mismatched.length === 0) return;

    const ctxRow = await this.repository.findNotifyContext(grnId, tenantId).catch(() => null);

    for (const item of mismatched) {
      await this.notifications.emit('grn.qty_mismatch', {
        tenantId,
        warehouseId: ctxRow?.warehouseId ?? grn?.warehouseId ?? null,
        entityType: 'grn',
        entityId: grnId,
        data: {
          grnNumber: ctxRow?.grnNumber ?? grn?.grnNumber,
          warehouseName: ctxRow?.warehouseName,
          supplierName: ctxRow?.supplierName,
          skuId: item.skuId,
          skuName: item.sku?.name ?? item.skus?.name,
          skuCode: item.sku?.skuCode ?? item.skus?.sku_code,
          orderedQty: Number(item.quantityExpected ?? 0),
          receivedQty: Number(item.quantityReceived ?? 0),
          actorUserId: user?.id,
        },
      });
    }
  }

  async updateItem(grnId: string, itemId: string, dto: any) {
    await this.findOne(grnId);
    return this.repository.updateItem(grnId, itemId, dto);
  }

  /**
   * Atomic per-tenant counter (migration 078/089) instead of `count + 1`, which
   * re-issued a number after any delete and raced under concurrency.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'grn');
  }
}
