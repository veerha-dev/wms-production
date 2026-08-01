import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ShipmentsRepository } from './shipments.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';

const DISPATCH_STATUSES = new Set(['in_transit', 'in-transit', 'dispatched', 'delivered']);
const DELIVERED_STATUSES = new Set(['delivered']);

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private repository: ShipmentsRepository,
    private invoices: InvoicesService,
    private readonly notifications: NotificationsService,
  ) {}


  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Shipment ${id} not found`);
    return item;
  }

  async create(dto: any) {
    const shipmentNumber = dto.shipmentNumber || await this.generateCode();
    const { code, ...rest } = dto; return this.repository.create(getCurrentTenantId(), { ...rest, shipmentNumber });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Shipment ${id} not found`);
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

    // Auto-create Sales Invoice when shipment is dispatched (first time it enters in_transit or
    // a downstream status). Idempotency is enforced by a unique index on (shipment_id) where
    // type='sales'.
    const wasDispatched = DISPATCH_STATUSES.has((before.status || '').toLowerCase());
    const nowDispatched = DISPATCH_STATUSES.has(status.toLowerCase());
    if (nowDispatched && !wasDispatched) {
      try {
        const result = await this.invoices.createFromShipment(id);
        if (result.created) {
          this.logger.log(`Auto-created sales invoice ${result.invoice.invoiceNumber} for Shipment ${id}`);
        }
      } catch (err) {
        this.logger.error(`Auto-invoice from Shipment ${id} failed`, err as Error);
      }
    }

    // Delivery confirmation — raised once, on the transition into 'delivered',
    // and only after the row has actually been updated. The registry marks this
    // event batched by default; the tenant's settings decide whether it is
    // delivered at all, so the emit is unconditional here.
    const wasDelivered = DELIVERED_STATUSES.has((before.status || '').toLowerCase());
    const nowDelivered = DELIVERED_STATUSES.has(status.toLowerCase());
    if (updated && nowDelivered && !wasDelivered) {
      void this.notifications
        .emit('shipment.delivered', {
          tenantId: getCurrentTenantId(),
          warehouseId: before.warehouseId ?? null,
          entityType: 'shipment',
          entityId: id,
          data: {
            actorUserId: user?.id,
            shipmentNumber: before.shipmentNumber,
            code: before.shipmentNumber,
            courierName: before.carrier,
            customerName: before.salesOrder?.customer?.name ?? null,
            orderNumber: before.salesOrder?.soNumber ?? null,
            deliveredAt: (extraFields?.deliveredAt ?? new Date()).toString(),
          },
        })
        .catch(() => undefined);
    }

    return updated;
  }

  /** Courier confirmed delivery. Kept separate so the actor can be excluded. */
  async deliver(id: string, user?: AuthUser) {
    return this.updateStatus(id, 'delivered', { deliveredAt: new Date() }, user);
  }

  private async generateCode(): Promise<string> {
    const count = await this.repository.countByTenant(getCurrentTenantId());
    return `SHP-${String(count + 1).padStart(3, '0')}`;
  }
}
