import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MastersRepository } from './masters.repository';
import { DOCUMENT_TYPE_KEYS, MASTERS_REGISTRY, MasterSection } from './masters.registry';
import { getCurrentTenantId } from '../common/tenant.context';

@Injectable()
export class MastersService {
  constructor(private repository: MastersRepository) {}

  async list(section: MasterSection, query: Record<string, any> = {}) {
    return this.repository.findAll(getCurrentTenantId(), section, query);
  }

  async findOne(section: MasterSection, id: string) {
    const row = await this.repository.findById(getCurrentTenantId(), section, id);
    if (!row) {
      throw new NotFoundException(`${MASTERS_REGISTRY[section].label} ${id} not found`);
    }
    return row;
  }

  async create(section: MasterSection, dto: Record<string, any>) {
    const tenantId = getCurrentTenantId();
    const cfg = MASTERS_REGISTRY[section];
    const codeKey = this.codeKey(section);

    const code = dto[codeKey]
      ? String(dto[codeKey]).trim().toUpperCase()
      : await this.generateCode(tenantId, section, dto);

    const scope = this.scopeOf(section, dto);
    const clash = await this.repository.findByCode(tenantId, section, code, scope);
    if (clash) {
      throw new ConflictException(`${cfg.label} "${code}" already exists`);
    }

    return this.repository.create(tenantId, section, { ...dto, [codeKey]: code });
  }

  async update(section: MasterSection, id: string, dto: Record<string, any>) {
    const tenantId = getCurrentTenantId();
    const cfg = MASTERS_REGISTRY[section];
    const codeKey = this.codeKey(section);
    const existing = await this.findOne(section, id);

    const patch = { ...dto };
    if (patch[codeKey] !== undefined) {
      patch[codeKey] = String(patch[codeKey]).trim().toUpperCase();
      const scope = this.scopeOf(section, { ...existing, ...patch });
      const clash = await this.repository.findByCode(tenantId, section, patch[codeKey], scope);
      if (clash && clash.id !== id) {
        throw new ConflictException(`${cfg.label} "${patch[codeKey]}" already exists`);
      }
    }

    return this.repository.update(tenantId, section, id, patch);
  }

  /** Soft delete — status becomes 'inactive'. */
  async deactivate(section: MasterSection, id: string) {
    await this.findOne(section, id);
    return this.repository.deactivate(getCurrentTenantId(), section, id);
  }

  // ─── Document numbering ─────────────────────────────────────────────────────

  async listDocumentNumbering() {
    return this.repository.listDocumentNumbering(getCurrentTenantId());
  }

  async updateDocumentNumbering(docType: string, dto: Record<string, any>) {
    if (!DOCUMENT_TYPE_KEYS.includes(docType)) {
      throw new BadRequestException(
        `Unknown document type "${docType}". Expected one of: ${DOCUMENT_TYPE_KEYS.join(', ')}`,
      );
    }
    return this.repository.updateDocumentNumbering(getCurrentTenantId(), docType, dto);
  }

  // ─── Barcode settings singleton ─────────────────────────────────────────────

  async getBarcodeSettings() {
    return this.repository.getBarcodeSettings(getCurrentTenantId());
  }

  async updateBarcodeSettings(dto: Record<string, any>) {
    return this.repository.updateBarcodeSettings(getCurrentTenantId(), dto);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** DTO key that carries the business code for this section. */
  private codeKey(section: MasterSection): string {
    const cfg = MASTERS_REGISTRY[section];
    const entry = Object.entries(cfg.columns).find(([, col]) => col === cfg.codeColumn);
    return entry ? entry[0] : 'code';
  }

  private scopeOf(section: MasterSection, source: Record<string, any>): Record<string, any> {
    const cfg = MASTERS_REGISTRY[section];
    const scope: Record<string, any> = {};
    for (const key of cfg.scopeColumns) scope[key] = source[key];
    return scope;
  }

  private async generateCode(
    tenantId: string,
    section: MasterSection,
    dto: Record<string, any>,
  ): Promise<string> {
    const cfg = MASTERS_REGISTRY[section];
    const slug = String(dto[cfg.codeSourceKey] ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
    const base = slug || cfg.codePrefix;
    const scope = this.scopeOf(section, dto);

    let candidate = base;
    let n = 1;
    // Bounded probe — the composite unique index remains the real guard.
    while (await this.repository.findByCode(tenantId, section, candidate, scope)) {
      n++;
      candidate = `${base}_${n}`;
      if (n > 100) break;
    }
    return candidate;
  }
}
