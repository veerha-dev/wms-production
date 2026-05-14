import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { SkusRepository } from '../skus/skus.repository';
import { InventoryService } from '../inventory/inventory.service';
import { getCurrentTenantId } from '../common/tenant.context';




@Injectable()
export class DashboardService {
  constructor(

    private db: DatabaseService,
    private skusRepository: SkusRepository,
    private inventoryService: InventoryService,
  ) {}

  async getManagerStats(warehouseId: string) {
    const tid = getCurrentTenantId();
    const [
      whRes, ordersToShip, pendingGrns, activeWorkers, pendingTasks,
      lowStock, expiringWeek, pendingQc, pendingPutaway,
      workersList, outboundRes, todayTasks, zonesRes, shipmentsRes, activityRes,
      dueTodayRes,
    ] = await Promise.all([
      this.db.query(`SELECT id, name, type, total_capacity, current_occupancy, city FROM warehouses WHERE id = $1`, [warehouseId]),
      this.db.query(`SELECT COUNT(*) as c FROM sales_orders WHERE warehouse_id = $1 AND tenant_id = $2 AND status IN ('confirmed','picking','packing') AND DATE(expected_delivery_date) <= CURRENT_DATE`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM grn WHERE warehouse_id = $1 AND tenant_id = $2 AND status = 'pending'`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM users WHERE warehouse_id = $1 AND tenant_id = $2 AND is_active = true`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM tasks WHERE warehouse_id = $1 AND tenant_id = $2 AND status NOT IN ('completed','cancelled')`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(DISTINCT sl.sku_id) as c FROM stock_levels sl JOIN skus s ON sl.sku_id = s.id WHERE sl.warehouse_id = $1 AND sl.tenant_id = $2 AND sl.quantity_available < COALESCE(s.reorder_point, 10)`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM batches b JOIN stock_levels sl ON b.id = sl.batch_id WHERE sl.warehouse_id = $1 AND sl.tenant_id = $2 AND b.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM qc_inspections qi JOIN grn g ON qi.grn_id = g.id WHERE g.warehouse_id = $1 AND g.tenant_id = $2 AND qi.status = 'pending'`, [warehouseId, tid]),
      this.db.query(`SELECT COUNT(*) as c FROM putaway_tasks WHERE warehouse_id = $1 AND tenant_id = $2 AND status IN ('pending','assigned')`, [warehouseId, tid]),
      this.db.query(`SELECT u.id, u.full_name, u.is_active, u.last_login, u.role,
        u.presence_status, u.last_heartbeat_at,
        t.id as task_id, t.task_number, t.task_type as task_type
        FROM users u LEFT JOIN tasks t ON t.assigned_to = u.id AND t.status = 'in_progress'
        WHERE u.warehouse_id = $1 AND u.tenant_id = $2 AND u.role IN ('worker','manager') ORDER BY u.full_name`, [warehouseId, tid]),
      this.db.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed') as orders_confirmed,
        COUNT(*) FILTER (WHERE status = 'picking') as picking,
        COUNT(*) FILTER (WHERE status = 'packing') as packing,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped
        FROM sales_orders WHERE warehouse_id = $1 AND tenant_id = $2`, [warehouseId, tid]),
      this.db.query(`SELECT t.id, t.task_number, t.task_type, t.status, t.priority, u.full_name as assigned_to_name
        FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.warehouse_id = $1 AND t.tenant_id = $2 AND DATE(t.created_at) = CURRENT_DATE
        ORDER BY t.priority DESC, t.created_at LIMIT 20`, [warehouseId, tid]),
      this.db.query(`SELECT id, name, type,
        CASE WHEN capacity_weight > 0 THEN ROUND((current_weight / capacity_weight * 100)::numeric, 1) ELSE 0 END as utilization
        FROM zones WHERE warehouse_id = $1 AND tenant_id = $2 AND is_active = true ORDER BY name`, [warehouseId, tid]),
      this.db.query(`SELECT sh.id, so.so_number, c.name as customer_name, sh.status, sh.carrier, sh.created_at
        FROM shipments sh JOIN sales_orders so ON sh.so_id = so.id LEFT JOIN customers c ON so.customer_id = c.id
        WHERE so.warehouse_id = $1 AND sh.tenant_id = $2 AND DATE(sh.created_at) = CURRENT_DATE
        ORDER BY sh.created_at DESC LIMIT 10`, [warehouseId, tid]),
      this.db.query(`SELECT id, movement_number, movement_type, quantity, created_at
        FROM stock_movements WHERE warehouse_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 15`, [warehouseId, tid]),
      // Due Today — count of SOs per stage that must dispatch today (manager-specific)
      this.db.query(`SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_due,
        COUNT(*) FILTER (WHERE status = 'picking') as picking_due,
        COUNT(*) FILTER (WHERE status = 'packing') as packing_due,
        COUNT(*) FILTER (WHERE status IN ('shipped')) as ready_due,
        COUNT(*) as total_due
        FROM sales_orders
        WHERE warehouse_id = $1 AND tenant_id = $2
          AND DATE(expected_delivery_date) = CURRENT_DATE
          AND status NOT IN ('delivered','cancelled')`, [warehouseId, tid]),
    ]);

    const wh = whRes.rows[0] || {};
    const outb = outboundRes.rows[0] || {};
    const hour = new Date().getHours();
    const shift = hour < 14 ? 'Morning Shift' : hour < 22 ? 'Afternoon Shift' : 'Night Shift';

    const workers = workersList.rows.map((w: any) => {
      // Prefer real-time presence over the simple "has-task" heuristic.
      // active = working a task or recently heartbeated
      // idle = logged in but no heartbeat for 5+ min
      // break = explicitly set 'break'
      // absent = deactivated or never seen
      let status: 'active' | 'idle' | 'break' | 'absent';
      if (!w.is_active) status = 'absent';
      else if (w.presence_status === 'break') status = 'break';
      else if (w.presence_status === 'idle') status = 'idle';
      else if (w.presence_status === 'active' || w.task_id) status = 'active';
      else status = 'idle';

      return {
        id: w.id,
        name: w.full_name,
        role: w.role,
        status,
        presenceStatus: w.presence_status || 'offline',
        currentTask: w.task_id ? { id: w.task_id, taskNumber: w.task_number, type: w.task_type } : null,
        lastActivity: w.last_heartbeat_at || w.last_login,
      };
    });

    return {
      warehouse: { id: wh.id, name: wh.name || 'Warehouse', type: wh.type || '', totalCapacity: parseInt(wh.total_capacity || 0), currentOccupancy: parseInt(wh.current_occupancy || 0), city: wh.city || '' },
      shift, date: new Date().toISOString(),
      kpis: {
        ordersToShipToday: parseInt(ordersToShip.rows[0]?.c || 0),
        pendingGRNs: parseInt(pendingGrns.rows[0]?.c || 0),
        activeWorkers: parseInt(activeWorkers.rows[0]?.c || 0),
        pendingTasks: parseInt(pendingTasks.rows[0]?.c || 0),
        lowStockItems: parseInt(lowStock.rows[0]?.c || 0),
        expiringThisWeek: parseInt(expiringWeek.rows[0]?.c || 0),
        pendingQC: parseInt(pendingQc.rows[0]?.c || 0),
        pendingPutaway: parseInt(pendingPutaway.rows[0]?.c || 0),
      },
      workers: {
        summary: { total: workers.length, active: workers.filter((w: any) => w.status === 'active').length, idle: workers.filter((w: any) => w.status === 'idle').length, absent: workers.filter((w: any) => w.status === 'absent').length },
        list: workers,
      },
      inbound: { grnPending: parseInt(pendingGrns.rows[0]?.c || 0), qcPending: parseInt(pendingQc.rows[0]?.c || 0), putawayPending: parseInt(pendingPutaway.rows[0]?.c || 0) },
      outbound: { ordersConfirmed: parseInt(outb.orders_confirmed || 0), picking: parseInt(outb.picking || 0), packing: parseInt(outb.packing || 0), shipped: parseInt(outb.shipped || 0) },
      dueToday: {
        confirmed: parseInt(dueTodayRes.rows[0]?.confirmed_due || 0),
        picking: parseInt(dueTodayRes.rows[0]?.picking_due || 0),
        packing: parseInt(dueTodayRes.rows[0]?.packing_due || 0),
        readyToShip: parseInt(dueTodayRes.rows[0]?.ready_due || 0),
        total: parseInt(dueTodayRes.rows[0]?.total_due || 0),
      },
      tasks: todayTasks.rows.map((t: any) => ({ id: t.id, taskNumber: t.task_number, type: t.task_type, status: t.status, priority: t.priority, assignedToName: t.assigned_to_name })),
      zones: zonesRes.rows.map((z: any) => ({ id: z.id, name: z.name, type: z.type, utilization: parseFloat(z.utilization || 0) })),
      shipments: shipmentsRes.rows.map((s: any) => ({ id: s.id, orderNumber: s.so_number, customerName: s.customer_name, carrier: s.carrier, status: s.status, createdAt: s.created_at })),
      recentActivity: activityRes.rows.map((a: any) => ({ id: a.id, movementNumber: a.movement_number, type: a.movement_type, quantity: parseInt(a.quantity || 0), createdAt: a.created_at })),
    };
  }

  async getStats(warehouseId?: string) {
    const tid = getCurrentTenantId();
    const tOnly = [tid];
    const tAndWh = warehouseId ? [tid, warehouseId] : tOnly;
    const whClause = warehouseId ? ' AND warehouse_id = $2' : '';

    const [
      skuCount, warehouseCount, openSOs,
      stockUnits, movements, returnsToday,
      alerts, grn, qc, shipments, tasks,
      lowStockCount, expiringCount,
    ] = await Promise.all([
      this.db.query('SELECT COUNT(*) as c FROM skus WHERE tenant_id = $1', tOnly),
      this.db.query(`SELECT COUNT(*) as c FROM warehouses WHERE tenant_id = $1 AND status != 'inactive'`, tOnly),
      this.db.query(
        `SELECT COUNT(*) as c FROM sales_orders WHERE tenant_id = $1 AND status NOT IN ('delivered','cancelled')${whClause}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COALESCE(SUM(quantity_available), 0) as total FROM stock_levels WHERE tenant_id = $1${whClause}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COUNT(*) as daily_movements,
          COALESCE(SUM(CASE WHEN movement_type IN ('stock_in','putaway','return') THEN quantity ELSE 0 END), 0) as today_inward,
          COALESCE(SUM(CASE WHEN movement_type IN ('stock_out','damage','scrap') THEN quantity ELSE 0 END), 0) as today_outward
         FROM stock_movements WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE${whClause}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM returns WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
        tOnly,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM inventory_alerts WHERE tenant_id = $1 AND is_acknowledged = false`,
        tOnly,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM grn WHERE tenant_id = $1 AND status = 'pending'${whClause}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM qc_inspections qi
         JOIN grn g ON qi.grn_id = g.id
         WHERE g.tenant_id = $1 AND qi.status = 'pending'${warehouseId ? ' AND g.warehouse_id = $2' : ''}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM shipments sh
         JOIN sales_orders so ON sh.so_id = so.id
         WHERE sh.tenant_id = $1 AND sh.status = 'pending'${warehouseId ? ' AND so.warehouse_id = $2' : ''}`,
        tAndWh,
      ),
      this.db.query(
        `SELECT COUNT(*) as c FROM tasks WHERE tenant_id = $1 AND status NOT IN ('completed','cancelled')${whClause}`,
        tAndWh,
      ),
      this.inventoryService.findLowStock(),
      this.inventoryService.findExpiring(),
    ]);

    return {
      totalSkus: parseInt(skuCount.rows[0].c),
      totalWarehouses: parseInt(warehouseCount.rows[0].c),
      openSOs: parseInt(openSOs.rows[0].c),
      totalStockUnits: parseInt(stockUnits.rows[0].total),
      dailyMovements: parseInt(movements.rows[0].daily_movements),
      todayInwardQty: parseInt(movements.rows[0].today_inward),
      todayOutwardQty: parseInt(movements.rows[0].today_outward),
      returnsToday: parseInt(returnsToday.rows[0].c),
      unacknowledgedAlerts: parseInt(alerts.rows[0].c),
      grnPending: parseInt(grn.rows[0].c),
      qcPending: parseInt(qc.rows[0].c),
      shipmentsPending: parseInt(shipments.rows[0].c),
      pendingTasks: parseInt(tasks.rows[0].c),
      lowStockItems: lowStockCount.length,
      expiringItems: expiringCount.length,
    };
  }

  async getInventoryOverview() {
    const result = await this.db.query(`
      SELECT 
        s.category,
        COUNT(*) as sku_count,
        COALESCE(SUM(sl.total_quantity), 0) as total_quantity
      FROM skus s
      LEFT JOIN (
        SELECT sku_id, SUM(quantity_available + quantity_reserved + quantity_in_transit + quantity_damaged) as total_quantity
        FROM stock_levels 
        WHERE tenant_id = $1
        GROUP BY sku_id
      ) sl ON s.id = sl.sku_id
      WHERE s.tenant_id = $1
      GROUP BY s.category
      ORDER BY sku_count DESC
    `, [getCurrentTenantId()]);

    return result.rows;
  }

  async getOrdersSummary() {
    const tid = getCurrentTenantId();
    const [poStats, soStats] = await Promise.all([
      this.db.query(`SELECT status, COUNT(*) as _count FROM purchase_orders WHERE tenant_id = $1 GROUP BY status`, [tid]),
      this.db.query(`SELECT status, COUNT(*) as _count FROM sales_orders WHERE tenant_id = $1 GROUP BY status`, [tid]),
    ]);

    return {
      poByStatus: poStats.rows.map((r: any) => ({ status: r.status, _count: parseInt(r._count) })),
      soByStatus: soStats.rows.map((r: any) => ({ status: r.status, _count: parseInt(r._count) })),
    };
  }

  async getTrendData(period: string) {
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const result = await this.db.query(`
      SELECT
        DATE(created_at) as date,
        movement_type,
        COUNT(*) as count,
        SUM(quantity) as total_quantity
      FROM stock_movements
      WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at), movement_type
      ORDER BY date
    `, [getCurrentTenantId()]);

    return result.rows;
  }

  async getRealtimeData() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [recentMovements, alerts] = await Promise.all([
      this.db.query(`
        SELECT COUNT(*) as count 
        FROM stock_movements 
        WHERE tenant_id = $1 AND created_at > $2
      `, [getCurrentTenantId(), oneHourAgo]),
      this.db.query(`
        SELECT COUNT(*) as count 
        FROM inventory_alerts 
        WHERE tenant_id = $1 AND is_acknowledged = false
      `, [getCurrentTenantId()]),
    ]);

    return {
      recentMovements: parseInt(recentMovements.rows[0].count),
      activeAlerts: parseInt(alerts.rows[0].count),
      timestamp: now,
    };
  }
}
