import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CustomerAddressesRepository } from './customer-addresses.repository';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomerDto,
  CustomerAddressDto,
  ImportCustomersDto,
  ImportCustomerRowDto,
  PAYMENT_TERMS,
} from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { GSTIN_REGEX, GST_STATE_CODES, stateFromGstin } from '../common/gst-state-codes';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';

export interface AuthUser {
  id?: string;
  role?: string;
  warehouseId?: string | null;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  /** Alias of `imported` — the shared ImportDialog reads `created`. */
  created: number;
  imported: number;
  failed: number;
  total: number;
  errors: ImportError[];
  dryRun: boolean;
}

const isAdmin = (user?: AuthUser) => user?.role === 'admin';

@Injectable()
export class CustomersService {
  constructor(
    private repository: CustomersRepository,
    private addressesRepository: CustomerAddressesRepository,
    private numbering: DocumentNumberingService,
  ) {}

  // ---------------------------------------------------------------- queries

  async findAll(query: QueryCustomerDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 20));
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const item = await this.repository.findById(getCurrentTenantId(), id);
    if (!item) throw new NotFoundException(`Customer ${id} not found`);
    return item;
  }

  async findById(id: string) {
    return this.findOne(id);
  }

  async getStats() {
    return this.repository.getStats(getCurrentTenantId());
  }

  /** Typeahead for the Sales Order customer combobox. */
  async search(term: string | undefined, limit = 10) {
    const q = (term || '').trim();
    if (q.length < 2) return [];
    const rows = await this.repository.search(
      getCurrentTenantId(),
      q,
      Math.min(50, Math.max(1, limit)),
    );
    return rows.map((c: any) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      gstNumber: c.gstNumber,
      paymentTerms: c.paymentTerms,
      // Extras the SO form auto-fills with; harmless for a pure typeahead.
      customerType: c.customerType,
      contactPerson: c.contactPerson,
      email: c.email,
      billingAddress: c.address,
      city: c.city,
      state: c.state,
      creditLimit: c.creditLimit,
    }));
  }

  async exportAll(query: QueryCustomerDto = {} as QueryCustomerDto) {
    const rows = await this.repository.findAllForExport(getCurrentTenantId(), query);
    return rows.map((c: any) => ({
      code: c.code,
      name: c.name,
      customerType: c.customerType,
      contactPerson: c.contactPerson,
      phone: c.phone,
      whatsappNumber: c.whatsappNumber,
      email: c.email,
      gstNumber: c.gstNumber,
      panNumber: c.panNumber,
      addressLine1: c.addressLine1,
      addressLine2: c.addressLine2,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      // The export column config keys this as `postalCode`; emit both so the
      // spreadsheet column is populated whichever alias the client selects.
      postalCode: c.postalCode ?? c.pincode,
      country: c.country,
      paymentTerms: c.paymentTerms,
      creditLimit: c.creditLimit,
      status: c.status,
      totalOrders: c.totalOrders ?? 0,
      totalBusinessValue: c.totalBusinessValue ?? 0,
      notes: c.notes,
      createdAt: c.createdAt,
    }));
  }

  // ---------------------------------------------------------------- mutations

  async create(dto: CreateCustomerDto, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const payload = this.normalize(dto);

    this.stripAdminOnlyFields(payload, user);
    this.applyGstRules(payload);

    if (!payload.name) throw new BadRequestException('name is required');
    if (!payload.phone) throw new BadRequestException('phone is required');

    if (payload.gstNumber) {
      const dup = await this.repository.findByGstNumber(tenantId, payload.gstNumber);
      if (dup) {
        throw new ConflictException(
          `A customer with GSTIN ${payload.gstNumber} already exists (${dup.code} — ${dup.name})`,
        );
      }
    }

    if (payload.code) {
      const dup = await this.repository.findByCode(tenantId, payload.code);
      if (dup) throw new ConflictException(`Customer code ${payload.code} is already in use`);
    } else {
      payload.code = await this.numbering.nextNumber(tenantId, 'customer');
    }

    const customer = await this.repository.create(tenantId, payload);

    // Optional address book supplied with the create form.
    const addresses: CustomerAddressDto[] = dto.addresses || [];
    for (const address of addresses) {
      await this.addressesRepository.create(tenantId, customer.id, address);
    }
    if (dto.shippingSameAsBilling && (payload.addressLine1 || payload.city)) {
      await this.addressesRepository.create(tenantId, customer.id, {
        label: 'Billing address',
        addressType: 'shipping',
        street: [payload.addressLine1, payload.addressLine2].filter(Boolean).join(', ') || null,
        city: payload.city,
        state: payload.state,
        pincode: payload.postalCode,
        isDefault: true,
      });
    }

    return this.repository.findById(tenantId, customer.id);
  }

  async update(id: string, dto: UpdateCustomerDto, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const existing = await this.findOne(id);

    const payload = this.normalize(dto);
    this.stripAdminOnlyFields(payload, user);

    if (payload.status === 'inactive' && existing.status !== 'inactive' && !isAdmin(user)) {
      throw new ForbiddenException('Only an admin can deactivate a customer');
    }

    // GSTIN rules are evaluated against the merged (post-update) record so an
    // edit cannot leave a B2B customer without a GSTIN.
    const merged = {
      customerType: payload.customerType ?? existing.customerType,
      gstNumber: payload.gstNumber !== undefined ? payload.gstNumber : existing.gstNumber,
      state: payload.state ?? existing.state,
      panNumber: payload.panNumber ?? existing.panNumber,
    };
    this.applyGstRules(merged);

    if (payload.customerType !== undefined) payload.customerType = merged.customerType;
    if (payload.gstNumber !== undefined || merged.gstNumber !== existing.gstNumber) {
      payload.gstNumber = merged.gstNumber;
    }
    if (merged.state && merged.state !== existing.state) payload.state = merged.state;

    if (payload.gstNumber) {
      const dup = await this.repository.findByGstNumber(tenantId, payload.gstNumber);
      if (dup && dup.id !== id) {
        throw new ConflictException(
          `A customer with GSTIN ${payload.gstNumber} already exists (${dup.code} — ${dup.name})`,
        );
      }
    }
    if (payload.code && payload.code !== existing.code) {
      const dup = await this.repository.findByCode(tenantId, payload.code);
      if (dup && dup.id !== id) {
        throw new ConflictException(`Customer code ${payload.code} is already in use`);
      }
    }

    const updated = await this.repository.update(tenantId, id, payload);
    if (!updated) throw new NotFoundException(`Customer ${id} not found`);
    return this.repository.findById(tenantId, id);
  }

  async updateStatus(id: string, status: string, user?: AuthUser) {
    if (!['active', 'inactive'].includes(status)) {
      throw new BadRequestException("status must be 'active' or 'inactive'");
    }
    if (status === 'inactive' && !isAdmin(user)) {
      throw new ForbiddenException('Only an admin can deactivate a customer');
    }
    await this.findOne(id);
    return this.repository.updateStatus(getCurrentTenantId(), id, status);
  }

  /**
   * Deactivate-first delete. A customer referenced by sales orders, invoices,
   * returns or serial numbers is never hard-deleted — the old behaviour threw
   * a raw Postgres FK violation (HTTP 500) and, worse, would have orphaned
   * historical documents if the FKs had been permissive.
   */
  async remove(id: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const existing = await this.findOne(id);

    if (!isAdmin(user)) {
      throw new ForbiddenException('Only an admin can deactivate or delete a customer');
    }

    const dependents = await this.repository.countDependents(tenantId, id);

    if (dependents.total > 0) {
      const deactivated = await this.repository.updateStatus(tenantId, id, 'inactive');
      return {
        id,
        code: existing.code,
        deleted: false,
        deactivated: true,
        dependents,
        message:
          'Customer has linked transactions and was deactivated instead of deleted. Historical documents are preserved.',
        customer: deactivated,
      };
    }

    await this.repository.delete(tenantId, id);
    return {
      id,
      code: existing.code,
      deleted: true,
      deactivated: false,
      dependents,
      message: 'Customer deleted.',
    };
  }

  async delete(id: string, user?: AuthUser) {
    return this.remove(id, user);
  }

  // ---------------------------------------------------------------- tabs

  async getOrders(id: string, limit = 100, offset = 0) {
    const tenantId = getCurrentTenantId();
    await this.findOne(id);
    const [data, total] = await Promise.all([
      this.repository.findOrders(tenantId, id, limit, offset),
      this.repository.countOrders(tenantId, id),
    ]);
    const totalValue = data.reduce((sum, o: any) => sum + (o.totalAmount || 0), 0);
    return { data, meta: { total, limit, offset, totalValue } };
  }

  async getInvoices(id: string, limit = 100, offset = 0) {
    const tenantId = getCurrentTenantId();
    await this.findOne(id);
    const [data, total, outstandingTotal] = await Promise.all([
      this.repository.findInvoices(tenantId, id, limit, offset),
      this.repository.countInvoices(tenantId, id),
      this.repository.getOutstanding(tenantId, id),
    ]);
    return { data, meta: { total, limit, offset, outstandingTotal } };
  }

  async creditCheck(id: string, orderValue = 0) {
    const tenantId = getCurrentTenantId();
    const customer = await this.findOne(id);
    const outstanding = await this.repository.getOutstanding(tenantId, id);
    const creditLimit = customer.creditLimit;
    const value = Number(orderValue) || 0;
    const projected = outstanding + value;
    const hasLimit = creditLimit !== null && creditLimit !== undefined;

    return {
      customerId: id,
      customerName: customer.name,
      creditLimit: hasLimit ? creditLimit : null,
      outstanding,
      orderValue: value,
      projectedOutstanding: projected,
      available: hasLimit ? creditLimit - outstanding : null,
      wouldExceed: hasLimit ? projected > creditLimit : false,
      message: hasLimit
        ? projected > creditLimit
          ? `This order takes the unpaid total to ${projected.toFixed(2)}, past the ${creditLimit.toFixed(2)} credit limit.`
          : 'Within credit limit.'
        : 'No credit limit set for this customer.',
    };
  }

  // ---------------------------------------------------------------- addresses

  async listAddresses(customerId: string) {
    const tenantId = getCurrentTenantId();
    await this.findOne(customerId);
    return this.addressesRepository.findByCustomer(tenantId, customerId);
  }

  async createAddress(customerId: string, dto: CustomerAddressDto) {
    const tenantId = getCurrentTenantId();
    await this.findOne(customerId);
    return this.addressesRepository.create(tenantId, customerId, dto);
  }

  async updateAddress(customerId: string, addressId: string, dto: CustomerAddressDto) {
    const tenantId = getCurrentTenantId();
    await this.findOne(customerId);
    const existing = await this.addressesRepository.findById(tenantId, addressId);
    if (!existing || existing.customerId !== customerId) {
      throw new NotFoundException(`Address ${addressId} not found for this customer`);
    }
    return this.addressesRepository.update(tenantId, addressId, dto);
  }

  async removeAddress(customerId: string, addressId: string) {
    const tenantId = getCurrentTenantId();
    await this.findOne(customerId);
    const existing = await this.addressesRepository.findById(tenantId, addressId);
    if (!existing || existing.customerId !== customerId) {
      throw new NotFoundException(`Address ${addressId} not found for this customer`);
    }

    // Orders shipped to this address keep their snapshot text, but the FK
    // would block the delete — retire the address instead.
    const refs = await this.addressesRepository.countSalesOrderRefs(tenantId, addressId);
    if (refs > 0) {
      const retired = await this.addressesRepository.update(tenantId, addressId, {
        status: 'inactive',
      });
      return {
        id: addressId,
        deleted: false,
        deactivated: true,
        message: `Address is used by ${refs} sales order(s) and was deactivated instead of deleted.`,
        address: retired,
      };
    }

    await this.addressesRepository.delete(tenantId, addressId);
    return { id: addressId, deleted: true, deactivated: false };
  }

  // ---------------------------------------------------------------- import

  async importCustomers(dto: ImportCustomersDto, user?: AuthUser): Promise<ImportResult> {
    const tenantId = getCurrentTenantId();
    // The shared ImportDialog posts `{ items: [...] }`; direct callers use
    // `{ rows: [...] }`. Accept either.
    const rows = dto?.items ?? dto?.rows ?? [];
    if (!Array.isArray(rows)) throw new BadRequestException('rows (or items) must be an array');

    const errors: ImportError[] = [];
    const seenGstins = new Map<string, number>();
    const seenPhones = new Map<string, number>();
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      // 1-based, matching the spreadsheet row the operator is looking at.
      const rowNumber = i + 1;
      const raw = rows[i] as ImportCustomerRowDto;
      const rowErrors: ImportError[] = [];

      const payload = this.normalize({
        ...raw,
        contactPerson: raw.contactPerson ?? raw.contact_person ?? raw.contact,
        customerType: raw.customerType ?? raw.customer_type ?? raw.type,
      } as any);

      if (!payload.name) {
        rowErrors.push({ row: rowNumber, field: 'name', message: 'Name is required' });
      }
      if (!payload.phone) {
        rowErrors.push({ row: rowNumber, field: 'phone', message: 'Phone is required' });
      }
      if (payload.paymentTerms && !PAYMENT_TERMS.includes(payload.paymentTerms as any)) {
        rowErrors.push({
          row: rowNumber,
          field: 'paymentTerms',
          message: `Payment terms must be one of: ${PAYMENT_TERMS.join(', ')}`,
        });
      }
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        rowErrors.push({ row: rowNumber, field: 'email', message: 'Invalid email address' });
      }

      try {
        this.applyGstRules(payload);
      } catch (e: any) {
        rowErrors.push({
          row: rowNumber,
          field: 'gstNumber',
          message: e?.message || 'Invalid GSTIN',
        });
      }

      // Duplicates — within the file first, then against the tenant's data.
      if (payload.gstNumber) {
        if (seenGstins.has(payload.gstNumber)) {
          rowErrors.push({
            row: rowNumber,
            field: 'gstNumber',
            message: `Duplicate GSTIN — already used on row ${seenGstins.get(payload.gstNumber)}`,
          });
        } else {
          const dup = await this.repository.findByGstNumber(tenantId, payload.gstNumber);
          if (dup) {
            rowErrors.push({
              row: rowNumber,
              field: 'gstNumber',
              message: `Customer with this GSTIN already exists (${dup.code} — ${dup.name})`,
            });
          }
        }
      }
      if (payload.phone) {
        if (seenPhones.has(payload.phone)) {
          rowErrors.push({
            row: rowNumber,
            field: 'phone',
            message: `Duplicate phone — already used on row ${seenPhones.get(payload.phone)}`,
          });
        } else {
          const dup = await this.repository.findByPhone(tenantId, payload.phone);
          if (dup) {
            rowErrors.push({
              row: rowNumber,
              field: 'phone',
              message: `Customer with this phone already exists (${dup.code} — ${dup.name})`,
            });
          }
        }
      }

      if (payload.code) {
        const dup = await this.repository.findByCode(tenantId, payload.code);
        if (dup) {
          rowErrors.push({
            row: rowNumber,
            field: 'code',
            message: `Customer code ${payload.code} is already in use`,
          });
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        failed++;
        continue;
      }

      if (payload.gstNumber) seenGstins.set(payload.gstNumber, rowNumber);
      if (payload.phone) seenPhones.set(payload.phone, rowNumber);

      if (dto.dryRun) {
        imported++;
        continue;
      }

      // Credit limit is admin-only, on import as well as on the form.
      if (!isAdmin(user)) delete payload.creditLimit;

      try {
        payload.code = payload.code || (await this.numbering.nextNumber(tenantId, 'customer'));
        await this.repository.create(tenantId, payload);
        imported++;
      } catch (e: any) {
        failed++;
        errors.push({
          row: rowNumber,
          field: 'row',
          message: e?.message || 'Failed to save row',
        });
      }
    }

    return {
      created: imported,
      imported,
      failed,
      total: rows.length,
      errors,
      dryRun: dto.dryRun === true,
    };
  }

  // ---------------------------------------------------------------- helpers

  /** Accepts camelCase or snake_case input and produces one canonical shape. */
  private normalize(dto: any): any {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (dto[k] !== undefined && dto[k] !== '') return dto[k];
      }
      // Preserve an explicit empty string (used to clear a field).
      for (const k of keys) if (dto[k] !== undefined) return dto[k];
      return undefined;
    };

    const trim = (v: any) => (typeof v === 'string' ? v.trim() : v);
    const emptyToNull = (v: any) => (v === '' ? null : v);

    const addressLine1 = pick('addressLine1', 'address_line1', 'address');

    // creditLimit needs raw key access: '' and null both mean "clear it",
    // which the `pick` helper would collapse.
    let creditLimit: number | null | undefined;
    const clKey =
      dto.creditLimit !== undefined ? 'creditLimit' : dto.credit_limit !== undefined ? 'credit_limit' : null;
    if (clKey) {
      const raw = dto[clKey];
      if (raw === null || raw === '') {
        creditLimit = null;
      } else {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new BadRequestException('creditLimit must be a number');
        creditLimit = n;
      }
    }

    const out: any = {
      code: emptyToNull(trim(pick('code'))),
      name: trim(pick('name')),
      customerType: trim(pick('customerType', 'customer_type', 'type')),
      contactPerson: emptyToNull(trim(pick('contactPerson', 'contact_person'))),
      phone: emptyToNull(trim(pick('phone'))),
      whatsappNumber: emptyToNull(trim(pick('whatsappNumber', 'whatsapp_number'))),
      email: emptyToNull(trim(pick('email'))),
      gstNumber: emptyToNull(trim(pick('gstNumber', 'gst_number', 'gstin'))),
      panNumber: emptyToNull(trim(pick('panNumber', 'pan_number'))),
      addressLine1: emptyToNull(trim(addressLine1)),
      addressLine2: emptyToNull(trim(pick('addressLine2', 'address_line2'))),
      city: emptyToNull(trim(pick('city'))),
      state: emptyToNull(trim(pick('state'))),
      postalCode: emptyToNull(trim(pick('pincode', 'postalCode', 'postal_code'))),
      country: emptyToNull(trim(pick('country'))),
      paymentTerms: trim(pick('paymentTerms', 'payment_terms')),
      creditLimit,
      notes: emptyToNull(pick('notes')),
      status: trim(pick('status')),
    };

    if (out.gstNumber) out.gstNumber = String(out.gstNumber).toUpperCase();
    if (out.panNumber) out.panNumber = String(out.panNumber).toUpperCase();
    if (out.customerType) out.customerType = String(out.customerType).toLowerCase();
    if (out.paymentTerms) {
      out.paymentTerms = String(out.paymentTerms).toLowerCase().replace(/[\s-]+/g, '_');
    }
    if (out.status) out.status = String(out.status).toLowerCase();

    for (const key of Object.keys(out)) {
      if (out[key] === undefined) delete out[key];
    }
    return out;
  }

  /**
   * Spec §4: B2B needs a valid 15-character GSTIN, B2C must not carry one, and
   * the state is taken from the GSTIN's first two digits (it decides
   * CGST+SGST vs IGST on every invoice, so it must not be hand-typed).
   */
  private applyGstRules(payload: any): void {
    const customerType = (payload.customerType || 'b2b').toLowerCase();
    payload.customerType = customerType;

    const gstin = payload.gstNumber ? String(payload.gstNumber).trim().toUpperCase() : null;

    if (customerType === 'b2c') {
      if (gstin) {
        throw new BadRequestException(
          'A B2C customer must not have a GSTIN. Set customerType to "b2b" to record one.',
        );
      }
      payload.gstNumber = null;
      return;
    }

    if (!gstin) {
      throw new BadRequestException('GSTIN is required for a B2B customer');
    }
    if (!GSTIN_REGEX.test(gstin)) {
      throw new BadRequestException(
        `Invalid GSTIN "${gstin}". A GSTIN is 15 characters: 2 state digits, 10-character PAN, entity digit, "Z", checksum.`,
      );
    }

    const state = stateFromGstin(gstin);
    if (!state) {
      throw new BadRequestException(
        `Invalid GSTIN "${gstin}": "${gstin.slice(0, 2)}" is not a recognised GST state code.`,
      );
    }

    payload.gstNumber = gstin;
    payload.state = state;
  }

  /**
   * Spec §7: managers may create and edit customers but never set or change a
   * credit limit. Enforced here, not only in the UI — a hand-rolled request
   * with `creditLimit` in the body gets the field dropped before it reaches
   * the repository. `creditLimitIgnored` is surfaced so the UI can say so.
   */
  private stripAdminOnlyFields(payload: any, user?: AuthUser): boolean {
    if (isAdmin(user)) return false;
    const attempted = payload.creditLimit !== undefined;
    delete payload.creditLimit;
    return attempted;
  }

  /** Exposed for tooling/tests: the GST state-code table used for derivation. */
  static get gstStateCodes() {
    return GST_STATE_CODES;
  }
}
