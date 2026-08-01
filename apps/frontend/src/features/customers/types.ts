export type CustomerType = 'b2b' | 'b2c';

export type PaymentTerms = 'immediate' | 'net_15' | 'net_30' | 'net_45' | 'net_60';

export type CustomerStatus = 'active' | 'inactive';

export interface Customer {
  id: string;
  code: string;
  name: string;
  customerType: CustomerType;
  contactPerson?: string | null;
  phone: string;
  whatsappNumber?: string | null;
  email?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  paymentTerms?: PaymentTerms | null;
  creditLimit?: number | null;
  notes?: string | null;
  status: CustomerStatus;
  /** Optional aggregates the list endpoint may enrich rows with. */
  totalOrders?: number;
  totalBusinessValue?: number;
  lastOrderDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type CustomerAddressType = 'billing' | 'shipping';

export interface CustomerAddress {
  id: string;
  label: string;
  addressType: CustomerAddressType;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  isDefault?: boolean;
  status?: string;
}

/** Shape returned by GET /api/v1/customers/search?q= (typeahead). */
export interface CustomerSearchResult {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  gstNumber?: string | null;
  paymentTerms?: PaymentTerms | null;
}

export interface CustomerStats {
  total: number;
  active: number;
  newThisMonth: number;
  /** Not guaranteed by the API yet — spec §3 allows this to arrive later. */
  pendingPayments?: number;
}

export interface CreditCheckResult {
  creditLimit: number;
  outstanding: number;
  wouldExceed: boolean;
}

export const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: 'b2b', label: 'B2B (Business with GSTIN)' },
  { value: 'b2c', label: 'B2C (Individual consumer)' },
];

export const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_45', label: 'Net 45' },
  { value: 'net_60', label: 'Net 60' },
];

export function formatPaymentTerms(terms?: string | null): string {
  if (!terms) return '-';
  const match = PAYMENT_TERMS_OPTIONS.find((o) => o.value === terms);
  return match ? match.label : String(terms).replace(/_/g, ' ');
}

/**
 * GST state codes — the first two digits of a GSTIN identify the state of
 * registration. Kept client-side so the form can auto-fill State the moment
 * the user types the first two characters (spec §4).
 */
export const GST_STATE_CODES: Record<string, string> = {
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
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
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
};

/** Every state name we can offer in the State filter / picker. */
export const INDIAN_STATES: string[] = Array.from(
  new Set(Object.values(GST_STATE_CODES))
).sort();

/**
 * Derive the state name from a GSTIN's leading state code.
 * Returns null when the GSTIN is too short or the code is unknown, so callers
 * can fall back to whatever the user typed manually.
 */
export function stateFromGSTIN(gstin?: string | null): string | null {
  if (!gstin) return null;
  const code = gstin.trim().slice(0, 2);
  if (!/^\d{2}$/.test(code)) return null;
  return GST_STATE_CODES[code] ?? null;
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Full GSTIN validation: the right shape AND a state code that was actually
 * issued. Mirrors `isValidGstin()` in
 * apps/backend/src/modules/common/gst-state-codes.ts — same regex, same map
 * lookup, same trim+uppercase normalisation — so the two sides cannot disagree.
 *
 * The regex alone only proves the shape. `39ABCDE1234F1Z5` is perfectly
 * well-formed but 39 was never issued, so no state can be derived and the
 * customer would be saved with `state: null`. State is what decides CGST+SGST
 * (intra-state) vs IGST (inter-state) on every invoice, so a null state is a
 * real data problem, not a cosmetic one. The backend already rejects these;
 * validating here turns a confusing server error into inline feedback.
 *
 * The two-digit prefix is guaranteed by the regex, so the plain-object lookup
 * can never resolve through Object.prototype (`constructor`, `toString`, ...).
 */
export function isValidGstin(gstin?: string | null): boolean {
  if (!gstin) return false;
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(value)) return false;
  return GST_STATE_CODES[value.slice(0, 2)] !== undefined;
}

/**
 * The message shown when a GSTIN is well-formed but its state code was never
 * issued. Shared by the customer form and the Excel importer so both entry
 * points say exactly the same thing.
 */
export function unknownGstStateCodeMessage(gstin?: string | null): string {
  const code = (gstin ?? '').trim().slice(0, 2);
  return `GSTIN state code ${code} is not a valid Indian state code`;
}

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Compose the flat billing address on a customer record into one line. */
export function formatCustomerAddress(customer?: Partial<Customer> | null): string {
  if (!customer) return '';
  return [customer.addressLine1, customer.city, customer.state, customer.postalCode]
    .filter(Boolean)
    .join(', ');
}

export function formatAddress(address?: Partial<CustomerAddress> | null): string {
  if (!address) return '';
  return [address.street, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');
}

export function formatCurrency(value?: number | string | null): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
