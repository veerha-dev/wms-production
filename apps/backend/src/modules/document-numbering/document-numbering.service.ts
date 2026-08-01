import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export type DocumentType =
  | 'customer'
  | 'supplier'
  | 'purchase_order'
  | 'sales_order'
  | 'grn'
  | 'pick_list'
  | 'shipment'
  | 'invoice'
  | 'transfer'
  | 'cycle_count'
  | 'putaway'
  | 'return'
  | 'task';

const DEFAULT_PREFIXES: Record<DocumentType, string> = {
  customer: 'CUST-',
  supplier: 'SUP-',
  purchase_order: 'PO-',
  sales_order: 'SO-',
  grn: 'GRN-',
  pick_list: 'PL-',
  shipment: 'SHP-',
  invoice: 'INV-',
  transfer: 'TRF-',
  cycle_count: 'CC-',
  // `PA-`, not `PUT-`: PutawayService has always emitted PA-001, so existing
  // putaway_tasks rows carry that prefix. Migration 089 realigns the seeded
  // catalog rows to match rather than splitting live data across two prefixes.
  putaway: 'PA-',
  return: 'RET-',
  task: 'TSK-',
};

/**
 * Issues the next document number for a tenant.
 *
 * The counter is incremented with a single atomic UPDATE ... RETURNING, so
 * concurrent callers can never receive the same number — unlike the
 * count-based `PREFIX-{rowCount + 1}` generators this replaces, which both
 * collide after a delete and race under load.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(private readonly db: DatabaseService) {}

  async nextNumber(tenantId: string, docType: DocumentType): Promise<string> {
    await this.ensureRow(tenantId, docType);
    await this.applyYearlyReset(tenantId, docType);

    const result = await this.db.query(
      `UPDATE document_numbering
          SET next_number = next_number + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND doc_type = $2
        RETURNING prefix, next_number - 1 AS issued, number_length`,
      [tenantId, docType],
    );

    const row = result.rows[0];
    if (!row) {
      // The counter row vanished between ensureRow and here (concurrent delete,
      // or a rolled-back seed). Fail loudly rather than throwing a TypeError.
      throw new InternalServerErrorException(
        `Could not issue a ${docType} number: no document_numbering row for this tenant`,
      );
    }
    return this.format(row.prefix, row.issued, row.number_length);
  }

  private format(prefix: string, value: number, length: number): string {
    return `${prefix}${String(value).padStart(length, '0')}`;
  }

  private async ensureRow(tenantId: string, docType: DocumentType): Promise<void> {
    await this.db.query(
      `INSERT INTO document_numbering (tenant_id, doc_type, prefix, number_length)
       VALUES ($1, $2, $3, 3)
       ON CONFLICT (tenant_id, doc_type) DO NOTHING`,
      [tenantId, docType, DEFAULT_PREFIXES[docType] ?? 'DOC-'],
    );
  }

  /** Restarts the counter at 1 the first time a number is issued in a new year. */
  private async applyYearlyReset(tenantId: string, docType: DocumentType): Promise<void> {
    await this.db.query(
      `UPDATE document_numbering
          SET next_number = 1, last_reset_year = EXTRACT(YEAR FROM NOW())::int, updated_at = NOW()
        WHERE tenant_id = $1
          AND doc_type = $2
          AND reset_yearly = true
          AND COALESCE(last_reset_year, 0) <> EXTRACT(YEAR FROM NOW())::int`,
      [tenantId, docType],
    );
  }
}
