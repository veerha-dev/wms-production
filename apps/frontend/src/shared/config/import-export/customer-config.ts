import { ImportExportConfig } from '@/shared/lib/import-export/types';
import {
  required,
  isEmail,
  oneOf,
  pattern,
  compose,
} from '@/shared/lib/import-export/validators';
import {
  toString,
  toFloat,
  toUpperCase,
  nullIfEmpty,
  defaultValue,
} from '@/shared/lib/import-export/transformers';
import { isValidGstin, unknownGstStateCodeMessage } from '@/features/customers/types';

const customerTypes = ['b2b', 'b2c'];
const paymentTerms = ['immediate', 'net_15', 'net_30', 'net_45', 'net_60'];
const statuses = ['active', 'inactive'];

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

export interface CustomerImportData {
  id?: string;
  code?: string;
  name: string;
  customerType: string;
  contactPerson?: string;
  phone: string;
  whatsappNumber?: string;
  email?: string;
  gstNumber?: string;
  panNumber?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  paymentTerms?: string;
  creditLimit?: number;
  notes?: string;
  status?: string;
}

/**
 * Customer import/export (spec §8). Template columns mirror what clients
 * migrating off Tally/Excel already have: Name, Type, Contact, Phone, Email,
 * GSTIN, address fields and Payment Terms.
 *
 * NOTE: duplicate detection by GSTIN/phone is a server-side concern — the
 * import endpoint reports those rows back in its errors array.
 */
export const customerImportExportConfig: ImportExportConfig<CustomerImportData> = {
  entityType: 'customer',
  entityLabel: 'Customers',

  import: {
    requiredColumns: ['name', 'phone'],
    optionalColumns: [
      'code',
      'customerType',
      'contactPerson',
      'whatsappNumber',
      'email',
      'gstNumber',
      'panNumber',
      'addressLine1',
      'city',
      'state',
      'postalCode',
      'country',
      'paymentTerms',
      'creditLimit',
      'notes',
      'status',
    ],
    columnMappings: {
      'Customer Code': 'code',
      'Code': 'code',
      'Customer Name': 'name',
      'Name': 'name',
      'Type': 'customerType',
      'Customer Type': 'customerType',
      'Contact': 'contactPerson',
      'Contact Person': 'contactPerson',
      'Phone': 'phone',
      'Phone Number': 'phone',
      'Mobile': 'phone',
      'WhatsApp': 'whatsappNumber',
      'WhatsApp Number': 'whatsappNumber',
      'Email': 'email',
      'GSTIN': 'gstNumber',
      'GST Number': 'gstNumber',
      'GST': 'gstNumber',
      'PAN': 'panNumber',
      'PAN Number': 'panNumber',
      'Address': 'addressLine1',
      'Address Line 1': 'addressLine1',
      'Street': 'addressLine1',
      'City': 'city',
      'State': 'state',
      'Pincode': 'postalCode',
      'Postal Code': 'postalCode',
      'PIN': 'postalCode',
      'Country': 'country',
      'Payment Terms': 'paymentTerms',
      'Credit Limit': 'creditLimit',
      'Notes': 'notes',
      'Status': 'status',
    },
    validators: {
      name: required,
      phone: required,
      customerType: oneOf(customerTypes, false),
      email: isEmail,
      // Shape first, then the state code. A well-formed GSTIN carrying a code
      // that was never issued (39, 88, 00, ...) has no derivable state, and
      // state is what decides CGST+SGST vs IGST — so the row is rejected here
      // rather than imported with a null state. Same rule as the customer form
      // and the backend's isValidGstin().
      gstNumber: (value) => {
        if (!value || value.trim() === '') return null;
        if (!GSTIN_PATTERN.test(value.trim())) return 'Must be a valid 15-character GSTIN';
        if (!isValidGstin(value)) return unknownGstStateCodeMessage(value);
        return null;
      },
      panNumber: pattern(PAN_PATTERN, 'Must look like ABCDE1234F'),
      paymentTerms: oneOf(paymentTerms, false),
      status: oneOf(statuses, false),
      creditLimit: (value) => {
        if (!value || value.trim() === '') return null;
        const num = Number(value.replace(/[,₹\s]/g, ''));
        if (Number.isNaN(num)) return 'Must be a valid amount';
        if (num < 0) return 'Must be a positive amount';
        return null;
      },
    },
    transformers: {
      name: toString,
      code: nullIfEmpty,
      customerType: (val) => (val ? String(val).toLowerCase().trim() : 'b2b'),
      contactPerson: nullIfEmpty,
      phone: toString,
      whatsappNumber: nullIfEmpty,
      email: (val) => (val ? String(val).toLowerCase().trim() : null),
      gstNumber: (val) => (val ? toUpperCase(val) : null),
      panNumber: (val) => (val ? toUpperCase(val) : null),
      addressLine1: nullIfEmpty,
      city: nullIfEmpty,
      state: nullIfEmpty,
      postalCode: nullIfEmpty,
      country: (val) => defaultValue('India')(val),
      paymentTerms: (val) =>
        val ? String(val).toLowerCase().replace(/\s+/g, '_').trim() : 'net_30',
      creditLimit: (val) => toFloat(String(val || '').replace(/[,₹\s]/g, '')),
      notes: nullIfEmpty,
      status: (val) => defaultValue('active')(val),
    },
    batchSize: 100,
    templateFileName: 'customer-import-template.csv',
  },

  export: {
    columns: [
      { key: 'code', label: 'Customer Code', width: 110 },
      { key: 'name', label: 'Customer Name', width: 200 },
      { key: 'customerType', label: 'Type', width: 70 },
      { key: 'contactPerson', label: 'Contact Person', width: 150 },
      { key: 'phone', label: 'Phone', width: 130 },
      { key: 'whatsappNumber', label: 'WhatsApp', width: 130 },
      { key: 'email', label: 'Email', width: 180 },
      { key: 'gstNumber', label: 'GSTIN', width: 150 },
      { key: 'panNumber', label: 'PAN', width: 110 },
      { key: 'addressLine1', label: 'Address', width: 220 },
      { key: 'city', label: 'City', width: 110 },
      { key: 'state', label: 'State', width: 140 },
      { key: 'postalCode', label: 'Pincode', width: 80 },
      { key: 'country', label: 'Country', width: 90 },
      { key: 'paymentTerms', label: 'Payment Terms', width: 110 },
      { key: 'creditLimit', label: 'Credit Limit', width: 100 },
      { key: 'totalOrders', label: 'Total Orders', width: 90 },
      { key: 'notes', label: 'Notes', width: 200 },
      { key: 'status', label: 'Status', width: 80 },
    ],
    defaultColumns: [
      'code',
      'name',
      'customerType',
      'contactPerson',
      'phone',
      'email',
      'gstNumber',
      'city',
      'state',
      'paymentTerms',
      'status',
    ],
    formatters: {
      customerType: (val) => String(val || '').toUpperCase(),
      creditLimit: (val) => (val != null ? Number(val).toFixed(2) : ''),
      paymentTerms: (val) =>
        String(val || '')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      status: (val) => String(val || '').toUpperCase(),
    },
    fileName: () => `customers-export-${new Date().toISOString().split('T')[0]}.csv`,
  },

  api: {
    bulkCreate: '/api/v1/customers/import',
    export: '/api/v1/customers/export',
  },

  sampleData: [
    {
      name: 'Raj Traders',
      customerType: 'b2b',
      contactPerson: 'Rajesh Kumar',
      phone: '+91 98765 43210',
      email: 'accounts@rajtraders.in',
      gstNumber: '33ABCDE1234F1Z5',
      addressLine1: '12 Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      postalCode: '600002',
      country: 'India',
      paymentTerms: 'net_30',
      status: 'active',
    },
  ],
};
