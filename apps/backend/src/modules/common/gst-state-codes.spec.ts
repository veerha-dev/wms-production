import {
  GST_STATE_CODES,
  GSTIN_REGEX,
  isValidGstin,
  panFromGstin,
  stateFromGstin,
} from './gst-state-codes';

/**
 * The GSTIN's first two digits decide CGST+SGST (intra-state) vs IGST
 * (inter-state) on every invoice, so a wrong state derivation is a wrong tax
 * split on a legal document. These are pure, table-driven checks — no database.
 */

/** Builds a structurally valid GSTIN for a given state code. */
const gstin = (stateCode: string, rest = 'ABCDE1234F1Z5') => `${stateCode}${rest}`;

describe('GST_STATE_CODES table', () => {
  it('is frozen so no module can mutate the tax-critical table at runtime', () => {
    expect(Object.isFrozen(GST_STATE_CODES)).toBe(true);
  });

  it('keys are all two-character zero-padded numeric strings', () => {
    for (const code of Object.keys(GST_STATE_CODES)) {
      expect(code).toMatch(/^[0-9]{2}$/);
    }
  });

  it('every state name is a non-empty trimmed string', () => {
    for (const [code, name] of Object.entries(GST_STATE_CODES)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
      expect(name).toBe(name.trim());
      expect(code).toBeTruthy();
    }
  });

  it('covers the contiguous 01–38 range plus 97 and 99', () => {
    for (let i = 1; i <= 38; i++) {
      const code = String(i).padStart(2, '0');
      expect(GST_STATE_CODES[code]).toBeDefined();
    }
    expect(GST_STATE_CODES['97']).toBe('Other Territory');
    expect(GST_STATE_CODES['99']).toBe('Centre Jurisdiction');
  });

  it('does not define codes outside the issued set', () => {
    for (const code of ['00', '39', '40', '50', '88', '90', '96', '98']) {
      expect(GST_STATE_CODES[code]).toBeUndefined();
    }
  });
});

describe('stateFromGstin', () => {
  const cases: Array<[string, string]> = [
    ['33', 'Tamil Nadu'],
    ['36', 'Telangana'],
    ['27', 'Maharashtra'],
    ['29', 'Karnataka'],
    ['07', 'Delhi'],
    ['24', 'Gujarat'],
    ['09', 'Uttar Pradesh'],
    ['19', 'West Bengal'],
    ['32', 'Kerala'],
    ['08', 'Rajasthan'],
    ['06', 'Haryana'],
    ['23', 'Madhya Pradesh'],
    ['21', 'Odisha'],
    ['18', 'Assam'],
    ['10', 'Bihar'],
    ['03', 'Punjab'],
    ['01', 'Jammu and Kashmir'],
    ['38', 'Ladakh'],
    ['37', 'Andhra Pradesh'],
    ['30', 'Goa'],
    ['97', 'Other Territory'],
    ['99', 'Centre Jurisdiction'],
  ];

  it.each(cases)('derives %s → %s', (code, expected) => {
    expect(stateFromGstin(gstin(code))).toBe(expected);
  });

  it('distinguishes 36 Telangana from 37 Andhra Pradesh (post-bifurcation)', () => {
    expect(stateFromGstin(gstin('36'))).toBe('Telangana');
    expect(stateFromGstin(gstin('37'))).toBe('Andhra Pradesh');
    expect(stateFromGstin(gstin('36'))).not.toBe(stateFromGstin(gstin('37')));
  });

  it('still resolves the legacy pre-bifurcation code 28', () => {
    expect(stateFromGstin(gstin('28'))).toBe('Andhra Pradesh');
  });

  it('still resolves the legacy Daman and Diu code 25', () => {
    expect(stateFromGstin(gstin('25'))).toBe('Daman and Diu');
    expect(stateFromGstin(gstin('26'))).toBe('Dadra and Nagar Haveli and Daman and Diu');
  });

  it('uppercases and trims before deriving', () => {
    expect(stateFromGstin('  33abcde1234f1z5  ')).toBe('Tamil Nadu');
    expect(stateFromGstin('33abcde1234f1z5')).toBe('Tamil Nadu');
  });

  it('returns null for an unknown state code such as 88', () => {
    expect(stateFromGstin(gstin('88'))).toBeNull();
  });

  it.each(['00', '39', '40', '55', '90', '98'])('returns null for unissued code %s', (code) => {
    expect(stateFromGstin(gstin(code))).toBeNull();
  });

  it('returns null for null, undefined and empty input', () => {
    expect(stateFromGstin(null)).toBeNull();
    expect(stateFromGstin(undefined)).toBeNull();
    expect(stateFromGstin('')).toBeNull();
    expect(stateFromGstin('   ')).toBeNull();
  });

  it('returns null when the first two characters are not digits', () => {
    expect(stateFromGstin('AAAAAAAAAAAAAAA')).toBeNull();
    expect(stateFromGstin('3XABCDE1234F1Z5')).toBeNull();
  });

  /**
   * stateFromGstin deliberately looks only at the prefix — callers that need
   * full validity must call isValidGstin first (customers.service does).
   */
  it('reads the prefix even from a structurally invalid string', () => {
    expect(stateFromGstin('33')).toBe('Tamil Nadu');
    expect(stateFromGstin('33JUNK')).toBe('Tamil Nadu');
    expect(isValidGstin('33JUNK')).toBe(false);
  });
});

describe('GSTIN_REGEX', () => {
  it('matches the canonical 15-character layout', () => {
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5')).toBe(true);
  });

  it('is anchored at both ends', () => {
    expect(GSTIN_REGEX.test('X33ABCDE1234F1Z5')).toBe(false);
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5X')).toBe(false);
  });

  it('has no global flag, so repeated .test() calls are stateless', () => {
    expect(GSTIN_REGEX.global).toBe(false);
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5')).toBe(true);
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5')).toBe(true);
  });
});

describe('isValidGstin', () => {
  it.each([
    ['33ABCDE1234F1Z5', 'Tamil Nadu'],
    ['36AAAAA0000A1Z0', 'Telangana'],
    ['27ZZZZZ9999Z9ZZ', 'Maharashtra'],
    ['29ABCDE1234F1Z5', 'Karnataka'],
    ['07ABCDE1234F1Z5', 'Delhi'],
    ['24ABCDE1234F1Z5', 'Gujarat'],
    ['01ABCDE1234F1Z5', 'Jammu and Kashmir'],
    ['38ABCDE1234F1Z5', 'Ladakh'],
    ['97ABCDE1234F1Z5', 'Other Territory'],
    ['99ABCDE1234F1Z5', 'Centre Jurisdiction'],
  ])('accepts %s (%s)', (value) => {
    expect(isValidGstin(value)).toBe(true);
  });

  it('accepts a lowercase GSTIN (input is normalised, not rejected)', () => {
    expect(isValidGstin('33abcde1234f1z5')).toBe(true);
    expect(isValidGstin('33AbCdE1234f1Z5')).toBe(true);
  });

  it('accepts surrounding whitespace', () => {
    expect(isValidGstin('  33ABCDE1234F1Z5\t\n')).toBe(true);
  });

  it('rejects an unknown state code even when the shape is perfect', () => {
    expect(GSTIN_REGEX.test('88ABCDE1234F1Z5')).toBe(true); // shape is fine…
    expect(isValidGstin('88ABCDE1234F1Z5')).toBe(false); // …but 88 is not a state
  });

  it.each(['00', '39', '40', '55', '90', '98'])(
    'rejects a well-formed GSTIN with unissued state code %s',
    (code) => {
      expect(isValidGstin(gstin(code))).toBe(false);
    },
  );

  describe('malformed lengths', () => {
    it.each([
      ['', 'empty'],
      ['3', '1 char'],
      ['33', '2 chars'],
      ['33ABCDE1234F1Z', '14 chars — one short'],
      ['33ABCDE1234F1Z55', '16 chars — one long'],
      ['33ABCDE1234F1Z5 5', 'inner space'],
    ])('rejects %s (%s)', (value) => {
      expect(isValidGstin(value)).toBe(false);
    });
  });

  describe('bad characters in fixed positions', () => {
    it('rejects a non-digit state prefix', () => {
      expect(isValidGstin('AAABCDE1234F1Z5')).toBe(false);
      expect(isValidGstin('3AABCDE1234F1Z5')).toBe(false);
    });

    it('rejects digits inside the 5-letter PAN head', () => {
      expect(isValidGstin('33ABC1E1234F1Z5')).toBe(false);
    });

    it('rejects letters inside the 4-digit PAN body', () => {
      expect(isValidGstin('33ABCDE12A4F1Z5')).toBe(false);
    });

    it('rejects a digit in the PAN check letter position', () => {
      expect(isValidGstin('33ABCDE123411Z5')).toBe(false);
    });

    it('rejects 0 in the entity-number position (must be 1-9 or A-Z)', () => {
      expect(isValidGstin('33ABCDE1234F0Z5')).toBe(false);
      expect(isValidGstin('33ABCDE1234F1Z5')).toBe(true);
      expect(isValidGstin('33ABCDE1234FAZ5')).toBe(true);
    });

    it('rejects anything other than Z in the fixed 14th position', () => {
      expect(isValidGstin('33ABCDE1234F1A5')).toBe(false);
      expect(isValidGstin('33ABCDE1234F115')).toBe(false);
    });

    it('rejects a non-alphanumeric checksum character', () => {
      expect(isValidGstin('33ABCDE1234F1Z-')).toBe(false);
      expect(isValidGstin('33ABCDE1234F1Z ')).toBe(false);
    });

    it('rejects punctuation and separators anywhere', () => {
      expect(isValidGstin('33-ABCDE1234F1Z')).toBe(false);
      expect(isValidGstin('33ABCDE1234F1Z_')).toBe(false);
    });
  });

  it('rejects null and undefined without throwing', () => {
    expect(isValidGstin(null as unknown as string)).toBe(false);
    expect(isValidGstin(undefined as unknown as string)).toBe(false);
  });

  it('rejects whitespace-only input', () => {
    expect(isValidGstin('    ')).toBe(false);
  });
});

describe('panFromGstin', () => {
  it('extracts the embedded 10-character PAN', () => {
    expect(panFromGstin('33ABCDE1234F1Z5')).toBe('ABCDE1234F');
    expect(panFromGstin('27ZZZZZ9999Z9ZZ')).toBe('ZZZZZ9999Z');
  });

  it('normalises case and whitespace before extracting', () => {
    expect(panFromGstin('  33abcde1234f1z5 ')).toBe('ABCDE1234F');
  });

  it('returns null for a malformed GSTIN', () => {
    expect(panFromGstin('33ABCDE1234F1Z')).toBeNull();
    expect(panFromGstin('nonsense')).toBeNull();
  });

  it('returns null for null, undefined and empty input', () => {
    expect(panFromGstin(null)).toBeNull();
    expect(panFromGstin(undefined)).toBeNull();
    expect(panFromGstin('')).toBeNull();
  });

  /**
   * panFromGstin only checks the shape, not the state code — an unissued
   * prefix still yields a PAN. Callers must gate on isValidGstin.
   */
  it('still extracts a PAN when the state code is unissued', () => {
    expect(panFromGstin('88ABCDE1234F1Z5')).toBe('ABCDE1234F');
    expect(isValidGstin('88ABCDE1234F1Z5')).toBe(false);
  });

  it('produces a PAN whose own layout is valid', () => {
    for (const code of ['33', '27', '29', '07']) {
      expect(panFromGstin(gstin(code))).toMatch(/^[A-Z]{5}[0-9]{4}[A-Z]$/);
    }
  });
});
