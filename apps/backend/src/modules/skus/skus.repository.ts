import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { QuerySkuDto } from './dto';

@Injectable()
export class SkusRepository {
  constructor(private db: DatabaseService) {}

  async findAll(tenantId: string, query: QuerySkuDto) {
    const { page = 1, limit = 50, search, category, status, sortBy = 'created_at', sortOrder = 'DESC' } = query;
    const offset = (page - 1) * limit;
    const params: any[] = [tenantId];
    const conditions: string[] = ['s.tenant_id = $1'];
    let paramIndex = 2;

    if (search) {
      conditions.push(`(s.code ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex} OR s.barcode ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (category) {
      conditions.push(`s.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    if (status) {
      conditions.push(`s.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const allowedSort = ['code', 'name', 'category', 'created_at', 'cost_price', 'selling_price'];
    const safeSort = allowedSort.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where = conditions.join(' AND ');

    const countResult = await this.db.query(`SELECT COUNT(*) FROM skus s WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await this.db.query(
      `SELECT s.* FROM skus s WHERE ${where} ORDER BY s.${safeSort} ${safeOrder} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    return { data: dataResult.rows.map(this.mapRow), total };
  }

  async findById(tenantId: string, id: string) {
    const result = await this.db.query('SELECT * FROM skus WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByCode(tenantId: string, code: string) {
    const result = await this.db.query('SELECT * FROM skus WHERE code = $1 AND tenant_id = $2', [code, tenantId]);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async getNextCode(tenantId: string): Promise<string> {
    const result = await this.db.query(
      `SELECT code FROM skus WHERE tenant_id = $1 AND code LIKE 'SKU-%' ORDER BY code DESC LIMIT 1`,
      [tenantId],
    );
    if (result.rows.length === 0) return 'SKU-001';
    const lastNum = parseInt(result.rows[0].code.replace('SKU-', ''), 10);
    return `SKU-${String(lastNum + 1).padStart(3, '0')}`;
  }

  async create(tenantId: string, data: any) {
    const result = await this.db.query(
      `INSERT INTO skus (tenant_id, code, name, category, subcategory, brand, description, uom, weight, length, width, height, barcode, hsn_code, gst_rate, cost_price, selling_price, reorder_point, reorder_qty, min_stock, max_stock, batch_tracking, expiry_tracking, serial_tracking, shelf_life_days, storage_type, hazardous, fragile, tags, status, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
       RETURNING *`,
      [
        tenantId, data.code, data.name, data.category || 'general', data.subcategory || null, data.brand || null,
        data.description || null, data.uom || 'pcs', data.weight || 0, data.length || 0, data.width || 0, data.height || 0,
        data.barcode || null, data.hsnCode || null, data.gstRate || 0, data.costPrice || 0, data.sellingPrice || 0,
        data.reorderPoint || 0, data.reorderQty || 0, data.minStock || 0, data.maxStock || 0,
        data.batchTracking || false, data.expiryTracking || false, data.serialTracking || false,
        data.shelfLifeDays || null, data.storageType || 'ambient', data.hazardous || false, data.fragile || false,
        data.tags || null, data.status || 'active', data.imageUrl || null,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async update(tenantId: string, id: string, data: any) {
    const fields: string[] = [];
    const params: any[] = [id, tenantId];
    let idx = 3;

    const mappings: Record<string, string> = {
      name: 'name', category: 'category', subcategory: 'subcategory', brand: 'brand', description: 'description',
      uom: 'uom', weight: 'weight', length: 'length', width: 'width', height: 'height',
      barcode: 'barcode', hsnCode: 'hsn_code', gstRate: 'gst_rate', costPrice: 'cost_price', sellingPrice: 'selling_price',
      reorderPoint: 'reorder_point', reorderQty: 'reorder_qty', minStock: 'min_stock', maxStock: 'max_stock',
      batchTracking: 'batch_tracking', expiryTracking: 'expiry_tracking', serialTracking: 'serial_tracking',
      shelfLifeDays: 'shelf_life_days', storageType: 'storage_type', hazardous: 'hazardous', fragile: 'fragile',
      tags: 'tags', status: 'status', imageUrl: 'image_url',
    };

    for (const [key, col] of Object.entries(mappings)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${idx}`);
        params.push(data[key]);
        idx++;
      }
    }

    if (fields.length === 0) return this.findById(tenantId, id);

    fields.push('updated_at = NOW()');
    const result = await this.db.query(
      `UPDATE skus SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async delete(tenantId: string, id: string) {
    const result = await this.db.query('DELETE FROM skus WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Barcodes ───────────────────────────────────────────────────────────────

  /**
   * Writes a barcode straight onto one SKU. Kept separate from `update()` so
   * the barcode-issuing paths never have to route a value through the generic
   * whitelist, and so a unique violation surfaces from a single known column.
   */
  async setBarcode(tenantId: string, id: string, barcode: string) {
    const result = await this.db.query(
      'UPDATE skus SET barcode = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [id, tenantId, barcode],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /** Ids of every SKU in the tenant that has no barcode yet, oldest first. */
  async findIdsMissingBarcode(tenantId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT id FROM skus
        WHERE tenant_id = $1 AND (barcode IS NULL OR barcode = '')
        ORDER BY created_at, id`,
      [tenantId],
    );
    return result.rows.map((row: any) => row.id);
  }

  private mapRow(row: any) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      brand: row.brand,
      description: row.description,
      uom: row.uom,
      weight: parseFloat(row.weight) || 0,
      dimensions: { length: parseFloat(row.length) || 0, width: parseFloat(row.width) || 0, height: parseFloat(row.height) || 0 },
      barcode: row.barcode,
      hsnCode: row.hsn_code,
      gstRate: parseFloat(row.gst_rate) || 0,
      costPrice: parseFloat(row.cost_price) || 0,
      sellingPrice: parseFloat(row.selling_price) || 0,
      reorderPoint: row.reorder_point,
      reorderQty: row.reorder_qty,
      minStock: row.min_stock,
      maxStock: row.max_stock,
      batchTracking: row.batch_tracking,
      expiryTracking: row.expiry_tracking,
      serialTracking: row.serial_tracking,
      shelfLifeDays: row.shelf_life_days,
      storageType: row.storage_type,
      hazardous: row.hazardous,
      fragile: row.fragile,
      tags: row.tags,
      status: row.status,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
