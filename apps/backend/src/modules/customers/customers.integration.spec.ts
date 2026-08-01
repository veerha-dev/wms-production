import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { runWithTenant } from '../common/tenant.context';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { CustomerAddressesRepository } from './customer-addresses.repository';
import { CustomersRepository } from './customers.repository';
import { AuthUser, CustomersService } from './customers.service';
import { CreateCustomerDto, QueryCustomerDto } from './dto';

/**
 * Integration tests against a real Postgres — deliberately few, covering only
 * what a mocked repository cannot prove: that the SQL actually persists every
 * column, that the UPDATE whitelist really is a whitelist, that a referenced
 * customer survives a delete, and that one tenant cannot see another's rows.
 *
 * Skipped (not failed) when DATABASE_URL is absent, so CI stays green without
 * a database. Run them with:
 *
 *   DATABASE_URL=postgresql://user:pass@host:5432/db npx jest customers.integration
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const ADMIN: AuthUser = { id: 'admin-1', role: 'admin' };
const MANAGER: AuthUser = { id: 'mgr-1', role: 'manager' };

describeDb('customers — integration (real Postgres)', () => {
  let db: DatabaseService;
  let service: CustomersService;
  let repository: CustomersRepository;
  let tenantA: string;
  let tenantB: string;
  let seq = 0;

  /** Distinct-per-test GSTIN so the unique checks never collide across tests. */
  const uniqueGstin = (stateCode = '33') =>
    `${stateCode}ABCDE${String(1000 + ++seq).slice(0, 4)}F1Z5`;

  const inA = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(tenantA, fn);
  const inB = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(tenantB, fn);

  const newTenant = async (slug: string): Promise<string> => {
    const res = await db.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Backend Tests ${slug}`, `bt-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
    );
    return res.rows[0].id;
  };

  beforeAll(async () => {
    db = new DatabaseService({ get: () => DATABASE_URL } as any);
    await db.onModuleInit();

    tenantA = await newTenant('a');
    tenantB = await newTenant('b');

    repository = new CustomersRepository(db);
    service = new CustomersService(
      repository,
      new CustomerAddressesRepository(db),
      new DocumentNumberingService(db),
    );
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    for (const tenantId of [tenantA, tenantB].filter(Boolean)) {
      // sales_orders → customers is a plain FK, so clear dependents first.
      await db.query(`DELETE FROM sales_orders WHERE tenant_id = $1`, [tenantId]);
      await db.query(
        `DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE tenant_id = $1)`,
        [tenantId],
      );
      await db.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
      await db.query(`DELETE FROM document_numbering WHERE tenant_id = $1`, [tenantId]);
      await db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
    await db.onModuleDestroy();
  }, 30000);

  // ─────────────────────────────────────────────────────────── persistence ───

  describe('create persists every field', () => {
    const dto = (): CreateCustomerDto =>
      ({
        name: 'Aruna Traders',
        customerType: 'b2b',
        contactPerson: 'Aruna K',
        phone: `9${String(400000000 + ++seq)}`,
        whatsappNumber: '9876500001',
        email: 'aruna@example.com',
        gstNumber: uniqueGstin('33'),
        panNumber: 'ABCDE1234F',
        addressLine1: '12 Mount Road',
        addressLine2: 'Guindy',
        city: 'Chennai',
        state: 'Somewhere Wrong', // must be overwritten from the GSTIN
        postalCode: '600032',
        country: 'India',
        paymentTerms: 'net_30',
        creditLimit: 250000.5,
        notes: 'Priority account',
        status: 'active',
      }) as CreateCustomerDto;

    it('round-trips every column through the database', async () => {
      const input = dto();
      const created = await inA(() => service.create(input, ADMIN));
      const readBack = await inA(() => service.findOne(created.id));

      expect(readBack).toMatchObject({
        name: 'Aruna Traders',
        customerType: 'b2b',
        contactPerson: 'Aruna K',
        phone: input.phone,
        whatsappNumber: '9876500001',
        email: 'aruna@example.com',
        gstNumber: input.gstNumber,
        panNumber: 'ABCDE1234F',
        addressLine1: '12 Mount Road',
        addressLine2: 'Guindy',
        city: 'Chennai',
        postalCode: '600032',
        country: 'India',
        paymentTerms: 'net_30',
        creditLimit: 250000.5,
        notes: 'Priority account',
        status: 'active',
      });
    });

    it('derives the state from the GSTIN rather than trusting the input', async () => {
      const created = await inA(() => service.create(dto(), ADMIN));
      expect(created.state).toBe('Tamil Nadu');
      expect(created.state).not.toBe('Somewhere Wrong');
    });

    it('stamps the caller tenant onto the row', async () => {
      const created = await inA(() => service.create(dto(), ADMIN));
      const raw = await db.query(`SELECT tenant_id FROM customers WHERE id = $1`, [created.id]);
      expect(raw.rows[0].tenant_id).toBe(tenantA);
    });

    it('auto-issues a CUST- code when none is supplied', async () => {
      const created = await inA(() => service.create(dto(), ADMIN));
      expect(created.code).toMatch(/^CUST-\d{3,}$/);
    });

    it('drops creditLimit for a non-admin caller', async () => {
      const created = await inA(() => service.create(dto(), MANAGER));
      expect(created.creditLimit).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────── update whitelist ────

  describe('update whitelist', () => {
    let id: string;
    let originalCode: string;

    beforeEach(async () => {
      const created = await inA(() =>
        service.create(
          {
            name: 'Whitelist Co',
            customerType: 'b2b',
            phone: `9${String(500000000 + ++seq)}`,
            gstNumber: uniqueGstin('27'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );
      id = created.id;
      originalCode = created.code;
    });

    it('ignores an injected tenant_id and cannot move a row between tenants', async () => {
      await repository.update(tenantA, id, {
        name: 'Renamed Co',
        tenant_id: tenantB,
        tenantId: tenantB,
      });

      const raw = await db.query(`SELECT tenant_id, name FROM customers WHERE id = $1`, [id]);
      expect(raw.rows[0].tenant_id).toBe(tenantA);
      expect(raw.rows[0].name).toBe('Renamed Co');
    });

    it('ignores an injected primary key', async () => {
      await repository.update(tenantA, id, { name: 'Still Here', id: '00000000-0000-0000-0000-000000000999' });
      const raw = await db.query(`SELECT id FROM customers WHERE id = $1`, [id]);
      expect(raw.rows).toHaveLength(1);
    });

    it.each(['created_at', 'updated_at', 'is_admin', 'password_hash', 'role', 'deleted_at'])(
      'ignores the non-whitelisted key %s instead of failing the statement',
      async (key) => {
        await expect(
          repository.update(tenantA, id, { name: 'Survives', [key]: 'anything' }),
        ).resolves.toMatchObject({ name: 'Survives' });
      },
    );

    it('ignores a key whose name is itself a SQL fragment', async () => {
      const evil = "name' = 'pwned', code = 'HACKED";
      await expect(
        repository.update(tenantA, id, { [evil]: 'x', notes: 'clean' }),
      ).resolves.toMatchObject({ notes: 'clean' });

      const raw = await db.query(`SELECT code FROM customers WHERE id = $1`, [id]);
      expect(raw.rows[0].code).toBe(originalCode);
    });

    it('treats a value containing SQL as data, not code', async () => {
      const payload = "Robert'); DROP TABLE customers; --";
      const updated = await repository.update(tenantA, id, { name: payload });
      expect(updated.name).toBe(payload);
      await expect(db.query(`SELECT COUNT(*) FROM customers`)).resolves.toBeDefined();
    });

    it('updates nothing when the payload contains only non-whitelisted keys', async () => {
      const before = await repository.findById(tenantA, id);
      const after = await repository.update(tenantA, id, { tenant_id: tenantB, hacked: true });
      expect(after.name).toBe(before.name);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('cannot be used to edit another tenant’s row', async () => {
      const result = await repository.update(tenantB, id, { name: 'Cross-tenant edit' });
      expect(result).toBeNull();
      const raw = await db.query(`SELECT name FROM customers WHERE id = $1`, [id]);
      expect(raw.rows[0].name).not.toBe('Cross-tenant edit');
    });
  });

  // ──────────────────────────────────────────────── delete vs deactivate ─────

  describe('delete with FK dependents', () => {
    const makeCustomer = async (name: string) =>
      inA(() =>
        service.create(
          {
            name,
            customerType: 'b2b',
            phone: `9${String(600000000 + ++seq)}`,
            gstNumber: uniqueGstin('29'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );

    it('hard-deletes a customer with no dependents', async () => {
      const c = await makeCustomer('Deletable Co');

      const result = await inA(() => service.remove(c.id, ADMIN));

      expect(result).toMatchObject({ deleted: true, deactivated: false });
      const raw = await db.query(`SELECT id FROM customers WHERE id = $1`, [c.id]);
      expect(raw.rows).toHaveLength(0);
    });

    it('deactivates instead of deleting when a sales order references the customer', async () => {
      const c = await makeCustomer('Referenced Co');
      await db.query(
        `INSERT INTO sales_orders (tenant_id, so_number, customer_id) VALUES ($1, $2, $3)`,
        [tenantA, `BT-SO-${++seq}-${Date.now()}`, c.id],
      );

      const result = await inA(() => service.remove(c.id, ADMIN));

      expect(result).toMatchObject({ deleted: false, deactivated: true });
      expect(result.dependents.salesOrders).toBe(1);
      expect(result.dependents.total).toBeGreaterThan(0);
    });

    it('leaves the deactivated row in place with status inactive', async () => {
      const c = await makeCustomer('Preserved Co');
      await db.query(
        `INSERT INTO sales_orders (tenant_id, so_number, customer_id) VALUES ($1, $2, $3)`,
        [tenantA, `BT-SO-${++seq}-${Date.now()}`, c.id],
      );

      await inA(() => service.remove(c.id, ADMIN));

      const raw = await db.query(`SELECT status FROM customers WHERE id = $1`, [c.id]);
      expect(raw.rows).toHaveLength(1);
      expect(raw.rows[0].status).toBe('inactive');
    });

    it('never raises a raw foreign-key violation to the caller', async () => {
      const c = await makeCustomer('No FK Error Co');
      await db.query(
        `INSERT INTO sales_orders (tenant_id, so_number, customer_id) VALUES ($1, $2, $3)`,
        [tenantA, `BT-SO-${++seq}-${Date.now()}`, c.id],
      );
      await expect(inA(() => service.remove(c.id, ADMIN))).resolves.toBeDefined();
    });

    /**
     * REPORTED, NOT FIXED — customers.repository.ts:311 `countDependents`
     * accepts `tenantId` but never puts it in the WHERE clause; every count is
     * `WHERE customer_id = $1` alone. Customer ids are UUIDs so this is not
     * exploitable today, but it is the only method in the repository that does
     * not scope by tenant. Enable this once the SQL takes tenant_id.
     */
    it.todo('countDependents should scope its counts to the calling tenant');

    it('refuses a non-admin caller before touching the row', async () => {
      const c = await makeCustomer('Protected Co');
      await expect(inA(() => service.remove(c.id, MANAGER))).rejects.toThrow(/admin/i);
      const raw = await db.query(`SELECT id FROM customers WHERE id = $1`, [c.id]);
      expect(raw.rows).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────── tenant isolation ────

  describe('cross-tenant isolation', () => {
    let inTenantA: any;
    let inTenantB: any;

    beforeAll(async () => {
      inTenantA = await inA(() =>
        service.create(
          {
            name: 'Alpha Only',
            customerType: 'b2b',
            phone: `9${String(700000000 + ++seq)}`,
            gstNumber: uniqueGstin('33'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );
      inTenantB = await inB(() =>
        service.create(
          {
            name: 'Beta Only',
            customerType: 'b2b',
            phone: `9${String(700000000 + ++seq)}`,
            gstNumber: uniqueGstin('36'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );
    }, 30000);

    it('a list in tenant A never contains a tenant B row', async () => {
      const { data } = await inA(() => service.findAll({ limit: 500 } as QueryCustomerDto));
      const ids = data.map((c: any) => c.id);
      expect(ids).toContain(inTenantA.id);
      expect(ids).not.toContain(inTenantB.id);
      expect(data.every((c: any) => c.tenantId === tenantA)).toBe(true);
    });

    it('a list in tenant B never contains a tenant A row', async () => {
      const { data } = await inB(() => service.findAll({ limit: 500 } as QueryCustomerDto));
      const ids = data.map((c: any) => c.id);
      expect(ids).toContain(inTenantB.id);
      expect(ids).not.toContain(inTenantA.id);
    });

    it('the list total counts only the caller tenant', async () => {
      const a = await inA(() => service.findAll({ limit: 500 } as QueryCustomerDto));
      const b = await inB(() => service.findAll({ limit: 500 } as QueryCustomerDto));
      const both = await db.query(
        `SELECT COUNT(*)::int AS c FROM customers WHERE tenant_id IN ($1, $2)`,
        [tenantA, tenantB],
      );
      expect(a.meta.total + b.meta.total).toBe(both.rows[0].c);
    });

    it('a search filter cannot reach across tenants', async () => {
      const hits = await inA(() => service.search('Beta Only', 50));
      expect(hits).toHaveLength(0);
    });

    it('findOne on another tenant’s id is a 404, not a leak', async () => {
      await expect(inA(() => service.findOne(inTenantB.id))).rejects.toThrow(NotFoundException);
    });

    it('a GSTIN lookup is scoped to the tenant', async () => {
      await expect(repository.findByGstNumber(tenantA, inTenantB.gstNumber)).resolves.toBeNull();
      await expect(repository.findByGstNumber(tenantB, inTenantB.gstNumber)).resolves.toMatchObject({
        id: inTenantB.id,
      });
    });

    it('stats count only the caller tenant', async () => {
      const stats = await inA(() => service.getStats());
      const raw = await db.query(
        `SELECT COUNT(*)::int AS c FROM customers WHERE tenant_id = $1`,
        [tenantA],
      );
      expect(stats.total).toBe(raw.rows[0].c);
    });

    it('the same customer code may exist in both tenants independently', async () => {
      const code = `SHARED-${++seq}`;
      const a = await inA(() =>
        service.create(
          {
            code,
            name: 'Shared Code A',
            customerType: 'b2b',
            phone: `9${String(800000000 + ++seq)}`,
            gstNumber: uniqueGstin('27'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );
      const b = await inB(() =>
        service.create(
          {
            code,
            name: 'Shared Code B',
            customerType: 'b2b',
            phone: `9${String(800000000 + ++seq)}`,
            gstNumber: uniqueGstin('24'),
          } as CreateCustomerDto,
          ADMIN,
        ),
      );
      expect(a.code).toBe(code);
      expect(b.code).toBe(code);
      expect(a.id).not.toBe(b.id);
    });
  });

  // ────────────────────────────────────────────── tenant context is required ─

  describe('tenant context', () => {
    it('a service call outside a request context throws instead of defaulting', async () => {
      await expect(service.findAll({} as QueryCustomerDto)).rejects.toThrow(/tenant/i);
    });
  });
});
