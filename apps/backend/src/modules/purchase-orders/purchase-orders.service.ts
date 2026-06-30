import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { getCurrentTenantId } from '../common/tenant.context';

interface AuthUser {
  id: string;
  role: string;
  warehouseId?: string | null;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private repository: PurchaseOrdersRepository) {}

  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    return item;
  }

  async findById(id: string) { return this.findOne(id); }

  async create(dto: any, user?: AuthUser) {
    const poNumber = dto.poNumber || await this.generateCode();
    const { code, ...rest } = dto;
    const createdBy = user?.id || null;
    return this.repository.create(getCurrentTenantId(), { ...rest, poNumber, createdBy });
  }

  async update(id: string, dto: any) {
    const existing = await this.findOne(id);
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new BadRequestException('Only draft or rejected purchase orders can be updated');
    }
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new BadRequestException('Only draft or rejected purchase orders can be deleted');
    }
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`PurchaseOrder ${id} not found`);
  }

  async delete(id: string) { return this.remove(id); }

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

  async submit(id: string, user?: AuthUser) {
    const po = await this.findOne(id);
    if (po.status !== 'draft' && po.status !== 'rejected') {
      throw new BadRequestException('Only draft or rejected purchase orders can be submitted');
    }

    // Auto-approve: If creator is Admin, auto-approve
    if (user?.role === 'admin') {
      return this.approveOrder(id, user);
    }

    // Check approval rules for threshold
    const tenantId = getCurrentTenantId();
    const rule = await this.repository.getApprovalRule(tenantId, 'purchase_orders');
    
    const calculatedTotal = Number(po.calculated_total || po.total_amount || 0);

    if (rule && rule.isActive) {
      if (calculatedTotal <= rule.thresholdAmount) {
        // Auto-approve as it's below the threshold
        return this.approveOrder(id, { id: 'system', role: 'admin' });
      }
    }

    // Otherwise, route to Admin (Submitted status)
    return this.updateStatus(id, 'submitted', { rejectionReason: null });
  }

  private async approveOrder(id: string, user?: { id: string; role: string }) {
    return this.updateStatus(id, 'approved', {
      approvedBy: user?.id || null,
      approvedAt: new Date(),
      rejectionReason: null
    });
  }

  async approve(id: string, user?: AuthUser) {
    const po = await this.findOne(id);
    if (po.status !== 'submitted') {
      throw new BadRequestException('Only submitted purchase orders can be approved');
    }
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Only administrators can approve purchase orders');
    }
    return this.approveOrder(id, user);
  }

  async reject(id: string, reason: string, user?: AuthUser) {
    const po = await this.findOne(id);
    if (po.status !== 'submitted') {
      throw new BadRequestException('Only submitted purchase orders can be rejected');
    }
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Only administrators can reject purchase orders');
    }
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.updateStatus(id, 'draft', {
      rejectionReason: reason,
      approvedBy: null,
      approvedAt: null,
    });
  }

  async recall(id: string, user?: AuthUser) {
    const po = await this.findOne(id);
    if (po.status !== 'submitted') {
      throw new BadRequestException('Only submitted purchase orders can be recalled');
    }
    if (user?.role === 'manager' && po.created_by !== user.id) {
      throw new ForbiddenException('You can only recall purchase orders created by you');
    }
    return this.updateStatus(id, 'draft', {
      rejectionReason: null,
      approvedBy: null,
      approvedAt: null,
    });
  }

  async cancel(id: string) {
    return this.updateStatus(id, 'cancelled');
  }

  private async generateCode(): Promise<string> {
    const count = await this.repository.countByTenant(getCurrentTenantId());
    return `PO-${String(count + 1).padStart(3, '0')}`;
  }
}
