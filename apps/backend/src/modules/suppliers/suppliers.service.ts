import { Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';




@Injectable()
export class SuppliersService {
  constructor(
    private repository: SuppliersRepository,
    private numbering: DocumentNumberingService,
  ) {}


  async findAll(query: any) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(id, getCurrentTenantId());
    if (!item) throw new NotFoundException(`Supplier ${id} not found`);
    return item;
  }

  async findById(id: string) { return this.findOne(id); }

  async create(dto: any) {
    const code = dto.code || await this.generateCode();
    return this.repository.create(getCurrentTenantId(), { ...dto, code });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.repository.update(id, getCurrentTenantId(), dto);
  }

  async remove(id: string) {
    const deleted = await this.repository.delete(id, getCurrentTenantId());
    if (!deleted) throw new NotFoundException(`Supplier ${id} not found`);
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

  async submit(id: string) { return this.updateStatus(id, 'submitted'); }
  async approve(id: string, approvedBy?: string) { return this.updateStatus(id, 'approved', { approvedBy, approvedAt: new Date() }); }
  async cancel(id: string) { return this.updateStatus(id, 'cancelled'); }

  /**
   * Issued by the tenant's configurable sequence (Settings > Document
   * Numbering) instead of row count, which ignored the configured
   * prefix/length and collided after a delete. Migration 078 backfills
   * the counter past existing documents, so this is safe on upgrades.
   */
  private async generateCode(): Promise<string> {
    return this.numbering.nextNumber(getCurrentTenantId(), 'supplier');
  }
}
