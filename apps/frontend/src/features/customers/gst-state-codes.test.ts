/**
 * GST state derivation — the first two digits of a GSTIN decide the state of
 * registration, which in turn decides CGST+SGST (intra-state) vs IGST
 * (inter-state) on every invoice. The frontend keeps its own copy of the code
 * map so the customer form can auto-fill State as the user types.
 *
 * Two independent copies of one mapping WILL drift. The parity block at the
 * bottom of this file diffs the frontend map against the backend's
 * apps/backend/src/modules/common/gst-state-codes.ts, code by code, so a
 * divergence fails CI instead of silently showing one state in the UI while
 * the DB stores another.
 */
import { describe, it, expect } from 'vitest';

import {
  GST_STATE_CODES,
  GSTIN_REGEX,
  INDIAN_STATES,
  PAN_REGEX,
  stateFromGSTIN,
} from './types';

import {
  GST_STATE_CODES as BACKEND_GST_STATE_CODES,
  GSTIN_REGEX as BACKEND_GSTIN_REGEX,
  stateFromGstin as backendStateFromGstin,
} from '../../../../backend/src/modules/common/gst-state-codes';

/** Every code the frontend claims to know, with the state it must resolve to. */
const CODE_TABLE: Array<[string, string]> = [
  ['01', 'Jammu and Kashmir'],
  ['02', 'Himachal Pradesh'],
  ['03', 'Punjab'],
  ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'],
  ['06', 'Haryana'],
  ['07', 'Delhi'],
  ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'],
  ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'],
  ['14', 'Manipur'],
  ['15', 'Mizoram'],
  ['16', 'Tripura'],
  ['17', 'Meghalaya'],
  ['18', 'Assam'],
  ['19', 'West Bengal'],
  ['20', 'Jharkhand'],
  ['21', 'Odisha'],
  ['22', 'Chhattisgarh'],
  ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'],
  ['25', 'Daman and Diu'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['27', 'Maharashtra'],
  ['28', 'Andhra Pradesh'],
  ['29', 'Karnataka'],
  ['30', 'Goa'],
  ['31', 'Lakshadweep'],
  ['32', 'Kerala'],
  ['33', 'Tamil Nadu'],
  ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'],
  ['38', 'Ladakh'],
  ['97', 'Other Territory'],
  ['99', 'Centre Jurisdiction'],
];

/** A syntactically valid 13-char tail to append to a 2-digit state code. */
const TAIL = 'ABCDE1234F1Z5';

describe('GST_STATE_CODES map', () => {
  it('has exactly the 40 codes the spec issues', () => {
    expect(Object.keys(GST_STATE_CODES).sort()).toEqual(
      CODE_TABLE.map(([code]) => code).sort()
    );
    expect(Object.keys(GST_STATE_CODES)).toHaveLength(40);
  });

  it.each(CODE_TABLE)('code %s maps to %s', (code, state) => {
    expect(GST_STATE_CODES[code]).toBe(state);
  });

  it('keeps the two legacy codes that still appear on live GSTINs', () => {
    // 25 (Daman and Diu) merged into 26 in 2020; 28 (pre-bifurcation Andhra)
    // was replaced by 37. Both remain valid on GSTINs issued before the change,
    // so dropping them would break existing customers.
    expect(GST_STATE_CODES['25']).toBe('Daman and Diu');
    expect(GST_STATE_CODES['28']).toBe('Andhra Pradesh');
  });
});

describe('stateFromGSTIN', () => {
  it.each(CODE_TABLE)('derives %s -> %s from a full GSTIN', (code, state) => {
    expect(stateFromGSTIN(`${code}${TAIL}`)).toBe(state);
  });

  it.each(CODE_TABLE)('derives %s -> %s from just the two-digit prefix', (code, state) => {
    // The form auto-fills State the moment two characters are typed, long
    // before the GSTIN is complete.
    expect(stateFromGSTIN(code)).toBe(state);
  });

  it('accepts a lowercase GSTIN (the state digits are unaffected by case)', () => {
    expect(stateFromGSTIN('33abcde1234f1z5')).toBe('Tamil Nadu');
    expect(stateFromGSTIN('07abcde1234f1z5')).toBe('Delhi');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(stateFromGSTIN('  27ABCDE1234F1Z5  ')).toBe('Maharashtra');
    expect(stateFromGSTIN('\t29')).toBe('Karnataka');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('returns null for %s', (_label, input) => {
    expect(stateFromGSTIN(input as string | null | undefined)).toBeNull();
  });

  it.each([
    ['a single digit', '3'],
    ['a digit then a letter', '3A'],
    ['letters first', 'AB33ABCDE'],
    ['a leading plus', '+3ABCDE1234F1Z5'],
    ['punctuation', '3-ABCDE'],
    ['non-ASCII digits', '३३ABCDE1234F1Z5'],
  ])('returns null for malformed input: %s', (_label, input) => {
    expect(stateFromGSTIN(input)).toBeNull();
  });

  it.each(['00', '39', '40', '55', '70', '96', '98'])(
    'returns null for unknown but well-formed code %s',
    (code) => {
      expect(stateFromGSTIN(`${code}${TAIL}`)).toBeNull();
    }
  );

  it('never returns an inherited Object.prototype key', () => {
    // A plain object literal is used as the map, so a crafted prefix must not
    // resolve through the prototype chain. Both are non-numeric anyway, but
    // this pins the behaviour.
    expect(stateFromGSTIN('constructor')).toBeNull();
    expect(stateFromGSTIN('__proto__')).toBeNull();
    expect(stateFromGSTIN('toString')).toBeNull();
  });
});

describe('INDIAN_STATES', () => {
  it('is de-duplicated (28 and 37 both mean Andhra Pradesh)', () => {
    expect(INDIAN_STATES.filter((s) => s === 'Andhra Pradesh')).toHaveLength(1);
    expect(new Set(INDIAN_STATES).size).toBe(INDIAN_STATES.length);
  });

  it('is sorted alphabetically for the picker', () => {
    expect([...INDIAN_STATES].sort()).toEqual(INDIAN_STATES);
  });

  it('contains every distinct value in the code map and nothing else', () => {
    expect([...INDIAN_STATES].sort()).toEqual(
      [...new Set(Object.values(GST_STATE_CODES))].sort()
    );
  });

  it('every entry round-trips back through stateFromGSTIN', () => {
    for (const [code, state] of CODE_TABLE) {
      expect(INDIAN_STATES).toContain(state);
      expect(stateFromGSTIN(code)).toBe(state);
    }
  });
});

describe('GSTIN_REGEX', () => {
  it.each([
    '33ABCDE1234F1Z5',
    '27AAACR5055K1ZK',
    '07AABCU9603R1ZM',
    '09ABCDE1234FAZ0',
  ])('accepts the valid GSTIN %s', (gstin) => {
    expect(GSTIN_REGEX.test(gstin)).toBe(true);
  });

  it.each([
    ['too short', '33ABCDE1234F1Z'],
    ['too long', '33ABCDE1234F1Z55'],
    ['empty', ''],
    ['no Z in position 14', '33ABCDE1234F1X5'],
    ['0 as the entity character', '33ABCDE1234F0Z5'],
    ['digits where the PAN letters go', '33123451234F1Z5'],
    ['letters where the state digits go', 'AAABCDE1234F1Z5'],
    ['lowercase', '33abcde1234f1z5'],
    ['inner space', '33ABCDE 234F1Z5'],
  ])('rejects %s', (_label, gstin) => {
    expect(GSTIN_REGEX.test(gstin)).toBe(false);
  });

  it('is not sticky or global (repeated .test() calls are stable)', () => {
    // A /g regex would alternate true/false across calls via lastIndex.
    expect(GSTIN_REGEX.global).toBe(false);
    expect(GSTIN_REGEX.sticky).toBe(false);
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5')).toBe(true);
    expect(GSTIN_REGEX.test('33ABCDE1234F1Z5')).toBe(true);
  });
});

describe('PAN_REGEX', () => {
  it.each(['ABCDE1234F', 'AAACR5055K', 'ZZZZZ0000A'])('accepts %s', (pan) => {
    expect(PAN_REGEX.test(pan)).toBe(true);
  });

  it.each([
    ['too short', 'ABCDE1234'],
    ['too long', 'ABCDE1234FG'],
    ['lowercase', 'abcde1234f'],
    ['digits in the letter block', 'ABC1E1234F'],
    ['empty', ''],
    ['trailing space', 'ABCDE1234F '],
  ])('rejects %s', (_label, pan) => {
    expect(PAN_REGEX.test(pan)).toBe(false);
  });

  it('matches the PAN embedded in a valid GSTIN', () => {
    const gstin = '33ABCDE1234F1Z5';
    expect(PAN_REGEX.test(gstin.slice(2, 12))).toBe(true);
  });
});

/**
 * ─── Frontend ↔ backend parity ──────────────────────────────────────────────
 * These are the tests that actually matter. Everything above only proves the
 * frontend agrees with itself.
 */
describe('parity with the backend GST state map', () => {
  it('the backend module really loaded (guards against a vacuous diff)', () => {
    expect(Object.keys(BACKEND_GST_STATE_CODES).length).toBeGreaterThanOrEqual(40);
  });

  it('both maps define exactly the same set of codes', () => {
    const frontendCodes = Object.keys(GST_STATE_CODES).sort();
    const backendCodes = Object.keys(BACKEND_GST_STATE_CODES).sort();

    const onlyInFrontend = frontendCodes.filter((c) => !(c in BACKEND_GST_STATE_CODES));
    const onlyInBackend = backendCodes.filter((c) => !(c in GST_STATE_CODES));

    expect({ onlyInFrontend, onlyInBackend }).toEqual({
      onlyInFrontend: [],
      onlyInBackend: [],
    });
    expect(frontendCodes).toEqual(backendCodes);
  });

  it('every code resolves to the identical state name on both sides', () => {
    const mismatches = Object.keys(GST_STATE_CODES)
      .sort()
      .filter((code) => GST_STATE_CODES[code] !== BACKEND_GST_STATE_CODES[code])
      .map((code) => ({
        code,
        frontend: GST_STATE_CODES[code],
        backend: BACKEND_GST_STATE_CODES[code],
      }));

    // An empty array here is the whole point: a mismatch means the UI would
    // display one state while the invoice is taxed against another.
    expect(mismatches).toEqual([]);
  });

  it.each(CODE_TABLE)(
    'stateFromGSTIN and backend stateFromGstin agree for code %s',
    (code) => {
      const gstin = `${code}${TAIL}`;
      expect(stateFromGSTIN(gstin)).toBe(backendStateFromGstin(gstin));
    }
  );

  it('agrees with the backend on unknown and malformed input too', () => {
    for (const input of ['', '00', '39', '98', `40${TAIL}`]) {
      expect(stateFromGSTIN(input)).toBe(backendStateFromGstin(input));
    }
  });

  it('uses a byte-identical GSTIN regex on both sides', () => {
    expect(GSTIN_REGEX.source).toBe(BACKEND_GSTIN_REGEX.source);
    expect(GSTIN_REGEX.flags).toBe(BACKEND_GSTIN_REGEX.flags);
  });
});
