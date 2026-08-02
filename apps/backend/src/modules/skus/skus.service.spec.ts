import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SkusService } from './skus.service';
import { SkusRepository } from './skus.repository';
import { SkuBarcodeService } from './sku-barcode.service';
import { DatabaseService } from '../../database/database.service';
import { MastersService } from '../masters/masters.service';
import { runWithTenant } from '../common/tenant.context';
import { isValidEan13 } from '../common/barcode-ean13';

/**
 * SkusService is exercised against a real SkuBarcodeService (with a mocked
 * database) so the wiring between "what the tenant configured" and "what ends
 * up in the INSERT" is covered end to end, not just per unit.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('SkusService — barcodes', () => {
  let service: SkusService;
  let repository: jest.Mocked<Partial<SkusRepository>>;
  let masters: { getBarcodeSettings: jest.Mock };
  let db: { query: jest.Mock };
  let sequence: number;

  beforeEach(async () => {
    sequence = 0;
    db = {
      query: jest.fn(async (sql: string) => {
        if (/UPDATE document_numbering/.test(sql)) return { rows: [{ issued: ++sequence }], rowCount: 1 };
        return { rows: [], rowCount: 0 }; // nothing is ever "taken"
      }),
    };
    masters = { getBarcodeSettings: jest.fn(async () => ({ skuBarcodeSource: 'both' })) };

    repository = {
      getNextCode: jest.fn(async () => 'SKU-001'),
      findByCode: jest.fn(async () => null),
      findById: jest.fn(async (_t: string, id: string) => ({ id, code: 'SKU-001' })) as any,
      create: jest.fn(async (_t: string, data: any) => ({ id: 'new-sku', ...data })) as any,
      update: jest.fn(async (_t: string, id: string, data: any) => ({ id, ...data })) as any,
      setBarcode: jest.fn(async (_t: string, id: string, barcode: string) => ({ id, barcode })) as any,
      findIdsMissingBarcode: jest.fn(async () => []),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SkusService,
        SkuBarcodeService,
        { provide: SkusRepository, useValue: repository },
        { provide: DatabaseService, useValue: db },
        { provide: MastersService, useValue: masters },
      ],
    }).compile();

    service = moduleRef.get(SkusService);
  });

  const setSource = (source: string) => masters.getBarcodeSettings.mockResolvedValue({ skuBarcodeSource: source });
  const inTenant = <T>(fn: () => Promise<T>) => runWithTenant(TENANT, fn);
  const insertedBarcode = () => (repository.create as jest.Mock).mock.calls[0][1].barcode;

  describe('create', () => {
    it("mode 'auto' — stores a generated EAN-13 even though the user supplied one", async () => {
      setSource('auto');
      await inTenant(() => service.create({ name: 'Widget', barcode: '5901234123457' } as any));

      const stored = insertedBarcode();
      expect(stored).not.toBe('5901234123457');
      expect(stored).toMatch(/^20\d{11}$/);
      expect(isValidEan13(stored)).toBe(true);
    });

    it("mode 'manufacturer' — stores null when the user supplied nothing", async () => {
      setSource('manufacturer');
      await inTenant(() => service.create({ name: 'Widget' } as any));
      expect(insertedBarcode()).toBeNull();
    });

    it("mode 'manufacturer' — stores exactly what the user supplied", async () => {
      setSource('manufacturer');
      await inTenant(() => service.create({ name: 'Widget', barcode: '5901234123457' } as any));
      expect(insertedBarcode()).toBe('5901234123457');
    });

    it("mode 'both' — respects a supplied barcode", async () => {
      setSource('both');
      await inTenant(() => service.create({ name: 'Widget', barcode: '5901234123457' } as any));
      expect(insertedBarcode()).toBe('5901234123457');
    });

    it("mode 'both' — generates when none was supplied", async () => {
      setSource('both');
      await inTenant(() => service.create({ name: 'Widget' } as any));
      expect(isValidEan13(insertedBarcode())).toBe(true);
    });

    it('burns exactly one sequence value per created SKU', async () => {
      // Deciding the policy must not itself draw a number: an earlier version
      // resolved the barcode once to decide and again to insert, silently
      // eating every other code in the tenant's sequence.
      setSource('auto');
      await inTenant(() => service.create({ name: 'Widget' } as any));
      expect(sequence).toBe(1);
      expect(insertedBarcode()).toBe('2000000000015');
    });

    it('does not touch the sequence at all when the supplied barcode is kept', async () => {
      setSource('both');
      await inTenant(() => service.create({ name: 'Widget', barcode: '5901234123457' } as any));
      expect(sequence).toBe(0);
    });

    it('turns a duplicate supplied barcode into a 409 rather than a 500', async () => {
      setSource('both');
      (repository.create as jest.Mock).mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'uniq_skus_tenant_barcode',
          detail: 'Key (tenant_id, barcode)=(...) already exists.',
        }),
      );

      await expect(
        inTenant(() => service.create({ name: 'Widget', barcode: '5901234123457' } as any)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('retries with a new code when a GENERATED barcode loses the race', async () => {
      setSource('auto');
      let attempt = 0;
      (repository.create as jest.Mock).mockImplementation(async (_t: string, data: any) => {
        if (++attempt === 1) {
          throw Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'uniq_skus_tenant_barcode',
          });
        }
        return { id: 'new-sku', ...data };
      });

      const created: any = await inTenant(() => service.create({ name: 'Widget' } as any));
      expect(attempt).toBe(2);
      expect(isValidEan13(created.barcode)).toBe(true);
    });
  });

  describe('generateBarcode', () => {
    it('issues a fresh EAN-13 regardless of the configured source', async () => {
      setSource('manufacturer');
      const updated: any = await inTenant(() => service.generateBarcode('sku-1'));
      expect(updated.barcode).toMatch(/^20\d{11}$/);
      expect(isValidEan13(updated.barcode)).toBe(true);
    });
  });

  describe('backfillBarcodes', () => {
    it('fills every SKU that has none and reports the count', async () => {
      (repository.findIdsMissingBarcode as jest.Mock).mockResolvedValue(['a', 'b', 'c']);
      const result = await inTenant(() => service.backfillBarcodes());

      expect(result).toEqual({ generated: 3, skipped: 0, failed: 0 });
      expect((repository.setBarcode as jest.Mock).mock.calls.map((c) => c[2]).every(isValidEan13)).toBe(true);
    });

    it('issues a distinct barcode per SKU', async () => {
      (repository.findIdsMissingBarcode as jest.Mock).mockResolvedValue(['a', 'b', 'c', 'd']);
      await inTenant(() => service.backfillBarcodes());

      const issued = (repository.setBarcode as jest.Mock).mock.calls.map((c) => c[2]);
      expect(new Set(issued).size).toBe(4);
    });

    it('does nothing when every SKU already has a barcode', async () => {
      (repository.findIdsMissingBarcode as jest.Mock).mockResolvedValue([]);
      await expect(inTenant(() => service.backfillBarcodes())).resolves.toEqual({
        generated: 0,
        skipped: 0,
        failed: 0,
      });
      expect(repository.setBarcode).not.toHaveBeenCalled();
    });

    it('counts a failing row without aborting the rest of the batch', async () => {
      (repository.findIdsMissingBarcode as jest.Mock).mockResolvedValue(['a', 'b', 'c']);
      (repository.setBarcode as jest.Mock).mockImplementation(async (_t: string, id: string, barcode: string) => {
        if (id === 'b') throw new Error('row vanished');
        return { id, barcode };
      });

      await expect(inTenant(() => service.backfillBarcodes())).resolves.toEqual({
        generated: 2,
        skipped: 0,
        failed: 1,
      });
    });
  });
});
