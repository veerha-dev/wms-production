import { Injectable, NotFoundException } from '@nestjs/common';
import { QcRepository } from './qc.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { NotificationsService } from '../notifications/notifications.service';

interface AuthUser { id: string; role: string; fullName?: string | null; warehouseId?: string | null }


@Injectable()
export class QcService {
  constructor(
    private repository: QcRepository,
    private readonly notifications: NotificationsService,
  ) {}


  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Qc ${id} not found`);
    return item;
  }

  async create(dto: any, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const qcNumber = dto.qcNumber || await this.generateCode();
    const { code, ...rest } = dto;
    const inspection = await this.repository.create(tenantId, { ...rest, qcNumber });

    // Row exists — the inspection is genuinely awaiting someone.
    void this.notifyPending(tenantId, inspection, user).catch(() => undefined);

    return inspection;
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Qc ${id} not found`);
  }

  async getStats() {
    const rows = await this.repository.countByStatus(getCurrentTenantId());
    const stats: Record<string, number> = {};
    rows.forEach((r: any) => stats[r.status] = parseInt(r.count, 10));
    return stats;
  }

  async updateStatus(id: string, status: string, extraFields?: Record<string, any>, user?: AuthUser) {
    const before = await this.findOne(id);
    const tenantId = getCurrentTenantId();
    const updated = await this.repository.updateStatus(id, tenantId, status, extraFields);

    // A failed inspection is the one inbound event that blocks stock from being
    // put away, so it is emitted only once the result has actually been written
    // and never from inside the update itself.
    const result = extraFields?.result;
    if (result === 'failed' && before?.result !== 'failed') {
      void this.notifyFailed(tenantId, id, updated ?? before, extraFields, user).catch(() => undefined);
    }

    return updated;
  }

  /**
   * `qc.pending` — managers of the warehouse the inspection's GRN belongs to.
   * Groupable, so a 40-line GRN collapses into one "40 QC inspections are
   * pending" row rather than flooding the bell.
   */
  private async notifyPending(tenantId: string, inspection: any, user?: AuthUser): Promise<void> {
    if (!inspection?.id) return;
    const ctxRow = await this.repository.findNotifyContext(inspection.id, tenantId).catch(() => null);
    await this.notifications.emit('qc.pending', {
      tenantId,
      warehouseId: ctxRow?.warehouseId ?? null,
      entityType: 'qc_inspection',
      entityId: inspection.id,
      data: {
        qcNumber: ctxRow?.qcNumber ?? inspection.qcNumber,
        grnNumber: ctxRow?.grnNumber,
        warehouseName: ctxRow?.warehouseName,
        skuName: ctxRow?.skuName,
        skuCode: ctxRow?.skuCode,
        actorUserId: user?.id,
      },
    });
  }

  /** `qc.failed` — admin + the managers of that GRN's warehouse, and nobody else. */
  private async notifyFailed(
    tenantId: string,
    id: string,
    inspection: any,
    extraFields?: Record<string, any>,
    user?: AuthUser,
  ): Promise<void> {
    const ctxRow = await this.repository.findNotifyContext(id, tenantId).catch(() => null);
    // `/fail` records a result but no failed count, and the column defaults to
    // 0 — reporting "0 unit(s) failed" would be worse than the registry's
    // "Some unit(s)" fallback, so only a real count is passed.
    const failedQty = Number(inspection?.failedQuantity ?? extraFields?.quantityFailed ?? 0);
    await this.notifications.emit('qc.failed', {
      tenantId,
      warehouseId: ctxRow?.warehouseId ?? null,
      entityType: 'qc_inspection',
      entityId: id,
      data: {
        qcNumber: ctxRow?.qcNumber ?? inspection?.qcNumber,
        grnNumber: ctxRow?.grnNumber,
        warehouseName: ctxRow?.warehouseName,
        skuName: ctxRow?.skuName,
        skuCode: ctxRow?.skuCode,
        rejectedQty: Number.isFinite(failedQty) && failedQty > 0 ? failedQty : null,
        reason: extraFields?.notes ?? inspection?.notes ?? null,
        actorUserId: user?.id,
      },
    });
  }

  private async generateCode(): Promise<string> {
    const count = await this.repository.countByTenant(getCurrentTenantId());
    return `QC-${String(count + 1).padStart(3, '0')}`;
  }
}
