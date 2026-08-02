import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { SkusRepository } from './skus.repository';
import { SkuBarcodeService } from './sku-barcode.service';
import { CreateSkuDto, UpdateSkuDto, QuerySkuDto, BulkCreateSkuDto, BulkUpdateSkuDto, BulkImportResultDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';




@Injectable()
export class SkusService {
  constructor(
    private repository: SkusRepository,
    private barcodes: SkuBarcodeService,
  ) {}


  async findAll(query: QuerySkuDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const sku = await this.repository.findById(getCurrentTenantId(), id);
    if (!sku) throw new NotFoundException('SKU not found');
    return sku;
  }

  async create(dto: CreateSkuDto) {
    const tenantId = getCurrentTenantId();
    let code = dto.code;
    if (!code) {
      code = await this.repository.getNextCode(tenantId);
    }

    const existing = await this.repository.findByCode(tenantId, code);
    if (existing) throw new ConflictException(`SKU code ${code} already exists`);

    // `sku_barcode_source` decides whether an EAN-13 is minted here; see
    // SkuBarcodeService.planForCreate.
    const plan = await this.barcodes.planForCreate(dto.barcode);

    // A generated barcode can still lose a race against a concurrent insert,
    // so re-draw on the unique-index violation. A user-supplied one is a hard
    // conflict — silently replacing what the operator typed would be worse.
    if (plan.generate) {
      return this.barcodes.withGeneratedBarcode(tenantId, (generated) =>
        this.repository.create(tenantId, { ...dto, code, barcode: generated }),
      );
    }

    try {
      return await this.repository.create(tenantId, { ...dto, code, barcode: plan.barcode });
    } catch (error) {
      throw this.translateBarcodeCollision(error, plan.barcode);
    }
  }

  async update(id: string, dto: UpdateSkuDto) {
    await this.findById(id);
    try {
      return await this.repository.update(getCurrentTenantId(), id, dto);
    } catch (error) {
      throw this.translateBarcodeCollision(error, dto.barcode);
    }
  }

  // ─── Barcodes ───────────────────────────────────────────────────────────────

  /**
   * Issues a fresh EAN-13 for one existing SKU, replacing whatever it had.
   * Deliberate operator action, so it runs in every `sku_barcode_source` mode.
   */
  async generateBarcode(id: string) {
    const tenantId = getCurrentTenantId();
    await this.findById(id);

    const updated = await this.barcodes.withGeneratedBarcode(tenantId, (barcode) =>
      this.repository.setBarcode(tenantId, id, barcode),
    );
    if (!updated) throw new NotFoundException('SKU not found');
    return updated;
  }

  /**
   * Fills in a barcode for every SKU that has none — the "we just turned
   * labelling on" button. SKUs that already carry a barcode (manufacturer or
   * generated) are left alone.
   */
  async backfillBarcodes(): Promise<{ generated: number; skipped: number; failed: number }> {
    const tenantId = getCurrentTenantId();
    const ids = await this.repository.findIdsMissingBarcode(tenantId);

    let generated = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const updated = await this.barcodes.withGeneratedBarcode(tenantId, (barcode) =>
          this.repository.setBarcode(tenantId, id, barcode),
        );
        if (updated) generated++;
        else failed++;
      } catch {
        // One bad row must not abort the whole backfill.
        failed++;
      }
    }

    return { generated, skipped: 0, failed };
  }

  /** Turns the unique-index violation from migration 090 into a 409. */
  private translateBarcodeCollision(error: unknown, barcode?: string | null): unknown {
    if (this.barcodes.isBarcodeCollision(error)) {
      return new ConflictException(
        `Barcode ${barcode ?? ''} is already assigned to another SKU in this tenant`.replace('  ', ' '),
      );
    }
    return error;
  }

  async delete(id: string) {
    await this.findById(id);
    // Check if SKU has active stock
    const stockCheck = await this.repository['db'].query(
      'SELECT COUNT(*) as count FROM stock_levels WHERE sku_id = $1 AND (quantity_available > 0 OR quantity_reserved > 0)',
      [id],
    );
    if (parseInt(stockCheck.rows[0].count) > 0) {
      throw new BadRequestException('Cannot delete SKU with active stock. Remove all stock first.');
    }
    return this.repository.delete(getCurrentTenantId(), id);
  }

  async bulkCreate(dto: BulkCreateSkuDto): Promise<BulkImportResultDto> {
    const result: BulkImportResultDto = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        let code = item.code;
        if (!code) {
          code = await this.repository.getNextCode(getCurrentTenantId());
        }

        const existing = await this.repository.findByCode(getCurrentTenantId(), code);
        if (existing) {
          result.errors.push({ row: i + 1, message: `SKU code ${code} already exists` });
          result.failed++;
          continue;
        }

        // Imported rows follow the same barcode policy as a single create —
        // an Excel import is the most common way a catalog arrives without
        // barcodes, so it is exactly where auto-generation has to work.
        const tenantId = getCurrentTenantId();
        const plan = await this.barcodes.planForCreate(item.barcode);
        if (plan.generate) {
          await this.barcodes.withGeneratedBarcode(tenantId, (generated) =>
            this.repository.create(tenantId, { ...item, code, barcode: generated }),
          );
        } else {
          await this.repository.create(tenantId, { ...item, code, barcode: plan.barcode });
        }
        result.created++;
      } catch (error) {
        result.errors.push({
          row: i + 1,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        result.failed++;
      }
    }

    return result;
  }

  async bulkUpdate(dto: BulkUpdateSkuDto): Promise<BulkImportResultDto> {
    const result: BulkImportResultDto = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        // Check if SKU exists
        const existing = await this.repository.findById(getCurrentTenantId(), item.id);
        if (!existing) {
          result.errors.push({
            row: i + 1,
            message: `SKU with ID ${item.id} not found`,
          });
          result.failed++;
          continue;
        }

        // Update the SKU
        await this.repository.update(getCurrentTenantId(), item.id, item);
        result.updated++;
      } catch (error) {
        result.errors.push({
          row: i + 1,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        result.failed++;
      }
    }

    return result;
  }
}
