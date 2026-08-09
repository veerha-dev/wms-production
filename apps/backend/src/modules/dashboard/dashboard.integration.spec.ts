import { DatabaseService } from '../../database/database.service';
import { runWithTenant } from '../common/tenant.context';
import { DashboardService } from './dashboard.service';
import { SalesOrdersRepository } from '../sales-orders/sales-orders.repository';

/**
 * Integration tests against a real Postgres. The manager dashboard shipped
 * broken for its whole life because `sales_orders.expected_delivery_date` was
 * queried but never created by any migration — every request 500'd with
 * 42703 and the page span forever. A mocked database cannot catch that class
 * of bug, so these tests run the real SQL:
 *
 *   - every query in getManagerStats resolves against the live schema;
 *   - "due today" counts only orders whose promised date IS today;
 *   - an order with a NULL delivery date is never due (migration 091 leaves
 *     all pre-existing rows NULL on purpose).
 *
 * Skipped (not failed) when DATABASE_URL is absent, so CI stays green without
 * a database. Run them with:
 *
 *   DATABASE_URL=postgresql://user:pass@host:5432/db npx jest dashboard.integration
 */

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('manager dashboard — integration (real Postgres)', () => {
  let db: DatabaseService;
  let service: DashboardService;
  let repository: SalesOrdersRepository;
  let tenantId: string;
  let warehouseId: string;
  let otherWarehouseId: string;
  let seq = 0;

  const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(tenantId, fn);

  const newWarehouse = async (name: string): Promise<string> => {
    const res = await db.query(
      `INSERT INTO warehouses (tenant_id, code, name, address_line1, city, state)
       VALUES ($1, $2, $3, 'Test Road', 'Hyderabad', 'Telangana') RETURNING id`,
      [tenantId, `DBT-${Date.now()}-${++seq}`, name],
    );
    return res.rows[0].id;
  };

  /** Inserts an order directly so the date and status are exactly as stated. */
  const newOrder = async (opts: {
    status: string;
    expectedDeliveryDate: string | null;
    warehouse?: string;
  }): Promise<string> => {
    const res = await db.query(
      `INSERT INTO sales_orders (tenant_id, so_number, warehouse_id, status, expected_delivery_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        tenantId,
        `DBT-SO-${Date.now()}-${++seq}`,
        opts.warehouse ?? warehouseId,
        opts.status,
        opts.expectedDeliveryDate,
      ],
    );
    return res.rows[0].id;
  };

  beforeAll(async () => {
    db = new DatabaseService({ get: () => DATABASE_URL } as any);
    await db.onModuleInit();

    const tenantRes = await db.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      ['Dashboard Tests', `dbt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
    );
    tenantId = tenantRes.rows[0].id;

    warehouseId = await newWarehouse('Dashboard Test Hub');
    otherWarehouseId = await newWarehouse('Dashboard Test Depot');

    repository = new SalesOrdersRepository(db);
    // getManagerStats touches neither of the other two collaborators.
    service = new DashboardService(db, {} as any, {} as any);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    if (tenantId) {
      await db.query(`DELETE FROM sales_order_items WHERE so_id IN (SELECT id FROM sales_orders WHERE tenant_id = $1)`, [tenantId]);
      await db.query(`DELETE FROM sales_orders WHERE tenant_id = $1`, [tenantId]);
      await db.query(`DELETE FROM warehouses WHERE tenant_id = $1`, [tenantId]);
      await db.query(`DELETE FROM document_numbering WHERE tenant_id = $1`, [tenantId]);
      await db.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
    await db.onModuleDestroy();
  }, 30000);

  beforeEach(async () => {
    await db.query(`DELETE FROM sales_orders WHERE tenant_id = $1`, [tenantId]);
  });

  // ───────────────────────────────────────────── the column actually exists ───

  it('getManagerStats runs end to end — no phantom columns left', async () => {
    const stats = await inTenant(() => service.getManagerStats(warehouseId));

    expect(stats.warehouse.id).toBe(warehouseId);
    expect(stats.kpis).toEqual(expect.objectContaining({ ordersToShipToday: expect.any(Number) }));
    expect(stats.dueToday).toEqual(
      expect.objectContaining({ total: expect.any(Number), confirmed: expect.any(Number) }),
    );
  }, 30000);

  // ──────────────────────────────────────────────────── null-date handling ───

  it('an order due today is counted; one with no promised date is not', async () => {
    await db.query(
      `INSERT INTO sales_orders (tenant_id, so_number, warehouse_id, status, expected_delivery_date)
       VALUES ($1, $2, $3, 'confirmed', CURRENT_DATE)`,
      [tenantId, `DBT-SO-DUE-${Date.now()}`, warehouseId],
    );
    await newOrder({ status: 'confirmed', expectedDeliveryDate: null });

    const stats = await inTenant(() => service.getManagerStats(warehouseId));

    expect(stats.dueToday.total).toBe(1);
    expect(stats.dueToday.confirmed).toBe(1);
    expect(stats.kpis.ordersToShipToday).toBe(1);
  }, 30000);

  it('a NULL delivery date alone produces a zero due-today count', async () => {
    await newOrder({ status: 'confirmed', expectedDeliveryDate: null });
    await newOrder({ status: 'picking', expectedDeliveryDate: null });
    await newOrder({ status: 'packing', expectedDeliveryDate: null });

    const stats = await inTenant(() => service.getManagerStats(warehouseId));

    expect(stats.dueToday.total).toBe(0);
    expect(stats.kpis.ordersToShipToday).toBe(0);
    // …but the orders themselves are still visible in the outbound pipeline.
    expect(stats.outbound.ordersConfirmed).toBe(1);
    expect(stats.outbound.picking).toBe(1);
  }, 30000);

  it('a future delivery date is not due today, an overdue one still needs shipping', async () => {
    await db.query(
      `INSERT INTO sales_orders (tenant_id, so_number, warehouse_id, status, expected_delivery_date)
       VALUES ($1, $2, $3, 'confirmed', CURRENT_DATE + INTERVAL '3 days'),
              ($1, $4, $3, 'picking',   CURRENT_DATE - INTERVAL '2 days')`,
      [tenantId, `DBT-SO-FUT-${Date.now()}`, warehouseId, `DBT-SO-OVD-${Date.now()}`],
    );

    const stats = await inTenant(() => service.getManagerStats(warehouseId));

    // Neither is due *today*.
    expect(stats.dueToday.total).toBe(0);
    // "Orders to ship today" is <= today, so the overdue one counts, the future one does not.
    expect(stats.kpis.ordersToShipToday).toBe(1);
  }, 30000);

  it('due-today ignores delivered and cancelled orders', async () => {
    await db.query(
      `INSERT INTO sales_orders (tenant_id, so_number, warehouse_id, status, expected_delivery_date)
       VALUES ($1, $2, $3, 'delivered', CURRENT_DATE),
              ($1, $4, $3, 'cancelled', CURRENT_DATE)`,
      [tenantId, `DBT-SO-DEL-${Date.now()}`, warehouseId, `DBT-SO-CAN-${Date.now()}`],
    );

    const stats = await inTenant(() => service.getManagerStats(warehouseId));

    expect(stats.dueToday.total).toBe(0);
  }, 30000);

  it('due-today is scoped to the requested warehouse', async () => {
    await db.query(
      `INSERT INTO sales_orders (tenant_id, so_number, warehouse_id, status, expected_delivery_date)
       VALUES ($1, $2, $3, 'confirmed', CURRENT_DATE)`,
      [tenantId, `DBT-SO-OTH-${Date.now()}`, otherWarehouseId],
    );

    const mine = await inTenant(() => service.getManagerStats(warehouseId));
    const theirs = await inTenant(() => service.getManagerStats(otherWarehouseId));

    expect(mine.dueToday.total).toBe(0);
    expect(theirs.dueToday.total).toBe(1);
  }, 30000);

  // ──────────────────────────────── the column is writable through the API ───

  it('the repository persists and returns an expected delivery date', async () => {
    const created = await repository.create(tenantId, {
      soNumber: `DBT-SO-REPO-${Date.now()}`,
      warehouseId,
      expected_delivery_date: '2030-01-15',
      items: [],
    });

    expect(created.expectedDeliveryDate).toBeInstanceOf(Date);
    const reread = await repository.findById(created.id, tenantId);
    expect(new Date(reread.expectedDeliveryDate).toISOString().slice(0, 10)).toBe('2030-01-15');
  }, 30000);

  it('omitting the date stores NULL rather than failing', async () => {
    const created = await repository.create(tenantId, {
      soNumber: `DBT-SO-NULL-${Date.now()}`,
      warehouseId,
      items: [],
    });

    expect(created.expectedDeliveryDate).toBeNull();
  }, 30000);

  it('an update can set and later clear the date', async () => {
    const created = await repository.create(tenantId, {
      soNumber: `DBT-SO-UPD-${Date.now()}`,
      warehouseId,
      items: [],
    });

    const set = await repository.update(created.id, tenantId, { expectedDeliveryDate: '2031-06-01' });
    expect(new Date(set.expectedDeliveryDate).toISOString().slice(0, 10)).toBe('2031-06-01');

    // An emptied date input arrives as '' — it must clear the column, not blow
    // up on an invalid DATE literal.
    const cleared = await repository.update(created.id, tenantId, { expected_delivery_date: '' });
    expect(cleared.expectedDeliveryDate).toBeNull();
  }, 30000);
});
