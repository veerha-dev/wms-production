import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdjustmentsRepository } from './adjustments.repository';
import { CreateAdjustmentDto, UpdateAdjustmentDto, QueryAdjustmentDto } from './dto';
import { SkusRepository } from '../skus/skus.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { NotificationsService } from '../notifications/notifications.service';

// Per workflow doc: adjustments above this threshold require Admin approval.
// Managers cannot approve their own large adjustments — must go to Admin.
const APPROVAL_THRESHOLD = 100;

interface AuthUser {
  id: string;
  role: string;
  fullName?: string;
  warehouseId?: string | null;
}

@Injectable()
export class AdjustmentsService {
  constructor(
    private repository: AdjustmentsRepository,
    private skusRepository: SkusRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryAdjustmentDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const adjustment = await this.repository.findById(getCurrentTenantId(), id);
    if (!adjustment) throw new NotFoundException('Adjustment not found');
    return adjustment;
  }

  async create(dto: CreateAdjustmentDto, user?: AuthUser) {
    let adjustmentNumber = dto.adjustmentNumber;
    if (!adjustmentNumber) {
      adjustmentNumber = await this.repository.getNextCode(getCurrentTenantId());
    }
    const sku = await this.skusRepository.findById(getCurrentTenantId(), dto.skuId);
    if (!sku) throw new NotFoundException('SKU not found');

    const requestedBy = user?.id || dto.requestedBy || null;
    const qty = Math.abs(Number(dto.quantity ?? 0));

    // Auto-approve: small admin-created adjustments under threshold can be auto-approved.
    // Larger adjustments stay pending and require admin approval per workflow doc.
    const created = await this.repository.create(getCurrentTenantId(), {
      ...dto,
      adjustmentNumber,
      skuCode: sku.code,
      skuName: sku.name,
      location: `Warehouse ${dto.warehouseId?.substring(0, 8) || 'default'}`,
      requestedBy,
    });

    // If admin creates a small adjustment, auto-approve it (admins have approval authority)
    if (user?.role === 'admin' && qty <= APPROVAL_THRESHOLD) {
      return this.repository.approve(getCurrentTenantId(), created.id, requestedBy ?? undefined);
    }

    // The row is committed and still pending → it needs an admin decision.
    // requiresAction on this event puts it in the inline approvals inbox.
    void this.notifications
      .emit('adjustment.approval_pending', {
        tenantId: getCurrentTenantId(),
        warehouseId: dto.warehouseId ?? null,
        entityType: 'stock_adjustment',
        entityId: created.id,
        data: {
          actorUserId: requestedBy,
          adjustmentNumber,
          requestedBy: user?.fullName ?? 'A user',
          quantity: dto.quantity,
          skuId: dto.skuId,
          skuCode: sku.code,
          skuName: sku.name,
          reason: dto.reason ?? null,
        },
      })
      .catch(() => undefined);

    return created;
  }

  async update(id: string, dto: UpdateAdjustmentDto) {
    const existing = await this.findById(id);
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending adjustments can be updated');
    }
    return this.repository.update(getCurrentTenantId(), id, dto);
  }

  async delete(id: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending adjustments can be deleted');
    }
    return this.repository.delete(getCurrentTenantId(), id);
  }

  async approve(id: string, user?: AuthUser) {
    const existing = await this.findById(id);
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending adjustments can be approved');
    }

    const qty = Math.abs(Number(existing.quantity ?? 0));

    // Manager cannot approve their own large adjustments — must go to Admin
    if (user?.role === 'manager') {
      if (qty > APPROVAL_THRESHOLD) {
        throw new ForbiddenException(
          `Adjustments above ${APPROVAL_THRESHOLD} units require Admin approval`,
        );
      }
      if (existing.requestedBy && existing.requestedBy === user.id) {
        throw new ForbiddenException('You cannot approve your own adjustment request');
      }
    }

    const approved = await this.repository.approve(getCurrentTenantId(), id, user?.id);

    // Outcome goes to the REQUESTER only (registry: defaultRecipients 'user').
    if (existing.requestedBy) {
      void this.notifications
        .emit('adjustment.approved', {
          tenantId: getCurrentTenantId(),
          userId: existing.requestedBy,
          warehouseId: existing.warehouseId ?? null,
          entityType: 'stock_adjustment',
          entityId: id,
          data: {
            actorUserId: user?.id ?? null,
            adjustmentNumber: existing.adjustmentNumber,
            approvedBy: user?.fullName ?? 'An admin',
          },
        })
        .catch(() => undefined);
    }

    return approved;
  }

  async reject(id: string, user?: AuthUser) {
    const existing = await this.findById(id);
    if (existing.status !== 'pending') {
      throw new BadRequestException('Only pending adjustments can be rejected');
    }

    if (user?.role === 'manager' && Math.abs(Number(existing.quantity ?? 0)) > APPROVAL_THRESHOLD) {
      throw new ForbiddenException(
        `Adjustments above ${APPROVAL_THRESHOLD} units require Admin review`,
      );
    }

    const rejected = await this.repository.reject(getCurrentTenantId(), id, user?.id);

    if (existing.requestedBy) {
      void this.notifications
        .emit('adjustment.rejected', {
          tenantId: getCurrentTenantId(),
          userId: existing.requestedBy,
          warehouseId: existing.warehouseId ?? null,
          entityType: 'stock_adjustment',
          entityId: id,
          data: {
            actorUserId: user?.id ?? null,
            adjustmentNumber: existing.adjustmentNumber,
            rejectedBy: user?.fullName ?? 'An admin',
          },
        })
        .catch(() => undefined);
    }

    return rejected;
  }
}
