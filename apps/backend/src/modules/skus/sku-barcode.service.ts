import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MastersService } from '../masters/masters.service';
import { buildInternalEan13 } from '../common/barcode-ean13';

/** The three modes of `barcode_settings.sku_barcode_source`. */
export type SkuBarcodeSource = 'manufacturer' | 'auto' | 'both';

/**
 * Counter row reused from the `document_numbering` table (migration 078).
 * It is deliberately NOT part of DOCUMENT_TYPES, so it never shows up as an
 * editable row in Settings > Masters > Document Numbering — only `next_number`
 * is read here, and `prefix`/`number_length` are ignored, so even a manual
 * poke at the row cannot change the shape of an issued EAN-13.
 */
const BARCODE_DOC_TYPE = 'sku_barcode';

/** Fresh candidates tried before giving up when barcodes keep colliding. */
const MAX_GENERATION_ATTEMPTS = 10;

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Issues EAN-13 barcodes for SKUs.
 *
 * The sequence is advanced with a single atomic `UPDATE ... RETURNING`, so two
 * concurrent creates can never be handed the same number — a `SELECT max()+1`
 * or a row count would both race, and a row count would additionally re-issue
 * numbers after a delete.
 *
 * The atomic counter is the fast path, not the guarantee: the guarantee is the
 * partial unique index `uniq_skus_tenant_barcode` (migration 090). A code can
 * still be taken if a user typed an internally-shaped barcode by hand or if a
 * counter row was reset, so generation retries on collision.
 */
@Injectable()
export class SkuBarcodeService {
  private readonly logger = new Logger(SkuBarcodeService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly masters: MastersService,
  ) {}

  /** The tenant's configured source mode; `both` when unset. */
  async getSource(): Promise<SkuBarcodeSource> {
    const settings = await this.masters.getBarcodeSettings();
    const source = settings?.skuBarcodeSource;
    return source === 'manufacturer' || source === 'auto' || source === 'both' ? source : 'both';
  }

  /**
   * Decides what a newly created SKU's barcode should be, honouring
   * `barcode_settings.sku_barcode_source`:
   *
   *  - `manufacturer` — never auto-generate. Whatever the user supplied wins,
   *    including nothing at all.
   *  - `auto`         — always auto-generate; a supplied value is ignored, so
   *    every SKU in the tenant carries a code this system controls.
   *  - `both`         — use the supplied value when there is one, otherwise
   *    auto-generate. This is the default.
   *
   * Returns the DECISION, not a code: the counter is only touched once the
   * caller is actually ready to insert (see `withGeneratedBarcode`), so a
   * create never burns two sequence values for one row.
   */
  async planForCreate(supplied?: string | null): Promise<{ generate: boolean; barcode: string | null }> {
    const clean = (typeof supplied === 'string' ? supplied.trim() : '') || null;
    const source = await this.getSource();

    if (source === 'manufacturer') return { generate: false, barcode: clean };
    if (source === 'auto') return { generate: true, barcode: null };
    return clean ? { generate: false, barcode: clean } : { generate: true, barcode: null };
  }

  /**
   * `planForCreate` resolved all the way to a value. Convenience for callers
   * that just want the barcode and accept issuing it eagerly.
   */
  async resolveForCreate(tenantId: string, supplied?: string | null): Promise<string | null> {
    const plan = await this.planForCreate(supplied);
    return plan.generate ? this.generate(tenantId) : plan.barcode;
  }

  /**
   * Issues the next unused EAN-13 for a tenant.
   *
   * Explicit operator actions (the per-SKU regenerate endpoint and the
   * backfill) call this directly: `sku_barcode_source` governs what happens
   * automatically on create, it is not a lock on deliberate admin actions.
   */
  async generate(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const candidate = buildInternalEan13(await this.nextSequence(tenantId));
      if (!(await this.isTaken(tenantId, candidate))) return candidate;
      this.logger.warn(`Generated barcode ${candidate} is already in use; drawing another`);
    }

    throw new InternalServerErrorException(
      `Could not issue a unique SKU barcode after ${MAX_GENERATION_ATTEMPTS} attempts`,
    );
  }

  /**
   * Runs `write` with a freshly generated barcode, retrying with a new one
   * when the database rejects it on `uniq_skus_tenant_barcode`. The pre-check
   * inside `generate()` is check-then-act and so racy by construction; this
   * closes the window by reacting to the index itself.
   */
  async withGeneratedBarcode<T>(tenantId: string, write: (barcode: string) => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const barcode = await this.generate(tenantId);
      try {
        return await write(barcode);
      } catch (error) {
        if (!this.isBarcodeCollision(error)) throw error;
        lastError = error;
        this.logger.warn(`Barcode ${barcode} lost a race on insert; retrying with a new one`);
      }
    }

    throw new InternalServerErrorException(
      `Could not persist a unique SKU barcode after ${MAX_GENERATION_ATTEMPTS} attempts: ${
        lastError instanceof Error ? lastError.message : 'unknown error'
      }`,
    );
  }

  /** True when the error is a unique violation on the SKU barcode index. */
  isBarcodeCollision(error: unknown): boolean {
    const err = error as { code?: string; constraint?: string; detail?: string } | undefined;
    if (err?.code !== PG_UNIQUE_VIOLATION) return false;
    const marker = `${err.constraint ?? ''} ${err.detail ?? ''}`;
    return marker.includes('barcode');
  }

  /**
   * Atomically advances and returns the tenant's barcode sequence value.
   * `UPDATE ... RETURNING next_number - 1` hands each caller its own value
   * even under concurrency.
   */
  private async nextSequence(tenantId: string): Promise<number> {
    await this.db.query(
      `INSERT INTO document_numbering (tenant_id, doc_type, prefix, number_length)
       VALUES ($1, $2, '', 10)
       ON CONFLICT (tenant_id, doc_type) DO NOTHING`,
      [tenantId, BARCODE_DOC_TYPE],
    );

    const result = await this.db.query(
      `UPDATE document_numbering
          SET next_number = next_number + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND doc_type = $2
        RETURNING next_number - 1 AS issued`,
      [tenantId, BARCODE_DOC_TYPE],
    );

    const issued = result.rows[0]?.issued;
    if (issued === undefined || issued === null) {
      throw new InternalServerErrorException(
        'Could not issue a SKU barcode: the barcode sequence row is missing for this tenant',
      );
    }
    return Number(issued);
  }

  private async isTaken(tenantId: string, barcode: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM skus WHERE tenant_id = $1 AND barcode = $2 LIMIT 1`,
      [tenantId, barcode],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
