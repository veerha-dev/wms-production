import {
  EAN13_SEQUENCE_DIGITS,
  INTERNAL_EAN_PREFIX,
  MAX_EAN13_SEQUENCE,
  buildInternalEan13,
  ean13CheckDigit,
  isInternalEan13,
  isValidEan13,
} from './barcode-ean13';

/**
 * A wrong check digit is invisible on screen and fatal on the warehouse floor:
 * the printed label simply refuses to scan. These tests pin the arithmetic
 * against published EAN-13 values and against a second, independently written
 * implementation of the checksum.
 */

/**
 * Independent checksum, deliberately written the other way round from the
 * implementation: it walks the digits from the RIGHT, weighting 3,1,3,1,…
 * That is the same standard stated differently, so agreement between the two
 * is real evidence rather than the same mistake twice.
 */
function checkDigitFromTheRight(first12: string): number {
  const digits = first12.split('').map(Number).reverse();
  const weighted = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  const remainder = weighted % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/** Real, published EAN-13 / ISBN-13 / UPC-A-as-EAN-13 codes. */
const KNOWN_GOOD = [
  '4006381333931', // GS1 worked example
  '5901234123457', // EAN-13 reference code
  '9780306406157', // ISBN-13 (bookland 978 prefix)
  '4012345678901', // GS1 German prefix example
  '0012345678905', // UPC-A 012345678905 zero-padded to EAN-13
];

describe('EAN-13 check digit', () => {
  describe('published codes', () => {
    it.each(KNOWN_GOOD)('recomputes the printed check digit of %s', (code) => {
      const body = code.slice(0, 12);
      const printed = Number(code[12]);
      expect(ean13CheckDigit(body)).toBe(printed);
    });

    it.each(KNOWN_GOOD)('accepts %s as valid', (code) => {
      expect(isValidEan13(code)).toBe(true);
    });

    it.each(KNOWN_GOOD)('rejects %s once a digit is corrupted', (code) => {
      // Bump the 5th digit — any single-digit change must break the checksum
      // unless it lands on the check digit's own weight class, which this does
      // not (a +1 on an odd position shifts the sum by exactly 1).
      const digits = code.split('');
      digits[4] = String((Number(digits[4]) + 1) % 10);
      expect(isValidEan13(digits.join(''))).toBe(false);
    });
  });

  describe('edge values', () => {
    it('returns 0 when the weighted sum is already a multiple of 10', () => {
      // All zeroes: sum 0, so the check digit must be 0 and not 10.
      expect(ean13CheckDigit('000000000000')).toBe(0);
    });

    it('never returns 10', () => {
      for (let i = 0; i < 1000; i++) {
        const body = String(i).padStart(12, '0');
        const digit = ean13CheckDigit(body);
        expect(digit).toBeGreaterThanOrEqual(0);
        expect(digit).toBeLessThanOrEqual(9);
      }
    });

    it.each([['12345678901'], ['1234567890123'], ['abcdefghijkl'], ['']])(
      'rejects malformed input %s',
      (bad) => {
        expect(() => ean13CheckDigit(bad)).toThrow();
      },
    );

    it.each([['123456789012'], ['12345678901a'], ['not-a-code'], ['']])(
      'isValidEan13 is false for %s',
      (bad) => {
        expect(isValidEan13(bad)).toBe(false);
      },
    );
  });

  describe('agreement with an independent implementation', () => {
    it('matches on every published code', () => {
      for (const code of KNOWN_GOOD) {
        expect(ean13CheckDigit(code.slice(0, 12))).toBe(checkDigitFromTheRight(code.slice(0, 12)));
      }
    });

    it('matches on 2000 pseudo-random 12-digit bodies', () => {
      // Deterministic LCG so a failure is reproducible.
      let seed = 20260802;
      const nextDigit = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % 10;
      };
      for (let i = 0; i < 2000; i++) {
        const body = Array.from({ length: 12 }, nextDigit).join('');
        expect(ean13CheckDigit(body)).toBe(checkDigitFromTheRight(body));
      }
    });
  });
});

describe('buildInternalEan13', () => {
  it('produces 13 digits prefixed with the GS1 restricted range 20', () => {
    const code = buildInternalEan13(1);
    expect(code).toHaveLength(13);
    expect(code.startsWith(INTERNAL_EAN_PREFIX)).toBe(true);
    expect(/^\d{13}$/.test(code)).toBe(true);
  });

  it('zero-pads the sequence to the full payload width', () => {
    expect(buildInternalEan13(1).slice(2, 12)).toBe('0000000001');
    expect(buildInternalEan13(42).slice(2, 12)).toBe('0000000042');
    expect(buildInternalEan13(MAX_EAN13_SEQUENCE).slice(2, 12)).toBe('9999999999');
    expect(EAN13_SEQUENCE_DIGITS).toBe(10);
  });

  it.each([0, 1, 2, 9, 10, 99, 100, 12345, 999999, 1234567890, MAX_EAN13_SEQUENCE])(
    'emits a self-consistent code for sequence %i',
    (seq) => {
      const code = buildInternalEan13(seq);
      expect(isValidEan13(code)).toBe(true);
      // Verified against the independent checksum, not just the one under test.
      expect(Number(code[12])).toBe(checkDigitFromTheRight(code.slice(0, 12)));
      expect(isInternalEan13(code)).toBe(true);
    },
  );

  it('every code in a 5000-long run validates and is unique', () => {
    const seen = new Set<string>();
    for (let seq = 1; seq <= 5000; seq++) {
      const code = buildInternalEan13(seq);
      expect(isValidEan13(code)).toBe(true);
      expect(Number(code[12])).toBe(checkDigitFromTheRight(code.slice(0, 12)));
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
    expect(seen.size).toBe(5000);
  });

  it('refuses a sequence that has outgrown the payload rather than wrapping', () => {
    expect(() => buildInternalEan13(MAX_EAN13_SEQUENCE + 1)).toThrow(/exceeds/);
  });

  it.each([-1, 1.5, NaN])('refuses the invalid sequence %s', (seq) => {
    expect(() => buildInternalEan13(seq as number)).toThrow();
  });
});

describe('isInternalEan13', () => {
  it('is false for a valid but externally issued code', () => {
    // 5901234123457 is a valid EAN-13 but carries a real GS1 country prefix.
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isInternalEan13('5901234123457')).toBe(false);
  });

  it('is false for a 20-prefixed code with a broken check digit', () => {
    const good = buildInternalEan13(7);
    const broken = good.slice(0, 12) + String((Number(good[12]) + 1) % 10);
    expect(isInternalEan13(broken)).toBe(false);
  });
});
