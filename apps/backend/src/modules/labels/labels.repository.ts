import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** Hard ceiling on one label batch — see LabelsService for the reasoning. */
export const LABEL_BATCH_LIMIT = 2000;

export interface LabelBinFilters {
  warehouseId?: string;
  zoneId?: string;
  rackId?: string;
  binIds?: string[];
}

export interface LabelSkuFilters {
  skuIds?: string[];
  category?: string;
  search?: string;
}

@Injectable()
export class LabelsRepository {
  constructor(private db: DatabaseService) {}

  /**
   * Every field a location label prints, resolved in one query. The frontend
   * used to need bins + racks + zones + warehouses to render one sticker.
   */
  async findBins(tenantId: string, filters: LabelBinFilters) {
    const params: any[] = [tenantId];
    const conditions: string[] = ['b.tenant_id = $1'];
    let idx = 2;

    if (filters.warehouseId) {
      conditions.push(`b.warehouse_id = $${idx}`);
      params.push(filters.warehouseId);
      idx++;
    }
    if (filters.zoneId) {
      conditions.push(`b.zone_id = $${idx}`);
      params.push(filters.zoneId);
      idx++;
    }
    if (filters.rackId) {
      conditions.push(`b.rack_id = $${idx}`);
      params.push(filters.rackId);
      idx++;
    }
    // An empty (but present) list means "these zero bins", not "no filter".
    if (filters.binIds) {
      conditions.push(`b.id = ANY($${idx}::uuid[])`);
      params.push(filters.binIds);
      idx++;
    }

    const where = conditions.join(' AND ');

    // Ask for one more than the cap so the caller can tell "exactly full" from
    // "truncated" without a second COUNT(*) over the same predicate.
    const rows = await this.db.query(
      `SELECT b.id, b.code, b.level, b.position,
              z.name  AS zone_name,
              r.code  AS rack_code,
              a.code  AS aisle_code,
              w.name  AS warehouse_name
         FROM bins b
         LEFT JOIN zones z      ON b.zone_id = z.id
         LEFT JOIN racks r      ON b.rack_id = r.id
         LEFT JOIN aisles a     ON r.aisle_id = a.id
         LEFT JOIN warehouses w ON b.warehouse_id = w.id
        WHERE ${where}
        ORDER BY w.name NULLS LAST, z.name NULLS LAST, r.code NULLS LAST, b.level, b.position, b.code
        LIMIT $${idx}`,
      [...params, LABEL_BATCH_LIMIT + 1],
    );

    return rows.rows.map(this.mapBin);
  }

  async findSkus(tenantId: string, filters: LabelSkuFilters) {
    const params: any[] = [tenantId];
    const conditions: string[] = ['s.tenant_id = $1'];
    let idx = 2;

    if (filters.skuIds) {
      conditions.push(`s.id = ANY($${idx}::uuid[])`);
      params.push(filters.skuIds);
      idx++;
    }
    if (filters.category) {
      conditions.push(`s.category = $${idx}`);
      params.push(filters.category);
      idx++;
    }
    if (filters.search) {
      conditions.push(
        `(s.code ILIKE $${idx} OR s.name ILIKE $${idx} OR s.barcode ILIKE $${idx})`,
      );
      params.push(`%${filters.search}%`);
      idx++;
    }

    const result = await this.db.query(
      `SELECT s.id, s.code, s.name, s.barcode, s.uom, s.category
         FROM skus s
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.code
        LIMIT $${idx}`,
      [...params, LABEL_BATCH_LIMIT + 1],
    );

    return result.rows.map(this.mapSku);
  }

  private mapBin(row: any) {
    return {
      id: row.id,
      code: row.code,
      zoneName: row.zone_name ?? null,
      rackCode: row.rack_code ?? null,
      aisleCode: row.aisle_code ?? null,
      warehouseName: row.warehouse_name ?? null,
      level: row.level,
      position: row.position,
    };
  }

  private mapSku(row: any) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      barcode: row.barcode ?? null,
      uom: row.uom,
      category: row.category,
    };
  }
}
