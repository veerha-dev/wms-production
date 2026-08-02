import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService, parseIdList } from './labels.service';
import { LABEL_BATCH_LIMIT, LabelsRepository } from './labels.repository';
import { MastersService } from '../masters/masters.service';
import { runWithTenant } from '../common/tenant.context';

const TENANT = '11111111-1111-1111-1111-111111111111';
const WAREHOUSE_A = '22222222-2222-2222-2222-222222222222';
const WAREHOUSE_B = '33333333-3333-3333-3333-333333333333';

describe('LabelsService', () => {
  let service: LabelsService;
  let repository: { findBins: jest.Mock; findSkus: jest.Mock };
  let masters: { getBarcodeSettings: jest.Mock };

  const bins = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `bin-${i}`, code: `A-01-${i}` }));

  beforeEach(async () => {
    repository = { findBins: jest.fn(async () => []), findSkus: jest.fn(async () => []) };
    masters = { getBarcodeSettings: jest.fn(async () => ({ labelSize: 'medium', skuBarcodeSource: 'both' })) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        { provide: LabelsRepository, useValue: repository },
        { provide: MastersService, useValue: masters },
      ],
    }).compile();

    service = moduleRef.get(LabelsService);
  });

  const inTenant = <T>(fn: () => Promise<T>) => runWithTenant(TENANT, fn);

  describe('getSettings', () => {
    it('proxies the masters barcode_settings row rather than reading the table again', async () => {
      await expect(inTenant(() => service.getSettings())).resolves.toEqual({
        labelSize: 'medium',
        skuBarcodeSource: 'both',
      });
      expect(masters.getBarcodeSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('findBins', () => {
    it('scopes every query to the current tenant', async () => {
      await inTenant(() => service.findBins({}, { role: 'admin' }));
      expect(repository.findBins.mock.calls[0][0]).toBe(TENANT);
    });

    it('passes zone and rack filters through — "print every label for Zone A"', async () => {
      await inTenant(() => service.findBins({ zoneId: WAREHOUSE_A, rackId: WAREHOUSE_B }, { role: 'admin' }));
      expect(repository.findBins.mock.calls[0][1]).toMatchObject({
        zoneId: WAREHOUSE_A,
        rackId: WAREHOUSE_B,
      });
    });

    it('lets an admin choose the warehouse', async () => {
      await inTenant(() => service.findBins({ warehouseId: WAREHOUSE_A }, { role: 'admin' }));
      expect(repository.findBins.mock.calls[0][1].warehouseId).toBe(WAREHOUSE_A);
    });

    it('forces a manager onto their own warehouse, whatever they asked for', async () => {
      await inTenant(() =>
        service.findBins({ warehouseId: WAREHOUSE_A }, { role: 'manager', warehouseId: WAREHOUSE_B }),
      );
      expect(repository.findBins.mock.calls[0][1].warehouseId).toBe(WAREHOUSE_B);
    });

    it('applies the manager warehouse even when none was requested', async () => {
      await inTenant(() => service.findBins({}, { role: 'manager', warehouseId: WAREHOUSE_B }));
      expect(repository.findBins.mock.calls[0][1].warehouseId).toBe(WAREHOUSE_B);
    });

    it('caps the batch and says so in meta', async () => {
      repository.findBins.mockResolvedValue(bins(LABEL_BATCH_LIMIT + 1));
      const result = await inTenant(() => service.findBins({}, { role: 'admin' }));

      expect(result.data).toHaveLength(LABEL_BATCH_LIMIT);
      expect(result.meta).toEqual({ count: LABEL_BATCH_LIMIT, limit: LABEL_BATCH_LIMIT, truncated: true });
    });

    it('does not claim truncation when the result exactly fills the cap', async () => {
      repository.findBins.mockResolvedValue(bins(LABEL_BATCH_LIMIT));
      const result = await inTenant(() => service.findBins({}, { role: 'admin' }));

      expect(result.data).toHaveLength(LABEL_BATCH_LIMIT);
      expect(result.meta.truncated).toBe(false);
    });

    it('reports the real count for a small batch', async () => {
      repository.findBins.mockResolvedValue(bins(3));
      const result = await inTenant(() => service.findBins({}, { role: 'admin' }));
      expect(result.meta).toEqual({ count: 3, limit: LABEL_BATCH_LIMIT, truncated: false });
    });
  });

  describe('findSkus', () => {
    it('passes category and search through and stays tenant-scoped', async () => {
      await inTenant(() => service.findSkus({ category: 'fmcg', search: 'widget' }));
      expect(repository.findSkus.mock.calls[0][0]).toBe(TENANT);
      expect(repository.findSkus.mock.calls[0][1]).toMatchObject({ category: 'fmcg', search: 'widget' });
    });

    it('keeps SKUs with no barcode so the UI can flag them', async () => {
      repository.findSkus.mockResolvedValue([
        { id: 'a', code: 'SKU-001', barcode: '2000000000015' },
        { id: 'b', code: 'SKU-002', barcode: null },
      ]);
      const result = await inTenant(() => service.findSkus({}));
      expect(result.data).toHaveLength(2);
      expect(result.data[1]).toMatchObject({ code: 'SKU-002', barcode: null });
    });
  });
});

describe('parseIdList', () => {
  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';

  it('returns undefined — "no filter" — when nothing was passed', () => {
    expect(parseIdList(undefined)).toBeUndefined();
    expect(parseIdList('')).toBeUndefined();
    expect(parseIdList('   ')).toBeUndefined();
  });

  it('splits and trims a comma-separated list', () => {
    expect(parseIdList(`${A}, ${B}`)).toEqual([A, B]);
  });

  it('drops entries that are not UUIDs instead of handing them to Postgres', () => {
    expect(parseIdList(`${A},not-a-uuid,${B}`)).toEqual([A, B]);
  });

  it('returns an empty list — "match nothing" — when every entry was junk', () => {
    // Falling back to "no filter" here would print every label in the
    // warehouse when the user asked for three specific bins.
    expect(parseIdList('junk,more-junk')).toEqual([]);
  });

  it('accepts upper-case UUIDs', () => {
    expect(parseIdList(A.toUpperCase())).toEqual([A.toUpperCase()]);
  });
});
