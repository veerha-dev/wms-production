import { Injectable } from '@nestjs/common';
import { LABEL_BATCH_LIMIT, LabelsRepository } from './labels.repository';
import { MastersService } from '../masters/masters.service';
import { getCurrentTenantId } from '../common/tenant.context';
import { scopeWarehouseForUser } from '../common/scope-warehouse';
import { QueryLabelBinsDto, QueryLabelSkusDto } from './dto';

/*
 * ════════════════════════════════════════════════════════════════════════════
 *  LABEL ENCODING CONTRACT — printer and scanner must agree exactly
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A label is useless unless what the printer encodes is exactly what the scan
 * endpoints accept. There is one rule per label type, and both are enforced by
 * the scan endpoints today:
 *
 *  LOCATION LABEL (a bin)
 *    Encodes: the plain bin `code`, verbatim — e.g. `A-01-02`.
 *    No prefix, no URL, no JSON. `barcode_settings.location_code_type`
 *    ('qr' | 'barcode') selects the SYMBOLOGY only — the payload is the same
 *    string either way.
 *    Validated by: putaway.service.ts scanBin(), which upper-cases and
 *    compares against `bins.code`. Matching is case-insensitive; surrounding
 *    whitespace is trimmed.
 *    This is unchanged behaviour — labels already stuck to racks keep working.
 *
 *  SKU LABEL (a product)
 *    Encodes: the SKU's `barcode` when it has one, otherwise the SKU `code`.
 *    The `barcode` is an EAN-13 — either the manufacturer's or one this system
 *    generated with the GS1 internal prefix `20` (see barcode-ean13.ts).
 *    Validated by: pick-lists.service.ts scanItem(), which matches the scanned
 *    string against `skus.barcode` FIRST and falls back to `skus.code`. Both
 *    are accepted so that a label printed before a barcode was assigned still
 *    scans, and so a manufacturer's own printed EAN scans too.
 *
 * Consequences the label UI must respect:
 *  - Never encode a SKU label with anything other than the two fields above.
 *  - `GET /api/v1/labels/skus` returns `barcode: null` for SKUs that have
 *    none; those labels fall back to `code`, and the UI should offer to
 *    generate a barcode first (POST /api/v1/skus/:id/generate-barcode).
 *  - Barcodes are unique per tenant (migration 090), so a scanned barcode
 *    resolves to exactly one SKU.
 */

@Injectable()
export class LabelsService {
  constructor(
    private repository: LabelsRepository,
    private masters: MastersService,
  ) {}

  /**
   * The tenant's label/barcode preferences. Proxied from MastersService so the
   * label UI reads the same row Settings > Masters writes — one source of
   * truth, no second copy of the table logic.
   */
  async getSettings() {
    return this.masters.getBarcodeSettings();
  }

  /**
   * Location-label rows. A whole zone or rack can be selected in one call
   * ("print every label for Zone A") or an explicit list of bin ids passed.
   *
   * Capped at LABEL_BATCH_LIMIT: a print job larger than that is a mistake far
   * more often than an intent, and the browser has to lay every one of them
   * out. `meta.truncated` tells the UI when it is looking at a partial set.
   */
  async findBins(query: QueryLabelBinsDto, user?: { role: string; warehouseId?: string | null }) {
    const rows = await this.repository.findBins(getCurrentTenantId(), {
      // Managers may only print labels for their own warehouse, whatever they ask for.
      warehouseId: scopeWarehouseForUser(user as any, query.warehouseId),
      zoneId: query.zoneId,
      rackId: query.rackId,
      binIds: parseIdList(query.binIds),
    });
    return this.capped(rows);
  }

  /**
   * SKU-label rows. SKUs with no barcode are deliberately included — the UI
   * needs to see and flag them (their label falls back to the SKU code).
   *
   * Not warehouse-scoped: the SKU catalog is tenant-wide, it has no
   * warehouse_id, so a manager sees the same catalog an admin does.
   */
  async findSkus(query: QueryLabelSkusDto) {
    const rows = await this.repository.findSkus(getCurrentTenantId(), {
      skuIds: parseIdList(query.skuIds),
      category: query.category,
      search: query.search,
    });
    return this.capped(rows);
  }

  /** Trims the over-fetched row to the cap and reports whether it bit. */
  private capped<T>(rows: T[]) {
    const truncated = rows.length > LABEL_BATCH_LIMIT;
    const data = truncated ? rows.slice(0, LABEL_BATCH_LIMIT) : rows;
    return {
      data,
      meta: { count: data.length, limit: LABEL_BATCH_LIMIT, truncated },
    };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Splits a comma-separated id parameter. Non-UUID entries are dropped rather
 * than passed to Postgres, where they would raise a 22P02 and surface as a
 * 500 for what is really a malformed request.
 *
 * Returns `undefined` only when the caller passed no list at all. A list that
 * contained nothing usable yields an EMPTY array, which the repository turns
 * into "match nothing" — asking for three specific bins and getting the whole
 * warehouse back would mean thousands of wrong labels on the printer.
 */
export function parseIdList(raw?: string): string[] | undefined {
  if (raw === undefined || raw === null || raw.trim() === '') return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
}
