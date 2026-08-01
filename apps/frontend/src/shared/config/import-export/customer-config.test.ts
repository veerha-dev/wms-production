/**
 * Customer import/export configuration.
 *
 * This is the code path a client migrating off Tally/Excel actually hits, and
 * it is the last line of defence before a few thousand rows are POSTed to
 * /api/v1/customers/import. Bad GSTINs and silently-defaulted enums here turn
 * into wrong tax treatment on every invoice that customer ever receives.
 */
import { describe, it, expect } from 'vitest';
import { customerImportExportConfig } from './customer-config';
import {
  autoMapColumns,
  parseCSVString,
  transformRow,
  transformRows,
  validateMappings,
} from '@/shared/lib/import-export/csv-parser';
import { isValidGstin, unknownGstStateCodeMessage } from '@/features/customers/types';

const cfg = customerImportExportConfig.import;
const validate = (field: string, value: string) => cfg.validators[field]?.(value, {}) ?? null;
const transform = (field: string, value: string) => cfg.transformers[field]?.(value, {});

describe('customer import — column mapping', () => {
  it('auto-maps the canonical template headers', () => {
    const mappings = autoMapColumns(
      ['Customer Name', 'Phone', 'GSTIN', 'Payment Terms', 'City'],
      cfg
    );
    const matched = Object.fromEntries(
      mappings.filter((m) => m.isMatched).map((m) => [m.targetField, m.sourceColumn])
    );
    expect(matched).toMatchObject({
      name: 'Customer Name',
      phone: 'Phone',
      gstNumber: 'GSTIN',
      paymentTerms: 'Payment Terms',
      city: 'City',
    });
  });

  it('accepts the common aliases a real export produces', () => {
    const mappings = autoMapColumns(['Name', 'Mobile', 'GST', 'PIN', 'Street'], cfg);
    const matched = Object.fromEntries(
      mappings.filter((m) => m.isMatched).map((m) => [m.targetField, m.sourceColumn])
    );
    expect(matched).toMatchObject({
      name: 'Name',
      phone: 'Mobile',
      gstNumber: 'GST',
      postalCode: 'PIN',
      addressLine1: 'Street',
    });
  });

  it('matches headers case-insensitively and ignores surrounding spaces', () => {
    const mappings = autoMapColumns(['  customer name  ', 'PHONE'], cfg);
    expect(mappings.find((m) => m.targetField === 'name')?.isMatched).toBe(true);
    expect(mappings.find((m) => m.targetField === 'phone')?.isMatched).toBe(true);
  });

  it('falls back to matching the raw field name when no alias exists', () => {
    const mappings = autoMapColumns(['name', 'phone', 'customerType'], cfg);
    expect(mappings.find((m) => m.targetField === 'customerType')?.isMatched).toBe(true);
  });

  it('flags name and phone as required and everything else as optional', () => {
    const mappings = autoMapColumns(['Name', 'Phone', 'Email'], cfg);
    expect(mappings.filter((m) => m.isRequired).map((m) => m.targetField).sort()).toEqual([
      'name',
      'phone',
    ]);
  });
});

describe('customer import — required column validation', () => {
  it('reports every unmapped required column', () => {
    const mappings = autoMapColumns(['Email', 'City'], cfg);
    expect(validateMappings(mappings, cfg)).toEqual([
      'Required field "name" is not mapped to any column',
      'Required field "phone" is not mapped to any column',
    ]);
  });

  it('reports only the missing one when a required column is present', () => {
    const mappings = autoMapColumns(['Customer Name', 'Email'], cfg);
    expect(validateMappings(mappings, cfg)).toEqual([
      'Required field "phone" is not mapped to any column',
    ]);
  });

  it('passes once both required columns are mapped', () => {
    const mappings = autoMapColumns(['Customer Name', 'Mobile'], cfg);
    expect(validateMappings(mappings, cfg)).toEqual([]);
  });

  it('marks a row invalid when a required cell is blank even though the column exists', () => {
    const csv = ['Name,Phone', 'Raj Traders,+91 98765 43210', ',+91 90000 00000'].join('\n');
    const result = parseCSVString(csv, { config: cfg });

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[1].errors).toContainEqual(
      expect.objectContaining({ field: 'name', message: 'This field is required' })
    );
  });

  it('treats a whitespace-only required cell as blank', () => {
    const csv = ['Name,Phone', '"   ",+91 98765 43210'].join('\n');
    const result = parseCSVString(csv, { config: cfg });
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors.map((e) => e.field)).toContain('name');
  });

  it('does not duplicate the required error when the validator already fired', () => {
    const csv = ['Name,Phone', ',+91 98765 43210'].join('\n');
    const result = parseCSVString(csv, { config: cfg });
    expect(result.rows[0].errors.filter((e) => e.field === 'name')).toHaveLength(1);
  });
});

describe('customer import — GSTIN validator', () => {
  it.each(['33ABCDE1234F1Z5', '27AAACR5055K1ZK', '07AABCU9603R1ZM'])(
    'accepts the valid GSTIN %s',
    (gstin) => {
      expect(validate('gstNumber', gstin)).toBeNull();
    }
  );

  it('accepts a lowercase GSTIN — the pattern is case-insensitive by design', () => {
    // Spreadsheets routinely lowercase; the transformer uppercases before send.
    expect(validate('gstNumber', '33abcde1234f1z5')).toBeNull();
    expect(transform('gstNumber', '33abcde1234f1z5')).toBe('33ABCDE1234F1Z5');
  });

  it.each([
    ['too short', '33ABCDE1234F1Z'],
    ['too long', '33ABCDE1234F1Z55'],
    ['no Z separator', '33ABCDE1234F1X5'],
    ['letters in the state code', 'AAABCDE1234F1Z5'],
    ['digits in the PAN block', '33123451234F1Z5'],
    ['0 as the entity character', '33ABCDE1234F0Z5'],
  ])('rejects a GSTIN that is %s', (_label, gstin) => {
    expect(validate('gstNumber', gstin)).toBe('Must be a valid 15-character GSTIN');
  });

  it('treats a blank GSTIN as acceptable (B2C rows carry none)', () => {
    expect(validate('gstNumber', '')).toBeNull();
    expect(validate('gstNumber', '   ')).toBeNull();
    expect(transform('gstNumber', '')).toBeNull();
  });

  it.each(['39', '88', '00', '98', '40'])(
    'rejects a well-formed GSTIN whose state code %s was never issued',
    (code) => {
      // The shape passes but no State can be derived, and State decides
      // CGST+SGST vs IGST. Importing the row would store state: null and the
      // backend would reject it anyway — so it fails as a per-row error.
      expect(validate('gstNumber', `${code}ABCDE1234F1Z5`)).toBe(
        `GSTIN state code ${code} is not a valid Indian state code`
      );
    }
  );

  it('rejects an unissued code typed in lowercase too', () => {
    expect(validate('gstNumber', '39abcde1234f1z5')).toBe(
      'GSTIN state code 39 is not a valid Indian state code'
    );
  });

  it('reports the shape error, not the state-code error, for a malformed GSTIN', () => {
    // 'AAABCDE1234F1Z5' has no digits to report as a state code, so telling the
    // user "state code AA is invalid" would be actively misleading.
    expect(validate('gstNumber', 'AAABCDE1234F1Z5')).toBe('Must be a valid 15-character GSTIN');
  });

  it.each(['01', '25', '28', '38', '97', '99'])(
    'still accepts issued code %s, including the legacy and non-state ones',
    (code) => {
      expect(validate('gstNumber', `${code}ABCDE1234F1Z5`)).toBeNull();
    }
  );

  it('agrees with the customer form: same predicate, same message', () => {
    // Both entry points call isValidGstin/unknownGstStateCodeMessage from
    // features/customers/types, so a fix in one cannot drift from the other.
    for (const code of ['39', '88', '00']) {
      const gstin = `${code}ABCDE1234F1Z5`;
      expect(isValidGstin(gstin)).toBe(false);
      expect(validate('gstNumber', gstin)).toBe(unknownGstStateCodeMessage(gstin));
    }
  });
});

describe('customer import — PAN validator', () => {
  it.each(['ABCDE1234F', 'abcde1234f'])('accepts %s', (pan) => {
    expect(validate('panNumber', pan)).toBeNull();
  });

  it.each(['ABCDE1234', 'ABCDE1234FG', 'ABC1E1234F'])('rejects %s', (pan) => {
    expect(validate('panNumber', pan)).toBe('Must look like ABCDE1234F');
  });

  it('uppercases on transform and nulls a blank', () => {
    expect(transform('panNumber', ' abcde1234f ')).toBe('ABCDE1234F');
    expect(transform('panNumber', '')).toBeNull();
  });
});

describe('customer import — email validator', () => {
  it.each(['accounts@rajtraders.in', 'a.b+tag@sub.domain.co.uk'])('accepts %s', (email) => {
    expect(validate('email', email)).toBeNull();
  });

  it.each(['not-an-email', 'missing@tld', '@nolocal.com', 'spaces in@email.com'])(
    'rejects %s',
    (email) => {
      expect(validate('email', email)).toBe('Must be a valid email address');
    }
  );

  it('treats a blank email as acceptable and transforms it to null', () => {
    expect(validate('email', '')).toBeNull();
    expect(transform('email', '')).toBeNull();
  });

  it('lowercases on transform', () => {
    expect(transform('email', '  Accounts@RajTraders.IN ')).toBe('accounts@rajtraders.in');
  });
});

describe('customer import — enum coercion', () => {
  it.each(['b2b', 'B2B', 'b2c', ' B2C '])('accepts customer type %s', (value) => {
    expect(validate('customerType', value)).toBeNull();
  });

  it('rejects an unknown customer type with the allowed list in the message', () => {
    expect(validate('customerType', 'wholesale')).toBe('Must be one of: b2b, b2c');
  });

  it('lowercases the customer type and defaults a blank to b2b', () => {
    expect(transform('customerType', 'B2C')).toBe('b2c');
    expect(transform('customerType', '')).toBe('b2b');
  });

  it.each(['immediate', 'NET_30', ' net_60 '])('accepts payment terms %s', (value) => {
    expect(validate('paymentTerms', value)).toBeNull();
  });

  it('rejects unknown payment terms', () => {
    expect(validate('paymentTerms', 'net_90')).toBe(
      'Must be one of: immediate, net_15, net_30, net_45, net_60'
    );
  });

  it('coerces spaced payment terms to the snake_case enum and defaults to net_30', () => {
    expect(transform('paymentTerms', 'NET 15')).toBe('net_15');
    expect(transform('paymentTerms', '')).toBe('net_30');
  });

  it('KNOWN GAP: "Net 15" passes the transformer but would fail the validator', () => {
    // The validator runs against the raw cell, the transformer normalises
    // spaces to underscores afterwards. A sheet that spells it "Net 15" is
    // rejected at validation time even though the transformer could fix it.
    expect(validate('paymentTerms', 'Net 15')).toBe(
      'Must be one of: immediate, net_15, net_30, net_45, net_60'
    );
    expect(transform('paymentTerms', 'Net 15')).toBe('net_15');
  });

  it.each(['active', 'INACTIVE'])('accepts status %s', (value) => {
    expect(validate('status', value)).toBeNull();
  });

  it('rejects an unknown status and defaults a blank to active', () => {
    expect(validate('status', 'archived')).toBe('Must be one of: active, inactive');
    expect(transform('status', '')).toBe('active');
  });
});

describe('customer import — credit limit', () => {
  it.each(['1000', '1,00,000', '₹ 50,000', '0'])('accepts %s', (value) => {
    expect(validate('creditLimit', value)).toBeNull();
  });

  it('rejects a non-numeric amount', () => {
    expect(validate('creditLimit', 'lots')).toBe('Must be a valid amount');
  });

  it('rejects a negative amount', () => {
    expect(validate('creditLimit', '-500')).toBe('Must be a positive amount');
  });

  it('accepts a blank amount', () => {
    expect(validate('creditLimit', '')).toBeNull();
    expect(transform('creditLimit', '')).toBeNull();
  });

  it('strips currency symbols and separators on transform', () => {
    expect(transform('creditLimit', '₹ 1,00,000')).toBe(100000);
    expect(transform('creditLimit', '2500.50')).toBe(2500.5);
  });
});

describe('customer import — end-to-end row transform', () => {
  const csv = [
    'Customer Name,Mobile,Type,GSTIN,PAN,Email,City,State,Payment Terms,Credit Limit,Country,Status',
    'Raj Traders,+91 98765 43210,B2B,33abcde1234f1z5,abcde1234f,Accounts@RajTraders.IN,Chennai,Tamil Nadu,NET_30,"₹ 1,00,000",,',
  ].join('\n');

  it('parses, validates and transforms a realistic row', () => {
    const result = parseCSVString(csv, { config: cfg });
    expect(result.invalidRows).toBe(0);

    const [row] = transformRows(result.rows, cfg);
    expect(row).toMatchObject({
      name: 'Raj Traders',
      phone: '+91 98765 43210',
      customerType: 'b2b',
      gstNumber: '33ABCDE1234F1Z5',
      panNumber: 'ABCDE1234F',
      email: 'accounts@rajtraders.in',
      city: 'Chennai',
      state: 'Tamil Nadu',
      paymentTerms: 'net_30',
      creditLimit: 100000,
      country: 'India',
      status: 'active',
    });
  });

  it('drops invalid rows before transforming', () => {
    const bad = [
      'Customer Name,Mobile,GSTIN',
      'Good Co,+91 98765 43210,33ABCDE1234F1Z5',
      'Bad Co,+91 98765 43211,NOTAGSTIN',
    ].join('\n');
    const result = parseCSVString(bad, { config: cfg });
    expect(result.validRows).toBe(1);
    expect(transformRows(result.rows, cfg)).toHaveLength(1);
  });

  it('KNOWN GAP: column defaults only apply when the column exists in the sheet', () => {
    // transformRow iterates the *mapped* fields, so a sheet with no Country /
    // Status / Type column produces a payload with none of those keys rather
    // than the documented defaults — the server has to supply them.
    const minimal = transformRow({ name: 'Solo Co', phone: '+91 90000 00000' }, cfg);
    expect(minimal).toEqual({ name: 'Solo Co', phone: '+91 90000 00000' });
    expect(minimal).not.toHaveProperty('country');
    expect(minimal).not.toHaveProperty('customerType');
    expect(minimal).not.toHaveProperty('status');
  });
});

describe('customer export configuration', () => {
  it('every default column exists in the full column list', () => {
    const keys = customerImportExportConfig.export.columns.map((c) => c.key);
    for (const key of customerImportExportConfig.export.defaultColumns) {
      expect(keys).toContain(key);
    }
  });

  it('formats enums for humans', () => {
    const f = customerImportExportConfig.export.formatters;
    expect(f.customerType('b2b')).toBe('B2B');
    expect(f.paymentTerms('net_30')).toBe('Net 30');
    expect(f.status('active')).toBe('ACTIVE');
    expect(f.creditLimit(100000)).toBe('100000.00');
  });

  it('renders a blank credit limit rather than "null"', () => {
    expect(customerImportExportConfig.export.formatters.creditLimit(null)).toBe('');
    expect(customerImportExportConfig.export.formatters.creditLimit(undefined)).toBe('');
  });

  it('names the export file with today\'s date', () => {
    const name = customerImportExportConfig.export.fileName();
    expect(name).toMatch(/^customers-export-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('points at the customer bulk endpoints', () => {
    expect(customerImportExportConfig.api.bulkCreate).toBe('/api/v1/customers/import');
    expect(customerImportExportConfig.api.export).toBe('/api/v1/customers/export');
  });
});

describe('customer sample data', () => {
  it('the shipped sample row passes its own validators', () => {
    const sample = customerImportExportConfig.sampleData?.[0] ?? {};
    for (const [field, validator] of Object.entries(cfg.validators)) {
      const value = (sample as Record<string, unknown>)[field];
      expect({ field, error: validator(value == null ? '' : String(value), {}) }).toEqual({
        field,
        error: null,
      });
    }
  });

  it('the sample GSTIN really encodes the sample state', () => {
    const sample = customerImportExportConfig.sampleData?.[0] as Record<string, string>;
    // 33 = Tamil Nadu; if these ever disagree the template teaches users a lie.
    expect(sample.gstNumber.slice(0, 2)).toBe('33');
    expect(sample.state).toBe('Tamil Nadu');
  });
});
