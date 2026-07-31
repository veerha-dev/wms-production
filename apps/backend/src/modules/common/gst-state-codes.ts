/**
 * Official GST state codes (first two digits of a GSTIN) → state / UT name.
 *
 * The state is what decides CGST+SGST (intra-state) vs IGST (inter-state) on
 * every invoice, so it is derived from the GSTIN itself rather than typed by
 * hand — a mistyped state silently produces the wrong tax split.
 *
 * Codes 01–38 are the states/UTs. 97 (Other Territory) and 99 (Centre
 * Jurisdiction) are also issued and are included for completeness.
 *
 * Notes on the historical codes that are still valid on existing GSTINs:
 *  - 25 Daman and Diu and 26 Dadra and Nagar Haveli were merged in 2020 into
 *    a single UT that now uses code 26.
 *  - 28 Andhra Pradesh (before bifurcation) is no longer issued; new AP
 *    GSTINs use 37 and Telangana uses 36.
 */
export const GST_STATE_CODES: Readonly<Record<string, string>> = Object.freeze({
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu', // legacy — merged into 26 in 2020
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh', // legacy — pre-bifurcation, new GSTINs use 37
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
});

/** 15-character GSTIN: 2 state digits, 10-char PAN, entity digit, 'Z', checksum. */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  if (!gstin) return false;
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(value)) return false;
  return GST_STATE_CODES[value.slice(0, 2)] !== undefined;
}

/** Returns the state name encoded in a GSTIN's first two digits, or null. */
export function stateFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const code = gstin.trim().toUpperCase().slice(0, 2);
  return GST_STATE_CODES[code] ?? null;
}

/** The PAN embedded in a GSTIN (characters 3–12), or null. */
export function panFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const value = gstin.trim().toUpperCase();
  return GSTIN_REGEX.test(value) ? value.slice(2, 12) : null;
}
