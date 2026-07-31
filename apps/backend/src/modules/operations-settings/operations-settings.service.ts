import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  OperationsSettingsRepository,
  OperationsResource,
} from './operations-settings.repository';
import { getCurrentTenantId } from '../common/tenant.context';

export interface RequestUser {
  id: string;
  role: string;
  warehouseId?: string | null;
}

const RESOURCE_LABEL: Record<OperationsResource, string> = {
  shifts: 'Shift',
  'dock-doors': 'Dock door',
  'packing-stations': 'Packing station',
  equipment: 'Equipment',
};

const CODE_PREFIX: Record<OperationsResource, string> = {
  shifts: 'SHIFT',
  'dock-doors': 'DOCK',
  'packing-stations': 'PACK',
  equipment: 'EQP',
};

@Injectable()
export class OperationsSettingsService {
  constructor(private repository: OperationsSettingsRepository) {}

  /**
   * A manager may only manage the warehouse they are assigned to; an admin may
   * manage any warehouse in the tenant. Reads are open to any authenticated
   * user (the controller does not call this for GETs).
   */
  private assertWarehouseWriteAccess(user: RequestUser, warehouseId: string): void {
    if (user?.role === 'admin') return;
    if (user?.role === 'manager') {
      if (user.warehouseId && user.warehouseId === warehouseId) return;
      throw new ForbiddenException(
        'Managers can only change operations settings for their own warehouse',
      );
    }
    throw new ForbiddenException('Insufficient permissions to change operations settings');
  }

  private async assertWarehouse(tenantId: string, warehouseId: string): Promise<void> {
    const exists = await this.repository.warehouseExists(tenantId, warehouseId);
    if (!exists) throw new NotFoundException(`Warehouse ${warehouseId} not found`);
  }

  async list(warehouseId: string, resource: OperationsResource, query: any = {}) {
    const tenantId = getCurrentTenantId();
    await this.assertWarehouse(tenantId, warehouseId);
    return this.repository.findAll(tenantId, warehouseId, resource, query);
  }

  async findOne(warehouseId: string, resource: OperationsResource, id: string) {
    const tenantId = getCurrentTenantId();
    const row = await this.repository.findById(tenantId, warehouseId, resource, id);
    if (!row) throw new NotFoundException(`${RESOURCE_LABEL[resource]} ${id} not found`);
    return row;
  }

  async create(
    user: RequestUser,
    warehouseId: string,
    resource: OperationsResource,
    dto: Record<string, any>,
  ) {
    const tenantId = getCurrentTenantId();
    this.assertWarehouseWriteAccess(user, warehouseId);
    await this.assertWarehouse(tenantId, warehouseId);

    const code = dto.code
      ? String(dto.code).trim().toUpperCase()
      : await this.generateCode(tenantId, warehouseId, resource, dto.name);

    const clash = await this.repository.findByCode(tenantId, warehouseId, resource, code);
    if (clash) {
      throw new ConflictException(
        `${RESOURCE_LABEL[resource]} code "${code}" already exists in this warehouse`,
      );
    }

    return this.repository.create(tenantId, warehouseId, resource, { ...dto, code });
  }

  async update(
    user: RequestUser,
    warehouseId: string,
    resource: OperationsResource,
    id: string,
    dto: Record<string, any>,
  ) {
    const tenantId = getCurrentTenantId();
    this.assertWarehouseWriteAccess(user, warehouseId);
    await this.findOne(warehouseId, resource, id);

    const patch = { ...dto };
    if (patch.code !== undefined) {
      patch.code = String(patch.code).trim().toUpperCase();
      const clash = await this.repository.findByCode(tenantId, warehouseId, resource, patch.code);
      if (clash && clash.id !== id) {
        throw new ConflictException(
          `${RESOURCE_LABEL[resource]} code "${patch.code}" already exists in this warehouse`,
        );
      }
    }

    return this.repository.update(tenantId, warehouseId, resource, id, patch);
  }

  /** Soft delete — sets status to 'inactive'. */
  async deactivate(user: RequestUser, warehouseId: string, resource: OperationsResource, id: string) {
    const tenantId = getCurrentTenantId();
    this.assertWarehouseWriteAccess(user, warehouseId);
    await this.findOne(warehouseId, resource, id);
    return this.repository.deactivate(tenantId, warehouseId, resource, id);
  }

  private async generateCode(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    name?: string,
  ): Promise<string> {
    const slug = (name || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
    const base = slug || CODE_PREFIX[resource];

    let candidate = base;
    let n = 1;
    // Bounded probe — the composite unique index is still the real guard.
    while (await this.repository.findByCode(tenantId, warehouseId, resource, candidate)) {
      n++;
      candidate = `${base}-${n}`;
      if (n > 100) break;
    }
    return candidate;
  }
}
