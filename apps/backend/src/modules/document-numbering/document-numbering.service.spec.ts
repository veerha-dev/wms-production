import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { DocumentNumberingService, DocumentType } from './document-numbering.service';

/**
 * Document numbers appear on legal documents, so the formatting contract
 * (prefix + zero-padded counter) is worth pinning. The database is mocked:
 * these tests cover the pure formatting and the per-type prefix defaults, not
 * the atomicity of the UPDATE.
 */

interface Issued {
  prefix: string;
  issued: number;
  number_length: number;
}

describe('DocumentNumberingService', () => {
  let service: DocumentNumberingService;
  let db: { query: jest.Mock };

  /**
   * Three statements run per call: the ON CONFLICT seed, the yearly reset, and
   * the atomic increment. Only the last one returns a row.
   */
  const stubCounter = (row: Issued) => {
    db.query.mockImplementation(async (sql: string) => {
      if (/UPDATE document_numbering\s+SET next_number = next_number \+ 1/.test(sql)) {
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  };

  const sqlOf = (index: number): string => db.query.mock.calls[index][0] as string;
  const paramsOf = (index: number): any[] => db.query.mock.calls[index][1] as any[];

  beforeEach(async () => {
    db = { query: jest.fn() };
    stubCounter({ prefix: 'CUST-', issued: 1, number_length: 3 });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [DocumentNumberingService, { provide: DatabaseService, useValue: db }],
    }).compile();

    service = moduleRef.get(DocumentNumberingService);
  });

  // ────────────────────────────────────────────────────────── formatting ─────

  describe('formatting', () => {
    it('pads to the configured width — CUST-001', async () => {
      stubCounter({ prefix: 'CUST-', issued: 1, number_length: 3 });
      await expect(service.nextNumber('t1', 'customer')).resolves.toBe('CUST-001');
    });

    it('honours a custom prefix and width — ORD/00002', async () => {
      stubCounter({ prefix: 'ORD/', issued: 2, number_length: 5 });
      await expect(service.nextNumber('t1', 'sales_order')).resolves.toBe('ORD/00002');
    });

    it.each([
      [1, 3, 'X-001'],
      [9, 3, 'X-009'],
      [10, 3, 'X-010'],
      [99, 3, 'X-099'],
      [100, 3, 'X-100'],
      [1, 5, 'X-00001'],
      [12345, 5, 'X-12345'],
      [7, 6, 'X-000007'],
      [1, 1, 'X-1'],
    ])('issues %i at width %i as %s', async (issued, length, expected) => {
      stubCounter({ prefix: 'X-', issued, number_length: length });
      await expect(service.nextNumber('t1', 'customer')).resolves.toBe(expected);
    });

    it('never truncates a counter that has outgrown its width', async () => {
      stubCounter({ prefix: 'CUST-', issued: 12345, number_length: 3 });
      await expect(service.nextNumber('t1', 'customer')).resolves.toBe('CUST-12345');
    });

    it('applies no padding at width 0', async () => {
      stubCounter({ prefix: 'CUST-', issued: 42, number_length: 0 });
      await expect(service.nextNumber('t1', 'customer')).resolves.toBe('CUST-42');
    });

    it('accepts an empty prefix', async () => {
      stubCounter({ prefix: '', issued: 7, number_length: 4 });
      await expect(service.nextNumber('t1', 'customer')).resolves.toBe('0007');
    });

    it('preserves a prefix separator that is not a hyphen', async () => {
      stubCounter({ prefix: 'INV/2026/', issued: 3, number_length: 4 });
      await expect(service.nextNumber('t1', 'invoice')).resolves.toBe('INV/2026/0003');
    });

    it('returns the number the UPDATE issued, not the stored next value', async () => {
      // The SQL returns `next_number - 1 AS issued` after incrementing.
      stubCounter({ prefix: 'PO-', issued: 11, number_length: 3 });
      await expect(service.nextNumber('t1', 'purchase_order')).resolves.toBe('PO-011');
    });

    it('produces a number with no whitespace', async () => {
      stubCounter({ prefix: 'CUST-', issued: 1, number_length: 3 });
      const value = await service.nextNumber('t1', 'customer');
      expect(value).toBe(value.trim());
      expect(value).not.toMatch(/\s/);
    });
  });

  // ──────────────────────────────────────────────────── default prefixes ─────

  describe('default prefixes', () => {
    const expected: Array<[DocumentType, string]> = [
      ['customer', 'CUST-'],
      ['supplier', 'SUP-'],
      ['purchase_order', 'PO-'],
      ['sales_order', 'SO-'],
      ['grn', 'GRN-'],
      ['pick_list', 'PL-'],
      ['shipment', 'SHP-'],
      ['invoice', 'INV-'],
      ['transfer', 'TRF-'],
      ['cycle_count', 'CC-'],
      // PA-, not PUT-: PutawayService has always issued PA-001 and migration
      // 089 reconciled the catalog to the numbers that exist in live data.
      ['putaway', 'PA-'],
      ['return', 'RET-'],
      ['task', 'TSK-'],
    ];

    it.each(expected)('seeds %s with prefix %s', async (docType, prefix) => {
      await service.nextNumber('t1', docType);
      // First statement is the ON CONFLICT DO NOTHING seed.
      expect(sqlOf(0)).toContain('INSERT INTO document_numbering');
      expect(paramsOf(0)).toEqual(['t1', docType, prefix]);
    });

    it('every document type has a distinct prefix', () => {
      const prefixes = expected.map(([, p]) => p);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    it('falls back to DOC- for an unknown document type', async () => {
      await service.nextNumber('t1', 'not_a_real_type' as DocumentType);
      expect(paramsOf(0)[2]).toBe('DOC-');
    });

    it('formats an unknown document type with the fallback prefix', async () => {
      stubCounter({ prefix: 'DOC-', issued: 5, number_length: 3 });
      await expect(service.nextNumber('t1', 'not_a_real_type' as DocumentType)).resolves.toBe(
        'DOC-005',
      );
    });

    it('seeds a default width of 3', async () => {
      await service.nextNumber('t1', 'customer');
      expect(sqlOf(0)).toContain('VALUES ($1, $2, $3, 3)');
    });

    it('never overwrites an existing counter row', async () => {
      await service.nextNumber('t1', 'customer');
      expect(sqlOf(0)).toContain('ON CONFLICT (tenant_id, doc_type) DO NOTHING');
    });
  });

  // ─────────────────────────────────────────────────────── tenant scoping ────

  describe('tenant and concurrency scoping', () => {
    it('scopes every statement to the calling tenant', async () => {
      await service.nextNumber('tenant-xyz', 'customer');
      for (const call of db.query.mock.calls) {
        expect(call[1][0]).toBe('tenant-xyz');
      }
    });

    it('scopes the increment to the tenant and doc type', async () => {
      await service.nextNumber('tenant-xyz', 'grn');
      expect(paramsOf(2)).toEqual(['tenant-xyz', 'grn']);
      expect(sqlOf(2)).toContain('WHERE tenant_id = $1 AND doc_type = $2');
    });

    it('increments and reads in one atomic UPDATE ... RETURNING', async () => {
      await service.nextNumber('t1', 'customer');
      const sql = sqlOf(2);
      expect(sql).toContain('SET next_number = next_number + 1');
      expect(sql).toContain('RETURNING prefix, next_number - 1 AS issued, number_length');
      // No SELECT-then-UPDATE — that is the race this service exists to remove.
      expect(sql).not.toMatch(/SELECT/i);
    });

    it('runs seed, then yearly reset, then increment — in that order', async () => {
      await service.nextNumber('t1', 'customer');
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(sqlOf(0)).toContain('INSERT INTO document_numbering');
      expect(sqlOf(1)).toContain('SET next_number = 1');
      expect(sqlOf(1)).toContain('reset_yearly = true');
      expect(sqlOf(2)).toContain('SET next_number = next_number + 1');
    });

    it('only resets a counter that has not already reset this year', async () => {
      await service.nextNumber('t1', 'customer');
      expect(sqlOf(1)).toContain("COALESCE(last_reset_year, 0) <> EXTRACT(YEAR FROM NOW())::int");
    });

    it('issues sequential numbers across successive calls', async () => {
      const results: string[] = [];
      for (const issued of [1, 2, 3]) {
        stubCounter({ prefix: 'CUST-', issued, number_length: 3 });
        results.push(await service.nextNumber('t1', 'customer'));
      }
      expect(results).toEqual(['CUST-001', 'CUST-002', 'CUST-003']);
    });
  });
});
