import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/**
 * The four warehouse-scoped resources exposed by Settings > Operations.
 * The literal union is the ONLY way a table name can enter a SQL string in
 * this file — user input never reaches the registry keys.
 */
export type OperationsResource =
  | 'shifts'
  | 'dock-doors'
  | 'packing-stations'
  | 'equipment';

interface ResourceConfig {
  /** Physical table name. Fixed literal, never derived from a request. */
  table: string;
  /** Whitelist: DTO key (camelCase) -> column. Used for BOTH insert and update. */
  columns: Record<string, string>;
  /** Columns returned as numbers rather than pg's string form. */
  numeric: string[];
  /** Columns a `?search=` term is matched against. */
  searchColumns: string[];
  orderBy: string;
}

const RESOURCES: Record<OperationsResource, ResourceConfig> = {
  shifts: {
    table: 'shifts',
    columns: {
      name: 'name',
      code: 'code',
      startTime: 'start_time',
      endTime: 'end_time',
      breakMinutes: 'break_minutes',
      workingDays: 'working_days',
      status: 'status',
    },
    numeric: ['break_minutes'],
    searchColumns: ['name', 'code'],
    orderBy: 'start_time ASC, name ASC',
  },
  'dock-doors': {
    table: 'dock_doors',
    columns: {
      name: 'name',
      code: 'code',
      doorType: 'door_type',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['name', 'code'],
    orderBy: 'code ASC',
  },
  'packing-stations': {
    table: 'packing_stations',
    columns: {
      name: 'name',
      code: 'code',
      zoneLocation: 'zone_location',
      hasLabelPrinter: 'has_label_printer',
      hasWeighingScale: 'has_weighing_scale',
      status: 'status',
    },
    numeric: [],
    searchColumns: ['name', 'code', 'zone_location'],
    orderBy: 'code ASC',
  },
  equipment: {
    table: 'equipment',
    columns: {
      name: 'name',
      code: 'code',
      equipmentType: 'equipment_type',
      capacityKg: 'capacity_kg',
      requiresCertifiedOperator: 'requires_certified_operator',
      status: 'status',
    },
    numeric: ['capacity_kg'],
    searchColumns: ['name', 'code', 'equipment_type'],
    orderBy: 'code ASC',
  },
};

export const OPERATIONS_RESOURCES = Object.keys(RESOURCES) as OperationsResource[];

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

@Injectable()
export class OperationsSettingsRepository {
  constructor(private db: DatabaseService) {}

  private config(resource: OperationsResource): ResourceConfig {
    const cfg = RESOURCES[resource];
    if (!cfg) throw new Error(`Unknown operations resource: ${resource}`);
    return cfg;
  }

  private mapRow(resource: OperationsResource, row: any) {
    if (!row) return null;
    const cfg = this.config(resource);
    const out: Record<string, any> = {};
    for (const [col, value] of Object.entries(row)) {
      out[toCamel(col)] =
        cfg.numeric.includes(col) && value !== null && value !== undefined
          ? Number(value)
          : value;
    }
    out.isActive = row.status === 'active';
    return out;
  }

  async findAll(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    query: { search?: string; status?: string } = {},
  ): Promise<any[]> {
    const cfg = this.config(resource);
    const conditions = ['tenant_id = $1', 'warehouse_id = $2'];
    const params: any[] = [tenantId, warehouseId];
    let idx = 3;

    if (query.search) {
      const ors = cfg.searchColumns.map((c) => `${c} ILIKE $${idx}`);
      conditions.push(`(${ors.join(' OR ')})`);
      params.push(`%${query.search}%`);
      idx++;
    }
    if (query.status) {
      conditions.push(`status = $${idx}`);
      params.push(query.status);
      idx++;
    }

    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE ${conditions.join(' AND ')} ORDER BY ${cfg.orderBy}`,
      params,
    );
    return res.rows.map((r) => this.mapRow(resource, r));
  }

  async findById(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    id: string,
  ): Promise<any> {
    const cfg = this.config(resource);
    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE id = $1 AND tenant_id = $2 AND warehouse_id = $3`,
      [id, tenantId, warehouseId],
    );
    return this.mapRow(resource, res.rows[0]);
  }

  async findByCode(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    code: string,
  ): Promise<any> {
    const cfg = this.config(resource);
    const res = await this.db.query(
      `SELECT * FROM ${cfg.table} WHERE tenant_id = $1 AND warehouse_id = $2 AND code = $3`,
      [tenantId, warehouseId, code],
    );
    return this.mapRow(resource, res.rows[0]);
  }

  async create(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    dto: Record<string, any>,
  ): Promise<any> {
    const cfg = this.config(resource);
    const cols = ['tenant_id', 'warehouse_id'];
    const params: any[] = [tenantId, warehouseId];

    for (const [key, col] of Object.entries(cfg.columns)) {
      if (dto[key] === undefined) continue;
      cols.push(col);
      params.push(dto[key]);
    }

    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    const res = await this.db.query(
      `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      params,
    );
    return this.mapRow(resource, res.rows[0]);
  }

  async update(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    id: string,
    dto: Record<string, any>,
  ): Promise<any> {
    const cfg = this.config(resource);
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(cfg.columns)) {
      if (dto[key] === undefined) continue;
      sets.push(`${col} = $${idx}`);
      params.push(dto[key]);
      idx++;
    }
    if (sets.length === 0) return this.findById(tenantId, warehouseId, resource, id);

    sets.push('updated_at = NOW()');
    params.push(id, tenantId, warehouseId);
    const res = await this.db.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')}
        WHERE id = $${idx} AND tenant_id = $${idx + 1} AND warehouse_id = $${idx + 2}
        RETURNING *`,
      params,
    );
    return this.mapRow(resource, res.rows[0]);
  }

  /** Soft delete — Operations records are referenced by tasks/shipments, never hard-deleted. */
  async deactivate(
    tenantId: string,
    warehouseId: string,
    resource: OperationsResource,
    id: string,
  ): Promise<any> {
    const cfg = this.config(resource);
    const res = await this.db.query(
      `UPDATE ${cfg.table} SET status = 'inactive', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND warehouse_id = $3 RETURNING *`,
      [id, tenantId, warehouseId],
    );
    return this.mapRow(resource, res.rows[0]);
  }

  async warehouseExists(tenantId: string, warehouseId: string): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM warehouses WHERE id = $1 AND tenant_id = $2`,
      [warehouseId, tenantId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
