import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TasksRepository } from './tasks.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class TasksService {
  constructor(
    private repository: TasksRepository,
    private numbering: DocumentNumberingService,
  ) {}


  async findAll(query: any, user?: AuthUser) {
    const { page = 1, limit = 50 } = query;
    // Manager: force warehouse filter to their warehouse
    const scopedQuery = user?.role === 'manager' && user.warehouseId
      ? { ...query, warehouseId: user.warehouseId }
      : query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), scopedQuery);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Task ${id} not found`);
    return item;
  }

  async create(dto: any, user?: AuthUser) {
    // Manager: enforce warehouse to their own
    if (user?.role === 'manager' && user.warehouseId) {
      if (dto.warehouseId && dto.warehouseId !== user.warehouseId) {
        throw new ForbiddenException('Manager can only create tasks for their assigned warehouse');
      }
      dto.warehouseId = user.warehouseId;
    }
    const taskNumber = dto.taskNumber || await this.generateCode();
    const { code, ...rest } = dto; return this.repository.create(getCurrentTenantId(), { ...rest, taskNumber });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Task ${id} not found`);
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

  /**
   * Atomic per-tenant counter (migration 078/089) instead of `count + 1`, which
   * re-issued a number after any delete and raced under concurrency.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'task');
  }
}
