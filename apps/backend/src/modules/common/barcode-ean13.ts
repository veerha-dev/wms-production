/**
 * EAN-13 encoding helpers.
 *
 * An EAN-13 is 13 digits: 12 payload digits followed by a modulo-10 check
 * digit. A scanner recomputes that check digit and refuses to emit a code when
 * it disagrees, so a generator that gets the arithmetic wrong produces labels
 * that simply never scan. That is why this lives in one tested place.
 *
 * Veerha's auto-generated SKU barcodes use the GS1 prefix `20`. The 02x range
 * is reserved for restricted distribution / in-store use: GS1 will never
 * allocate it to a manufacturer, so an internally generated code can never be
 * mistaken for — or collide with — a real product's barcode.
 *
 *   2 0 | D D D D D D D D D D | C
 *   ^prefix   ^10 sequence digits  ^check digit
 */

/** GS1 restricted-distribution prefix used for all internally issued codes. */
export const INTERNAL_EAN_PREFIX = '20';

/** Digits of sequence payload between the prefix and the check digit. */
export const EAN13_SEQUENCE_DIGITS = 13 - INTERNAL_EAN_PREFIX.length - 1; // 10

/** Highest sequence value that still fits in EAN13_SEQUENCE_DIGITS digits. */
export const MAX_EAN13_SEQUENCE = 10 ** EAN13_SEQUENCE_DIGITS - 1; // 9_999_999_999

/**
 * Computes the EAN-13 check digit for the first 12 digits.
 *
 * Weights alternate 1,3,1,3,… from the LEFT (position 1 is weight 1); the
 * check digit is whatever makes the weighted sum a multiple of 10.
 *
 * @param first12 exactly 12 characters, all ASCII digits
 */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error(`EAN-13 check digit needs exactly 12 digits, received "${first12}"`);
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = first12.charCodeAt(i) - 48;
    // 0-indexed: even index === odd position === weight 1.
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `code` is 13 digits and its final digit is the correct checksum. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}

/**
 * Builds the full 13-digit code for a sequence value:
 * `20` + the value zero-padded to 10 digits + the check digit.
 *
 * @throws when the sequence has outgrown the 10-digit payload — silently
 *   truncating would start re-issuing codes that are already in use.
 */
export function buildInternalEan13(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`EAN-13 sequence must be a non-negative integer, received ${sequence}`);
  }
  if (sequence > MAX_EAN13_SEQUENCE) {
    throw new Error(
      `EAN-13 sequence ${sequence} exceeds the ${EAN13_SEQUENCE_DIGITS}-digit payload (max ${MAX_EAN13_SEQUENCE})`,
    );
  }

  const body = INTERNAL_EAN_PREFIX + String(sequence).padStart(EAN13_SEQUENCE_DIGITS, '0');
  return body + ean13CheckDigit(body);
}

/** True when `code` is an EAN-13 this system issued (valid, and `20`-prefixed). */
export function isInternalEan13(code: string): boolean {
  return isValidEan13(code) && code.startsWith(INTERNAL_EAN_PREFIX);
}
