import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PoolClient } from 'pg';

/**
 * Statuses a sales order carries through the outbound tail. `picked` is what
 * makes an order appear on the packing queue; `ready_for_dispatch` is what makes
 * it appear on the dispatch/shipment queue and nowhere else.
 */
export const ORDER_STATUS = {
  picked: 'picked',
  packing: 'packing',
  packed: 'packed',
  readyForDispatch: 'ready_for_dispatch',
} as const;

@Injectable()
export class PackingRepository {
  constructor(private db: DatabaseService) {}

  /**
   * Orders whose picking is finished and which are waiting to be packed, plus
   * orders a packer has already opened (so a half-packed order is not lost from
   * the queue if the packer walks away).
   */
  async findPackableOrders(
    tenantId: string,
    query: { search?: string; warehouseId?: string; page?: number; limit?: number },
  ): Promise<{ data: any[]; total: number }> {
    const limit = Number(query.limit) || 50;
    const page = Math.max(1, Number(query.page) || 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = [
      'so.tenant_id = $1',
      `so.status IN ('${ORDER_STATUS.picked}', '${ORDER_STATUS.packing}', '${ORDER_STATUS.packed}')`,
    ];
    const params: any[] = [tenantId];
    let idx = 2;

    if (query.search) {
      conditions.push(`(so.so_number ILIKE $${idx} OR COALESCE(so.customer_name, c.name) ILIKE $${idx})`);
      params.push(`%${query.search}%`);
      idx++;
    }
    if (query.warehouseId) {
      conditions.push(`so.warehouse_id = $${idx}`);
      params.push(query.warehouseId);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countRes = await this.db.query(
      `SELECT COUNT(*) AS count
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
        WHERE ${where}`,
      params,
    );

    const dataRes = await this.db.query(
      `SELECT so.id,
              so.so_number,
              so.status,
              so.warehouse_id,
              so.shipping_address,
              COALESCE(so.customer_name, c.name) AS customer_name,
              w.name AS warehouse_name,
              (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.so_id = so.id) AS item_count,
              ps.id AS packing_session_id,
              ps.status AS packing_status
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         LEFT JOIN warehouses w ON so.warehouse_id = w.id
         LEFT JOIN packing_sessions ps ON ps.so_id = so.id AND ps.status <> 'cancelled'
        WHERE ${where}
        ORDER BY so.created_at ASC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    );

    return {
      total: parseInt(countRes.rows[0].count, 10),
      data: dataRes.rows.map((r) => ({
        id: r.id,
        soNumber: r.so_number,
        status: r.status,
        packingStatus: r.packing_status ?? null,
        packingSessionId: r.packing_session_id ?? null,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        customerName: r.customer_name,
        shippingAddress: r.shipping_address,
        itemCount: parseInt(r.item_count ?? '0', 10),
      })),
    };
  }

  async findOrder(soId: string, tenantId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT so.id,
              so.so_number,
              so.status,
              so.warehouse_id,
              so.shipping_address,
              COALESCE(so.customer_name, c.name) AS customer_name,
              c.phone AS customer_phone,
              w.name AS warehouse_name
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         LEFT JOIN warehouses w ON so.warehouse_id = w.id
        WHERE so.id = $1 AND so.tenant_id = $2`,
      [soId, tenantId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      soNumber: r.so_number,
      status: r.status,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      shippingAddress: r.shipping_address,
    };
  }

  /**
   * THE fix for the blank packing screen.
   *
   * Sums what picking actually delivered for one order, per SKU, across every
   * completed pick list that touched it. Both linkage routes are honoured:
   * `pick_list_items.so_id` (set for every strategy since migration 049) and
   * `pick_lists.so_id` (the single-order header), because older rows created
   * before 049 only carry the header link.
   *
   * Only `completed` pick lists count — a half-finished pick must not present
   * itself to the packer as ready to go in a box.
   */
  async findPickedQuantities(tenantId: string, soId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT pli.sku_id,
              sk.code AS sku_code,
              sk.name AS sku_name,
              sk.barcode AS sku_barcode,
              sk.weight AS sku_weight,
              sk.length AS sku_length, sk.width AS sku_width, sk.height AS sku_height,
              SUM(pli.quantity_picked)::int AS picked_quantity
         FROM pick_list_items pli
         JOIN pick_lists pl ON pli.pick_list_id = pl.id
         LEFT JOIN skus sk ON pli.sku_id = sk.id
        WHERE pl.tenant_id = $1
          AND pl.status = 'completed'
          AND (pli.so_id = $2 OR (pli.so_id IS NULL AND pl.so_id = $2))
          AND pli.quantity_picked > 0
        GROUP BY pli.sku_id, sk.code, sk.name, sk.barcode, sk.weight, sk.length, sk.width, sk.height
        ORDER BY sk.code`,
      [tenantId, soId],
    );
    return res.rows.map((r) => ({
      skuId: r.sku_id,
      skuCode: r.sku_code,
      skuName: r.sku_name,
      skuBarcode: r.sku_barcode,
      weightKg: r.sku_weight === null ? null : Number(r.sku_weight),
      lengthCm: r.sku_length === null ? null : Number(r.sku_length),
      widthCm: r.sku_width === null ? null : Number(r.sku_width),
      heightCm: r.sku_height === null ? null : Number(r.sku_height),
      pickedQuantity: parseInt(r.picked_quantity ?? '0', 10),
    }));
  }

  async findLiveSession(tenantId: string, soId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT * FROM packing_sessions
        WHERE tenant_id = $1 AND so_id = $2 AND status <> 'cancelled'
        LIMIT 1`,
      [tenantId, soId],
    );
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  async findSessionById(tenantId: string, sessionId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT * FROM packing_sessions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, sessionId],
    );
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  /**
   * Opens a session and seeds its items from the completed pick lists, in one
   * transaction so a session can never exist with no lines.
   */
  async createSession(
    tenantId: string,
    args: { soId: string; warehouseId: string | null; packedBy?: string | null; items: any[] },
  ): Promise<any> {
    return this.db.transaction(async (client) => {
      const sessionRes = await client.query(
        `INSERT INTO packing_sessions (tenant_id, so_id, warehouse_id, status, packed_by, started_at)
         VALUES ($1, $2, $3, 'packing', $4, NOW())
         RETURNING *`,
        [tenantId, args.soId, args.warehouseId, args.packedBy ?? null],
      );
      const session = sessionRes.rows[0];

      for (const item of args.items) {
        await client.query(
          `INSERT INTO packing_session_items (packing_session_id, sku_id, picked_quantity, packed_quantity, status)
           VALUES ($1, $2, $3, 0, 'pending')
           ON CONFLICT (packing_session_id, sku_id) DO UPDATE SET picked_quantity = EXCLUDED.picked_quantity`,
          [session.id, item.skuId, item.pickedQuantity],
        );
      }

      await client.query(
        `UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [ORDER_STATUS.packing, args.soId, tenantId],
      );

      return this.mapSession(session);
    });
  }

  async findSessionItems(sessionId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT psi.*,
              sk.code AS sku_code, sk.name AS sku_name, sk.barcode AS sku_barcode,
              sk.weight AS sku_weight,
              sk.length AS sku_length, sk.width AS sku_width, sk.height AS sku_height,
              pp.package_number
         FROM packing_session_items psi
         LEFT JOIN skus sk ON psi.sku_id = sk.id
         LEFT JOIN packing_packages pp ON psi.package_id = pp.id
        WHERE psi.packing_session_id = $1
        ORDER BY sk.code`,
      [sessionId],
    );
    return res.rows.map((r) => this.mapItem(r));
  }

  async findPackages(sessionId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM packing_packages WHERE packing_session_id = $1 ORDER BY package_number`,
      [sessionId],
    );
    return res.rows.map((r) => this.mapPackage(r));
  }

  async findItemById(itemId: string, sessionId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT psi.*, sk.code AS sku_code, sk.name AS sku_name, sk.barcode AS sku_barcode,
              sk.weight AS sku_weight, sk.length AS sku_length, sk.width AS sku_width, sk.height AS sku_height,
              pp.package_number
         FROM packing_session_items psi
         LEFT JOIN skus sk ON psi.sku_id = sk.id
         LEFT JOIN packing_packages pp ON psi.package_id = pp.id
        WHERE psi.id = $1 AND psi.packing_session_id = $2`,
      [itemId, sessionId],
    );
    return res.rows[0] ? this.mapItem(res.rows[0]) : null;
  }

  /** Candidate rows for a scan: unpacked lines of this session with their SKU identifiers. */
  async findScanCandidates(sessionId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT psi.id, psi.sku_id, psi.picked_quantity, psi.packed_quantity, psi.status,
              sk.code AS sku_code, sk.barcode AS sku_barcode, sk.name AS sku_name
         FROM packing_session_items psi
         LEFT JOIN skus sk ON psi.sku_id = sk.id
        WHERE psi.packing_session_id = $1
        ORDER BY sk.code`,
      [sessionId],
    );
    return res.rows;
  }

  async setPackedQuantity(itemId: string, packedQuantity: number, status: string): Promise<void> {
    await this.db.query(
      `UPDATE packing_session_items
          SET packed_quantity = $1, status = $2, updated_at = NOW()
        WHERE id = $3`,
      [packedQuantity, status, itemId],
    );
  }

  async assignItemToPackage(itemId: string, packageId: string | null): Promise<void> {
    await this.db.query(
      `UPDATE packing_session_items SET package_id = $1, updated_at = NOW() WHERE id = $2`,
      [packageId, itemId],
    );
  }

  async nextPackageNumber(sessionId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COALESCE(MAX(package_number), 0) + 1 AS next FROM packing_packages WHERE packing_session_id = $1`,
      [sessionId],
    );
    return parseInt(res.rows[0].next, 10);
  }

  async createPackage(sessionId: string, dto: any): Promise<any> {
    const res = await this.db.query(
      `INSERT INTO packing_packages
         (packing_session_id, package_number, box_id, box_name, length_cm, width_cm, height_cm, weight_kg)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sessionId,
        dto.packageNumber,
        dto.boxId ?? null,
        dto.boxName ?? null,
        dto.lengthCm ?? null,
        dto.widthCm ?? null,
        dto.heightCm ?? null,
        dto.weightKg ?? null,
      ],
    );
    return this.mapPackage(res.rows[0]);
  }

  async findPackageById(packageId: string, sessionId: string): Promise<any | null> {
    const res = await this.db.query(
      `SELECT * FROM packing_packages WHERE id = $1 AND packing_session_id = $2`,
      [packageId, sessionId],
    );
    return res.rows[0] ? this.mapPackage(res.rows[0]) : null;
  }

  async updatePackage(packageId: string, fields: Record<string, any>): Promise<any> {
    const columns: Record<string, string> = {
      boxId: 'box_id',
      boxName: 'box_name',
      lengthCm: 'length_cm',
      widthCm: 'width_cm',
      heightCm: 'height_cm',
      weightKg: 'weight_kg',
    };
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = $${idx}`);
        params.push(fields[key]);
        idx++;
      }
    }
    if (sets.length === 0) return this.findPackageByIdUnscoped(packageId);
    params.push(packageId);
    const res = await this.db.query(
      `UPDATE packing_packages SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params,
    );
    return this.mapPackage(res.rows[0]);
  }

  private async findPackageByIdUnscoped(packageId: string): Promise<any | null> {
    const res = await this.db.query(`SELECT * FROM packing_packages WHERE id = $1`, [packageId]);
    return res.rows[0] ? this.mapPackage(res.rows[0]) : null;
  }

  async deletePackage(packageId: string): Promise<void> {
    // Items referencing it are detached by ON DELETE SET NULL.
    await this.db.query(`DELETE FROM packing_packages WHERE id = $1`, [packageId]);
  }

  async updateSession(sessionId: string, tenantId: string, fields: Record<string, any>): Promise<any> {
    const columns: Record<string, string> = {
      status: 'status',
      packedBy: 'packed_by',
      packedAt: 'packed_at',
      completedAt: 'completed_at',
      carrier: 'carrier',
      trackingNumber: 'tracking_number',
      labelSource: 'label_source',
      labelUrl: 'label_url',
      labelPrintedAt: 'label_printed_at',
      notes: 'notes',
    };
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = $${idx}`);
        params.push(fields[key]);
        idx++;
      }
    }
    if (sets.length === 0) return this.findSessionById(tenantId, sessionId);
    params.push(sessionId, tenantId);
    const res = await this.db.query(
      `UPDATE packing_sessions SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      params,
    );
    return res.rows[0] ? this.mapSession(res.rows[0]) : null;
  }

  /**
   * Completing packing is one transaction: the session closes, the order moves
   * to ready_for_dispatch, and the shipment gets the weight and package count
   * the courier will price on. A partial apply here would strand an order that
   * looks packed but never reaches dispatch.
   */
  async completeSession(
    tenantId: string,
    sessionId: string,
    soId: string,
    totals: { weightKg: number; packageCount: number },
  ): Promise<any> {
    return this.db.transaction(async (client: PoolClient) => {
      const sessionRes = await client.query(
        `UPDATE packing_sessions
            SET status = $1, packed_at = COALESCE(packed_at, NOW()), completed_at = NOW(), updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3
          RETURNING *`,
        [ORDER_STATUS.readyForDispatch, sessionId, tenantId],
      );

      await client.query(
        `UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [ORDER_STATUS.readyForDispatch, soId, tenantId],
      );

      // Carry the measured weight onto an existing pending shipment if one was
      // pre-created for this order; dispatch reads it from there.
      await client.query(
        `UPDATE shipments
            SET weight = $1, updated_at = NOW()
          WHERE so_id = $2 AND tenant_id = $3 AND status = 'pending'`,
        [totals.weightKg, soId, tenantId],
      );

      return sessionRes.rows[0] ? this.mapSession(sessionRes.rows[0]) : null;
    });
  }

  async updateOrderStatus(tenantId: string, soId: string, status: string): Promise<void> {
    await this.db.query(
      `UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [status, soId, tenantId],
    );
  }

  /** Box master rows, smallest first, for the fitting suggestion. */
  async findActiveBoxes(tenantId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT id, code, name, length_cm, width_cm, height_cm, max_weight_kg, box_type, cost
         FROM packaging_boxes
        WHERE tenant_id = $1 AND COALESCE(status, 'active') = 'active'
        ORDER BY (COALESCE(length_cm,0) * COALESCE(width_cm,0) * COALESCE(height_cm,0)) ASC`,
      [tenantId],
    );
    return res.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      lengthCm: r.length_cm === null ? null : Number(r.length_cm),
      widthCm: r.width_cm === null ? null : Number(r.width_cm),
      heightCm: r.height_cm === null ? null : Number(r.height_cm),
      maxWeightKg: r.max_weight_kg === null ? null : Number(r.max_weight_kg),
      boxType: r.box_type,
      cost: r.cost === null ? null : Number(r.cost),
    }));
  }

  private mapSession(r: any) {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      soId: r.so_id,
      warehouseId: r.warehouse_id,
      status: r.status,
      packedBy: r.packed_by,
      startedAt: r.started_at,
      packedAt: r.packed_at,
      completedAt: r.completed_at,
      carrier: r.carrier,
      trackingNumber: r.tracking_number,
      labelSource: r.label_source,
      labelUrl: r.label_url,
      labelPrintedAt: r.label_printed_at,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private mapItem(r: any) {
    return {
      id: r.id,
      packingSessionId: r.packing_session_id,
      skuId: r.sku_id,
      skuCode: r.sku_code,
      skuName: r.sku_name,
      skuBarcode: r.sku_barcode,
      weightKg: r.sku_weight === null || r.sku_weight === undefined ? null : Number(r.sku_weight),
      lengthCm: r.sku_length === null || r.sku_length === undefined ? null : Number(r.sku_length),
      widthCm: r.sku_width === null || r.sku_width === undefined ? null : Number(r.sku_width),
      heightCm: r.sku_height === null || r.sku_height === undefined ? null : Number(r.sku_height),
      pickedQuantity: parseInt(r.picked_quantity ?? '0', 10),
      packedQuantity: parseInt(r.packed_quantity ?? '0', 10),
      packageId: r.package_id ?? null,
      packageNumber: r.package_number ?? null,
      status: r.status,
    };
  }

  private mapPackage(r: any) {
    return {
      id: r.id,
      packingSessionId: r.packing_session_id,
      packageNumber: r.package_number,
      boxId: r.box_id,
      boxName: r.box_name,
      lengthCm: r.length_cm === null ? null : Number(r.length_cm),
      widthCm: r.width_cm === null ? null : Number(r.width_cm),
      heightCm: r.height_cm === null ? null : Number(r.height_cm),
      weightKg: r.weight_kg === null ? null : Number(r.weight_kg),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
