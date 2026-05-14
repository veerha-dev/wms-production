import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { getCurrentTenantId } from '../common/tenant.context';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

@Injectable()
export class PackConsolidationService {
  constructor(private db: DatabaseService) {}

  async findAll(query: { status?: string; warehouseId?: string }, user?: AuthUser) {
    const tid = getCurrentTenantId();
    const where: string[] = ['c.tenant_id = $1'];
    const params: any[] = [tid];
    let i = 2;

    if (query.status) { where.push(`c.status = $${i++}`); params.push(query.status); }
    const warehouseFilter = user?.role === 'manager' && user.warehouseId ? user.warehouseId : query.warehouseId;
    if (warehouseFilter) { where.push(`c.warehouse_id = $${i++}`); params.push(warehouseFilter); }

    const res = await this.db.query(
      `SELECT c.*, pl.pick_list_number, so.so_number, w.name AS warehouse_name
         FROM pack_consolidation_tasks c
         LEFT JOIN pick_lists pl ON c.pick_list_id = pl.id
         LEFT JOIN sales_orders so ON c.so_id = so.id
         LEFT JOIN warehouses w ON c.warehouse_id = w.id
        WHERE ${where.join(' AND ')}
        ORDER BY c.created_at DESC
        LIMIT 200`,
      params,
    );
    return res.rows.map(mapRow);
  }

  async findOne(id: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `SELECT c.*, pl.pick_list_number, so.so_number, w.name AS warehouse_name
         FROM pack_consolidation_tasks c
         LEFT JOIN pick_lists pl ON c.pick_list_id = pl.id
         LEFT JOIN sales_orders so ON c.so_id = so.id
         LEFT JOIN warehouses w ON c.warehouse_id = w.id
        WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, tid],
    );
    if (!res.rows[0]) throw new NotFoundException('Consolidation task not found');
    return mapRow(res.rows[0]);
  }

  /**
   * Create a consolidation row for a zone-strategy pick list. `totalSubPicks` is the number of
   * zones the order was split across. As each sub-pick completes the count is incremented; once
   * all arrive the task auto-flips to `ready` and the packer can acknowledge.
   */
  async createForPickList(payload: {
    pickListId: string;
    soId?: string | null;
    warehouseId?: string | null;
    totalSubPicks: number;
  }) {
    const tid = getCurrentTenantId();
    const numRes = await this.db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM pack_consolidation_tasks WHERE tenant_id = $1`,
      [tid],
    );
    const consolidationNumber = `CONS-${String(parseInt(numRes.rows[0].c, 10) + 1).padStart(3, '0')}`;

    const res = await this.db.query(
      `INSERT INTO pack_consolidation_tasks
         (tenant_id, consolidation_number, pick_list_id, so_id, warehouse_id, total_sub_picks, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [tid, consolidationNumber, payload.pickListId, payload.soId || null, payload.warehouseId || null, payload.totalSubPicks],
    );
    return mapRow(res.rows[0]);
  }

  /** Mark one sub-pick complete. Auto-promotes to ready when all sub-picks arrive. */
  async recordSubPickComplete(consolidationId: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pack_consolidation_tasks
          SET completed_sub_picks = completed_sub_picks + 1,
              status = CASE
                         WHEN completed_sub_picks + 1 >= total_sub_picks THEN 'ready'
                         ELSE status
                       END,
              ready_at = CASE
                           WHEN completed_sub_picks + 1 >= total_sub_picks AND ready_at IS NULL THEN NOW()
                           ELSE ready_at
                         END,
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [consolidationId, tid],
    );
    if (!res.rows[0]) throw new NotFoundException('Consolidation task not found');
    return mapRow(res.rows[0]);
  }

  async acknowledge(id: string, user?: AuthUser) {
    const task = await this.findOne(id);
    if (task.status !== 'ready') {
      throw new BadRequestException(`Cannot acknowledge consolidation in ${task.status} status. All sub-picks must be complete first.`);
    }
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pack_consolidation_tasks
          SET status = 'acknowledged',
              acknowledged_at = NOW(),
              acknowledged_by = $3,
              updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [id, tid, user?.id || null],
    );
    return mapRow(res.rows[0]);
  }

  async markPacked(id: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pack_consolidation_tasks
          SET status = 'packed', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND status = 'acknowledged'
        RETURNING *`,
      [id, tid],
    );
    if (!res.rows[0]) throw new BadRequestException('Consolidation must be acknowledged before packing');
    return mapRow(res.rows[0]);
  }
}

function mapRow(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    consolidationNumber: r.consolidation_number,
    pickListId: r.pick_list_id,
    pickListNumber: r.pick_list_number,
    soId: r.so_id,
    soNumber: r.so_number,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse_name,
    totalSubPicks: r.total_sub_picks,
    completedSubPicks: r.completed_sub_picks,
    status: r.status,
    readyAt: r.ready_at,
    acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
