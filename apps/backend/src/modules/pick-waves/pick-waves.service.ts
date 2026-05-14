import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { getCurrentTenantId } from '../common/tenant.context';

interface AuthUser { id: string; role: string; warehouseId?: string | null }

export interface CreateWaveDto {
  name: string;
  type?: 'manual' | 'scheduled';
  warehouseId?: string;
  releaseTime?: string;
  cutoffTime?: string;
  shippingDeadline?: string;
  priorityFilter?: string;
  autoAssignWorkers?: boolean;
  notes?: string;
}

@Injectable()
export class PickWavesService {
  constructor(private db: DatabaseService) {}

  async findAll(query: { status?: string; warehouseId?: string }, user?: AuthUser) {
    const tid = getCurrentTenantId();
    const where: string[] = ['w.tenant_id = $1'];
    const params: any[] = [tid];
    let i = 2;
    if (query.status) { where.push(`w.status = $${i++}`); params.push(query.status); }
    const whFilter = user?.role === 'manager' && user.warehouseId ? user.warehouseId : query.warehouseId;
    if (whFilter) { where.push(`w.warehouse_id = $${i++}`); params.push(whFilter); }

    const res = await this.db.query(
      `SELECT w.*, wh.name AS warehouse_name,
              (SELECT COUNT(*) FROM pick_lists pl WHERE pl.wave_id = w.id)::int AS pick_list_count,
              (SELECT COUNT(*) FROM pick_lists pl
                 JOIN pick_list_items pli ON pli.pick_list_id = pl.id
                WHERE pl.wave_id = w.id)::int AS total_items
         FROM pick_waves w
         LEFT JOIN warehouses wh ON w.warehouse_id = wh.id
        WHERE ${where.join(' AND ')}
        ORDER BY w.created_at DESC
        LIMIT 200`,
      params,
    );
    return res.rows.map(mapRow);
  }

  async findOne(id: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `SELECT w.*, wh.name AS warehouse_name
         FROM pick_waves w
         LEFT JOIN warehouses wh ON w.warehouse_id = wh.id
        WHERE w.id = $1 AND w.tenant_id = $2`,
      [id, tid],
    );
    if (!res.rows[0]) throw new NotFoundException('Wave not found');
    return mapRow(res.rows[0]);
  }

  async create(dto: CreateWaveDto, user?: AuthUser) {
    const tid = getCurrentTenantId();
    const countRes = await this.db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM pick_waves WHERE tenant_id = $1`,
      [tid],
    );
    const waveNumber = `WAVE-${String(parseInt(countRes.rows[0].c, 10) + 1).padStart(3, '0')}`;
    const warehouseId = user?.role === 'manager' && user.warehouseId ? user.warehouseId : dto.warehouseId;

    const res = await this.db.query(
      `INSERT INTO pick_waves
         (tenant_id, wave_number, name, type, warehouse_id, release_time, cutoff_time,
          shipping_deadline, priority_filter, auto_assign_workers, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
       RETURNING *`,
      [
        tid, waveNumber, dto.name, dto.type || 'manual', warehouseId || null,
        dto.releaseTime || null, dto.cutoffTime || null, dto.shippingDeadline || null,
        dto.priorityFilter || null, dto.autoAssignWorkers ?? false, user?.id || null,
      ],
    );
    return mapRow(res.rows[0]);
  }

  /** Add pick lists to a wave (draft waves only). */
  async attachPickLists(waveId: string, pickListIds: string[]) {
    const tid = getCurrentTenantId();
    const wave = await this.findOne(waveId);
    if (wave.status !== 'draft' && wave.status !== 'scheduled') {
      throw new BadRequestException(`Cannot attach pick lists to wave in ${wave.status} status`);
    }
    if (pickListIds.length === 0) return wave;
    const placeholders = pickListIds.map((_, i) => `$${i + 3}`).join(',');
    await this.db.query(
      `UPDATE pick_lists SET wave_id = $1 WHERE tenant_id = $2 AND id IN (${placeholders})`,
      [waveId, tid, ...pickListIds],
    );
    return this.findOne(waveId);
  }

  /** Release the wave — workers see their slices immediately, status board comes alive. */
  async release(id: string) {
    const wave = await this.findOne(id);
    if (wave.status !== 'draft' && wave.status !== 'scheduled') {
      throw new BadRequestException(`Cannot release wave in ${wave.status} status`);
    }
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pick_waves
          SET status = 'released', released_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tid],
    );
    // Optionally mark child pick lists as in_progress
    await this.db.query(
      `UPDATE pick_lists SET status = 'assigned', updated_at = NOW()
        WHERE wave_id = $1 AND tenant_id = $2 AND status = 'pending'`,
      [id, tid],
    );
    return mapRow(res.rows[0]);
  }

  async complete(id: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pick_waves
          SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tid],
    );
    if (!res.rows[0]) throw new NotFoundException('Wave not found');
    return mapRow(res.rows[0]);
  }

  async cancel(id: string) {
    const tid = getCurrentTenantId();
    const res = await this.db.query(
      `UPDATE pick_waves
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tid],
    );
    if (!res.rows[0]) throw new NotFoundException('Wave not found');
    return mapRow(res.rows[0]);
  }

  /**
   * Status board: per-worker breakdown of items assigned/picked/remaining + overall progress.
   * Used by the WaveStatusBoard component.
   */
  async getStatus(id: string) {
    const wave = await this.findOne(id);
    const tid = getCurrentTenantId();

    const byWorker = await this.db.query(
      `SELECT u.id AS worker_id,
              COALESCE(u.full_name, u.email) AS worker_name,
              u.presence_status,
              COUNT(pli.id)::int AS items_assigned,
              COALESCE(SUM(pli.quantity_picked), 0)::int AS items_picked,
              COALESCE(SUM(pli.quantity_required), 0)::int AS items_required,
              COUNT(pli.id) FILTER (WHERE pli.status = 'completed' OR pli.quantity_picked >= pli.quantity_required)::int AS items_done
         FROM pick_lists pl
         LEFT JOIN pick_list_items pli ON pli.pick_list_id = pl.id
         LEFT JOIN users u ON pl.assigned_to = u.id
        WHERE pl.wave_id = $1 AND pl.tenant_id = $2
        GROUP BY u.id, u.full_name, u.email, u.presence_status
        ORDER BY worker_name`,
      [id, tid],
    );

    const overall = await this.db.query<{ done: string; required: string }>(
      `SELECT COALESCE(SUM(pli.quantity_picked), 0)::text AS done,
              COALESCE(SUM(pli.quantity_required), 0)::text AS required
         FROM pick_lists pl
         LEFT JOIN pick_list_items pli ON pli.pick_list_id = pl.id
        WHERE pl.wave_id = $1 AND pl.tenant_id = $2`,
      [id, tid],
    );

    const done = parseInt(overall.rows[0]?.done ?? '0', 10);
    const required = parseInt(overall.rows[0]?.required ?? '0', 10);
    const percent = required > 0 ? Math.round((done / required) * 100) : 0;

    return {
      wave,
      overall: { itemsPicked: done, itemsRequired: required, percentComplete: percent },
      workers: byWorker.rows.map((r: any) => ({
        workerId: r.worker_id,
        workerName: r.worker_name || 'Unassigned',
        presenceStatus: r.presence_status,
        itemsAssigned: r.items_assigned,
        itemsPicked: r.items_picked,
        itemsRequired: r.items_required,
        itemsDone: r.items_done,
        itemsRemaining: Math.max(0, r.items_required - r.items_picked),
      })),
    };
  }
}

function mapRow(r: any) {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    waveNumber: r.wave_number,
    name: r.name,
    type: r.type,
    status: r.status,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse_name,
    releaseTime: r.release_time,
    cutoffTime: r.cutoff_time,
    shippingDeadline: r.shipping_deadline,
    priorityFilter: r.priority_filter,
    autoAssignWorkers: r.auto_assign_workers,
    createdBy: r.created_by,
    releasedAt: r.released_at,
    completedAt: r.completed_at,
    pickListCount: r.pick_list_count,
    totalItems: r.total_items,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
