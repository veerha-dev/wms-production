import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { MastersService } from '../masters/masters.service';
import { SkuBarcodeService, SkuBarcodeSource } from './sku-barcode.service';
import { isValidEan13 } from '../common/barcode-ean13';

/**
 * The database is mocked: what is pinned here is the policy (which
 * sku_barcode_source mode generates what), the shape of the issued code, and
 * the collision handling. The atomicity of the counter is the database's job.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';

/** Independent checksum, written from the right, as in barcode-ean13.spec.ts. */
function checkDigitFromTheRight(first12: string): number {
  const digits = first12.split('').map(Number).reverse();
  const weighted = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return weighted % 10 === 0 ? 0 : 10 - (weighted % 10);
}

describe('SkuBarcodeService', () => {
  let service: SkuBarcodeService;
  let db: { query: jest.Mock };
  let masters: { getBarcodeSettings: jest.Mock };

  /** Sequence values the counter hands out, in order. */
  let sequenceQueue: number[];
  /** Barcodes the `isTaken` pre-check should report as already used. */
  let takenBarcodes: Set<string>;

  const isSequenceUpdate = (sql: string) => /UPDATE document_numbering/.test(sql);
  const isTakenCheck = (sql: string) => /SELECT 1 FROM skus/.test(sql);

  beforeEach(async () => {
    sequenceQueue = [];
    takenBarcodes = new Set();
    let fallback = 0;

    db = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (isSequenceUpdate(sql)) {
          const issued = sequenceQueue.length ? sequenceQueue.shift()! : ++fallback;
          return { rows: [{ issued }], rowCount: 1 };
        }
        if (isTakenCheck(sql)) {
          const taken = takenBarcodes.has(String(params?.[1]));
          return { rows: taken ? [{ '?column?': 1 }] : [], rowCount: taken ? 1 : 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    masters = { getBarcodeSettings: jest.fn(async () => ({ skuBarcodeSource: 'both' })) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SkuBarcodeService,
        { provide: DatabaseService, useValue: db },
        { provide: MastersService, useValue: masters },
      ],
    }).compile();

    service = moduleRef.get(SkuBarcodeService);
  });

  const setSource = (source: SkuBarcodeSource | string | undefined) => {
    masters.getBarcodeSettings.mockResolvedValue(
      source === undefined ? null : { skuBarcodeSource: source },
    );
  };

  /** A unique violation as node-postgres reports it. */
  const uniqueViolation = () =>
    Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'uniq_skus_tenant_barcode',
      detail: 'Key (tenant_id, barcode)=(...) already exists.',
    });

  // ─────────────────────────────────────────────────────────── generation ────

  describe('generate', () => {
    it('issues a 13-digit EAN starting with the GS1 internal prefix 20', async () => {
      sequenceQueue = [1];
      const code = await service.generate(TENANT);

      expect(code).toMatch(/^20\d{11}$/);
      expect(code).toHaveLength(13);
      expect(isValidEan13(code)).toBe(true);
      expect(Number(code[12])).toBe(checkDigitFromTheRight(code.slice(0, 12)));
    });

    it('embeds the sequence value zero-padded to ten digits', async () => {
      sequenceQueue = [7];
      expect((await service.generate(TENANT)).slice(0, 12)).toBe('200000000007');
    });

    it('advances the counter with an atomic UPDATE ... RETURNING, never a count', async () => {
      sequenceQueue = [1];
      await service.generate(TENANT);

      const updates = db.query.mock.calls.map((c) => c[0] as string).filter(isSequenceUpdate);
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatch(/SET next_number = next_number \+ 1/);
      expect(updates[0]).toMatch(/RETURNING next_number - 1 AS issued/);
      expect(updates[0]).not.toMatch(/COUNT\(/i);
    });

    it('scopes the counter to the tenant', async () => {
      sequenceQueue = [1];
      await service.generate(TENANT);

      const call = db.query.mock.calls.find((c) => isSequenceUpdate(c[0]));
      expect(call![1]).toEqual([TENANT, 'sku_barcode']);
    });

    it('produces distinct, valid codes across a run of sequence values', async () => {
      sequenceQueue = [1, 2, 3, 4, 5, 98, 99, 100, 123456789];
      const expected = sequenceQueue.length;
      const codes: string[] = [];
      for (let i = 0; i < expected; i++) codes.push(await service.generate(TENANT));

      expect(new Set(codes).size).toBe(expected);
      codes.forEach((c) => expect(isValidEan13(c)).toBe(true));
    });

    it('fails loudly when the counter row disappears', async () => {
      db.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
      await expect(service.generate(TENANT)).rejects.toThrow(/barcode sequence row is missing/);
    });
  });

  // ──────────────────────────────────────────── sku_barcode_source modes ────

  describe('resolveForCreate', () => {
    describe("mode 'manufacturer'", () => {
      beforeEach(() => setSource('manufacturer'));

      it('keeps the supplied barcode untouched', async () => {
        await expect(service.resolveForCreate(TENANT, '5901234123457')).resolves.toBe('5901234123457');
      });

      it('leaves the barcode null when none was supplied', async () => {
        await expect(service.resolveForCreate(TENANT, undefined)).resolves.toBeNull();
        await expect(service.resolveForCreate(TENANT, '')).resolves.toBeNull();
        await expect(service.resolveForCreate(TENANT, '   ')).resolves.toBeNull();
      });

      it('never touches the counter', async () => {
        await service.resolveForCreate(TENANT, undefined);
        expect(db.query.mock.calls.filter((c) => isSequenceUpdate(c[0]))).toHaveLength(0);
      });
    });

    describe("mode 'auto'", () => {
      beforeEach(() => setSource('auto'));

      it('generates even when nothing was supplied', async () => {
        sequenceQueue = [1];
        const code = await service.resolveForCreate(TENANT, undefined);
        expect(isValidEan13(code!)).toBe(true);
        expect(code!.startsWith('20')).toBe(true);
      });

      it('ignores a supplied barcode and generates anyway', async () => {
        sequenceQueue = [1];
        const code = await service.resolveForCreate(TENANT, '5901234123457');
        expect(code).not.toBe('5901234123457');
        expect(code!.startsWith('20')).toBe(true);
        expect(isValidEan13(code!)).toBe(true);
      });
    });

    describe("mode 'both'", () => {
      beforeEach(() => setSource('both'));

      it('respects a supplied barcode', async () => {
        await expect(service.resolveForCreate(TENANT, '5901234123457')).resolves.toBe('5901234123457');
        expect(db.query.mock.calls.filter((c) => isSequenceUpdate(c[0]))).toHaveLength(0);
      });

      it('trims a supplied barcode', async () => {
        await expect(service.resolveForCreate(TENANT, '  5901234123457 ')).resolves.toBe('5901234123457');
      });

      it('generates when none was supplied', async () => {
        sequenceQueue = [1];
        const code = await service.resolveForCreate(TENANT, undefined);
        expect(code!.startsWith('20')).toBe(true);
        expect(isValidEan13(code!)).toBe(true);
      });

      it('generates when the supplied barcode is only whitespace', async () => {
        sequenceQueue = [1];
        const code = await service.resolveForCreate(TENANT, '   ');
        expect(isValidEan13(code!)).toBe(true);
      });
    });

    it.each([[undefined], ['nonsense'], [null]])(
      'falls back to `both` when the setting reads %s',
      async (value) => {
        setSource(value as any);
        sequenceQueue = [1];
        await expect(service.resolveForCreate(TENANT, '5901234123457')).resolves.toBe('5901234123457');
        const generated = await service.resolveForCreate(TENANT, undefined);
        expect(isValidEan13(generated!)).toBe(true);
      },
    );

    it('is a thin wrapper over planForCreate', async () => {
      setSource('auto');
      sequenceQueue = [3];
      await expect(service.planForCreate('5901234123457')).resolves.toEqual({
        generate: true,
        barcode: null,
      });
      expect(db.query.mock.calls.filter((c) => isSequenceUpdate(c[0]))).toHaveLength(0);
      expect(await service.resolveForCreate(TENANT, '5901234123457')).toBe('2000000000039');
    });

    it('reads the mode from the shared barcode_settings row, not a local copy', async () => {
      setSource('auto');
      sequenceQueue = [1];
      await service.resolveForCreate(TENANT, undefined);
      expect(masters.getBarcodeSettings).toHaveBeenCalled();
    });
  });

  describe('planForCreate', () => {
    it.each<[string, string | undefined, { generate: boolean; barcode: string | null }]>([
      ['manufacturer', '5901234123457', { generate: false, barcode: '5901234123457' }],
      ['manufacturer', undefined, { generate: false, barcode: null }],
      ['manufacturer', '  ', { generate: false, barcode: null }],
      ['auto', '5901234123457', { generate: true, barcode: null }],
      ['auto', undefined, { generate: true, barcode: null }],
      ['both', '5901234123457', { generate: false, barcode: '5901234123457' }],
      ['both', undefined, { generate: true, barcode: null }],
      ['both', '   ', { generate: true, barcode: null }],
    ])('mode %s with supplied %s plans %o', async (source, supplied, expected) => {
      setSource(source);
      await expect(service.planForCreate(supplied)).resolves.toEqual(expected);
    });

    it('never draws from the counter — deciding is free', async () => {
      for (const source of ['manufacturer', 'auto', 'both']) {
        setSource(source);
        await service.planForCreate(undefined);
      }
      expect(db.query.mock.calls.filter((c) => isSequenceUpdate(c[0]))).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────── collision retry ───

  describe('collision handling', () => {
    it('skips a candidate the pre-check finds already in use', async () => {
      sequenceQueue = [1, 2];
      // Sequence 1 is body 200000000001: weighted sum 2*1 + 1*3 = 5, so the
      // check digit is 5 and the full code is 2000000000015.
      const takenCode = '2000000000015';
      expect(isValidEan13(takenCode)).toBe(true);
      takenBarcodes.add(takenCode);

      const code = await service.generate(TENANT);
      expect(code).not.toBe(takenCode);
      expect(code).toBe('2000000000022'); // sequence 2: sum 2 + 2*3 = 8, check 2
      expect(isValidEan13(code)).toBe(true);
    });

    it('gives up rather than looping forever when everything is taken', async () => {
      db.query.mockImplementation(async (sql: string) => {
        if (isSequenceUpdate(sql)) return { rows: [{ issued: 1 }], rowCount: 1 };
        if (isTakenCheck(sql)) return { rows: [{ n: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });

      await expect(service.generate(TENANT)).rejects.toThrow(/after 10 attempts/);
    });

    describe('withGeneratedBarcode', () => {
      it('retries with a fresh barcode when the insert hits the unique index', async () => {
        sequenceQueue = [1, 2];
        const attempted: string[] = [];

        const result = await service.withGeneratedBarcode(TENANT, async (barcode) => {
          attempted.push(barcode);
          if (attempted.length === 1) throw uniqueViolation();
          return { barcode };
        });

        expect(attempted).toHaveLength(2);
        expect(attempted[0]).not.toBe(attempted[1]);
        expect(result).toEqual({ barcode: attempted[1] });
        expect(isValidEan13(attempted[1])).toBe(true);
      });

      it('survives several consecutive collisions', async () => {
        sequenceQueue = [1, 2, 3, 4];
        let calls = 0;

        const result = await service.withGeneratedBarcode(TENANT, async (barcode) => {
          calls++;
          if (calls < 4) throw uniqueViolation();
          return barcode;
        });

        expect(calls).toBe(4);
        expect(isValidEan13(result)).toBe(true);
      });

      it('does not retry — and does not swallow — an unrelated database error', async () => {
        sequenceQueue = [1, 2];
        let calls = 0;
        const boom = Object.assign(new Error('null value in column "name"'), { code: '23502' });

        await expect(
          service.withGeneratedBarcode(TENANT, async () => {
            calls++;
            throw boom;
          }),
        ).rejects.toBe(boom);
        expect(calls).toBe(1);
      });

      it('does not retry a unique violation on a different column', async () => {
        sequenceQueue = [1, 2];
        const codeClash = Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'idx_skus_tenant_code',
          detail: 'Key (tenant_id, code)=(...) already exists.',
        });

        await expect(
          service.withGeneratedBarcode(TENANT, async () => {
            throw codeClash;
          }),
        ).rejects.toBe(codeClash);
      });

      it('gives up after the attempt budget instead of hanging', async () => {
        await expect(
          service.withGeneratedBarcode(TENANT, async () => {
            throw uniqueViolation();
          }),
        ).rejects.toThrow(/after 10 attempts/);
      });

      it('passes the value through untouched when the first write succeeds', async () => {
        sequenceQueue = [5];
        const seen: string[] = [];
        const out = await service.withGeneratedBarcode(TENANT, async (b) => {
          seen.push(b);
          return `saved:${b}`;
        });
        expect(seen).toHaveLength(1);
        expect(out).toBe(`saved:${seen[0]}`);
      });
    });

    describe('isBarcodeCollision', () => {
      it('recognises the barcode unique index', () => {
        expect(service.isBarcodeCollision(uniqueViolation())).toBe(true);
      });

      it.each([
        [undefined],
        [null],
        [new Error('plain')],
        [Object.assign(new Error('x'), { code: '23503' })],
        [Object.assign(new Error('x'), { code: '23505', constraint: 'idx_skus_tenant_code' })],
      ])('rejects %s', (error) => {
        expect(service.isBarcodeCollision(error)).toBe(false);
      });
    });
  });

  // ───────────────────────────────────────────────────────────── getSource ──

  describe('getSource', () => {
    it.each<[string, SkuBarcodeSource]>([
      ['manufacturer', 'manufacturer'],
      ['auto', 'auto'],
      ['both', 'both'],
    ])('passes through %s', async (stored, expected) => {
      setSource(stored);
      await expect(service.getSource()).resolves.toBe(expected);
    });

    it('defaults to both when there is no settings row yet', async () => {
      masters.getBarcodeSettings.mockResolvedValue(null);
      await expect(service.getSource()).resolves.toBe('both');
    });
  });
});
