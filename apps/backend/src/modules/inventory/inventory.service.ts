import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { InventoryRepository } from './inventory.repository';
import {
  CreateStockLevelDto, UpdateStockLevelDto, TransferStockDto,
  AdjustStockDto, CreateMovementDto, QueryInventoryDto, QueryMovementsDto,
} from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { StockAlertsService } from './stock-alerts.service';




@Injectable()
export class InventoryService {
  constructor(

    private repository: InventoryRepository,
    private db: DatabaseService,
    private readonly stockAlerts: StockAlertsService,
  ) {}

  // ─── Stock Levels CRUD ─────────────────────────────────────

  async findAllStockLevels(query: QueryInventoryDto) {
    const { page = 1, limit = 5000 } = query;
    const { data, total } = await this.repository.findAllStockLevels(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findStockLevelById(id: string) {
    const sl = await this.repository.findStockLevelById(getCurrentTenantId(), id);
    if (!sl) throw new NotFoundException('Stock level not found');
    return sl;
  }

  async createStockLevel(dto: CreateStockLevelDto, actorUserId?: string | null) {
    const tenantId = getCurrentTenantId();
    const created = await this.repository.createStockLevel(tenantId, dto);

    // A brand-new row starts from nothing, so `before` is 0 and the delta is
    // whatever was seeded. Fire-and-forget — never awaited, never throws.
    this.stockAlerts.evaluate({
      tenantId,
      actorUserId,
      changes: [
        {
          skuId: created?.skuId ?? dto.skuId,
          warehouseId: created?.warehouseId ?? dto.warehouseId,
          delta: Number(dto.quantityAvailable ?? 0),
        },
      ],
    });

    return created;
  }

  async updateStockLevel(id: string, dto: UpdateStockLevelDto, actorUserId?: string | null) {
    const tenantId = getCurrentTenantId();
    // The row as it stands BEFORE the write — the exact previous available qty.
    const before = await this.findStockLevelById(id);
    const updated = await this.repository.updateStockLevel(tenantId, id, dto);

    if (dto.quantityAvailable !== undefined) {
      this.stockAlerts.evaluate({
        tenantId,
        actorUserId,
        changes: [
          {
            skuId: before.skuId,
            warehouseId: before.warehouseId,
            delta: Number(dto.quantityAvailable) - Number(before.quantityAvailable ?? 0),
          },
        ],
      });
    }

    return updated;
  }

  async deleteStockLevel(id: string, actorUserId?: string | null) {
    const tenantId = getCurrentTenantId();
    const before = await this.findStockLevelById(id);
    const deleted = await this.repository.deleteStockLevel(tenantId, id);

    if (deleted) {
      this.stockAlerts.evaluate({
        tenantId,
        actorUserId,
        changes: [
          {
            skuId: before.skuId,
            warehouseId: before.warehouseId,
            delta: -Number(before.quantityAvailable ?? 0),
          },
        ],
      });
    }

    return deleted;
  }

  // ─── Low Stock & Expiring ─────────────────────────────────

  async findLowStock() {
    return this.repository.findLowStock(getCurrentTenantId());
  }

  async findExpiring() {
    return this.repository.findExpiring(getCurrentTenantId());
  }

  // ─── Movements ─────────────────────────────────────────────

  async findAllMovements(query: QueryMovementsDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAllMovements(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createMovement(dto: CreateMovementDto) {
    return this.repository.createMovement(getCurrentTenantId(), dto);
  }

  // ─── Transfer (Transactional) ──────────────────────────────

  async transferStock(dto: TransferStockDto, actorUserId?: string | null) {
    const { skuId, fromBinId, toBinId, quantity, batchId } = dto;

    if (fromBinId === toBinId) {
      throw new BadRequestException('Source and destination bins must be different');
    }

    const tenantId = getCurrentTenantId();
    // Captured inside the transaction, consumed only after it has committed.
    let sourceWarehouseId: string | null = null;
    let destWarehouseId: string | null = null;

    const result = await this.db.transaction(async (client) => {
      // 1. Check destination bin is not locked
      const destBin = await client.query('SELECT id, is_locked FROM bins WHERE id = $1', [toBinId]);
      if (destBin.rows.length === 0) throw new NotFoundException('Destination bin not found');
      if (destBin.rows[0].is_locked) throw new BadRequestException('Destination bin is locked');

      // 2. Check source has enough stock
      let sourceQuery = 'SELECT * FROM stock_levels WHERE tenant_id = $1 AND sku_id = $2 AND bin_id = $3';
      const sourceParams: any[] = [getCurrentTenantId(), skuId, fromBinId];
      if (batchId) {
        sourceQuery += ' AND batch_id = $4';
        sourceParams.push(batchId);
      } else {
        sourceQuery += ' AND batch_id IS NULL';
      }
      sourceQuery += ' FOR UPDATE';

      const sourceStock = await client.query(sourceQuery, sourceParams);
      if (sourceStock.rows.length === 0) throw new BadRequestException('No stock found at source bin');
      if (sourceStock.rows[0].quantity_available < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${sourceStock.rows[0].quantity_available}, Requested: ${quantity}`);
      }

      // 3. Decrement source
      await client.query(
        'UPDATE stock_levels SET quantity_available = quantity_available - $1, last_updated = NOW() WHERE id = $2',
        [quantity, sourceStock.rows[0].id],
      );

      // 4. Increment destination (upsert)
      const warehouseId = dto.warehouseId || sourceStock.rows[0].warehouse_id;
      sourceWarehouseId = sourceStock.rows[0].warehouse_id ?? null;
      destWarehouseId = warehouseId ?? null;
      let destQuery = 'SELECT id FROM stock_levels WHERE tenant_id = $1 AND sku_id = $2 AND bin_id = $3';
      const destParams: any[] = [getCurrentTenantId(), skuId, toBinId];
      if (batchId) {
        destQuery += ' AND batch_id = $4';
        destParams.push(batchId);
      } else {
        destQuery += ' AND batch_id IS NULL';
      }

      const destStock = await client.query(destQuery, destParams);
      if (destStock.rows.length > 0) {
        await client.query(
          'UPDATE stock_levels SET quantity_available = quantity_available + $1, last_updated = NOW() WHERE id = $2',
          [quantity, destStock.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO stock_levels (tenant_id, sku_id, warehouse_id, bin_id, batch_id, quantity_available)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [getCurrentTenantId(), skuId, warehouseId, toBinId, batchId || null, quantity],
        );
      }

      // 5. Record movement
      const movNum = await this.repository.getNextMovementNumber(getCurrentTenantId());
      await client.query(
        `INSERT INTO stock_movements (tenant_id, movement_number, movement_type, sku_id, batch_id, warehouse_id, from_bin_id, to_bin_id, quantity, reference_type, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [getCurrentTenantId(), movNum, 'transfer', skuId, batchId || null, warehouseId, fromBinId, toBinId, quantity, 'manual', `Transfer of ${quantity} units`],
      );

      return { success: true, movementNumber: movNum, quantity, fromBinId, toBinId };
    });

    // AFTER COMMIT. A bin-to-bin move inside one warehouse nets to zero and
    // therefore raises nothing; only a cross-warehouse move can cross a
    // threshold.
    this.stockAlerts.evaluate({
      tenantId,
      actorUserId,
      changes: [
        { skuId, warehouseId: sourceWarehouseId, delta: -Number(quantity) },
        { skuId, warehouseId: destWarehouseId, delta: Number(quantity) },
      ],
    });

    return result;
  }

  // ─── Adjustment (Transactional) ────────────────────────────

  async adjustStock(dto: AdjustStockDto, actorUserId?: string | null) {
    const { skuId, binId, quantity, reason, batchId, notes } = dto;

    const tenantId = getCurrentTenantId();
    // Captured inside the transaction, consumed only after it has committed.
    let affectedWarehouseId: string | null = dto.warehouseId ?? null;
    let availableDelta = 0;

    const result = await this.db.transaction(async (client) => {
      // 1. Find existing stock at this bin
      let stockQuery = 'SELECT * FROM stock_levels WHERE tenant_id = $1 AND sku_id = $2 AND bin_id = $3';
      const stockParams: any[] = [getCurrentTenantId(), skuId, binId];
      if (batchId) {
        stockQuery += ' AND batch_id = $4';
        stockParams.push(batchId);
      } else {
        stockQuery += ' AND batch_id IS NULL';
      }
      stockQuery += ' FOR UPDATE';

      const existing = await client.query(stockQuery, stockParams);

      if (quantity < 0) {
        // Negative adjustment — must have stock
        if (existing.rows.length === 0) throw new BadRequestException('No stock found at this bin to adjust');
        if (existing.rows[0].quantity_available < Math.abs(quantity)) {
          throw new BadRequestException(`Cannot adjust. Available: ${existing.rows[0].quantity_available}`);
        }
      }

      // 2. Determine movement type from reason
      let movementType = 'adjustment';
      if (reason === 'damage') movementType = 'damage';
      else if (reason === 'scrap') movementType = 'scrap';
      else if (reason === 'return') movementType = 'return';
      else if (reason === 'correction') movementType = 'adjustment';

      // 3. Update or create stock level
      if (existing.rows.length > 0) {
        affectedWarehouseId = existing.rows[0].warehouse_id ?? affectedWarehouseId;
        if (reason === 'damage') {
          // Move to damaged
          await client.query(
            'UPDATE stock_levels SET quantity_available = quantity_available - $1, quantity_damaged = quantity_damaged + $1, last_updated = NOW() WHERE id = $2',
            [Math.abs(quantity), existing.rows[0].id],
          );
          availableDelta = -Math.abs(quantity);
        } else {
          await client.query(
            'UPDATE stock_levels SET quantity_available = quantity_available + $1, last_updated = NOW() WHERE id = $2',
            [quantity, existing.rows[0].id],
          );
          availableDelta = Number(quantity);
        }
      } else if (quantity > 0) {
        // Create new stock entry
        const warehouseResult = await client.query('SELECT warehouse_id FROM bins WHERE id = $1', [binId]);
        const warehouseId = dto.warehouseId || warehouseResult.rows[0]?.warehouse_id;
        affectedWarehouseId = warehouseId ?? affectedWarehouseId;
        availableDelta = Number(quantity);
        await client.query(
          `INSERT INTO stock_levels (tenant_id, sku_id, warehouse_id, bin_id, batch_id, quantity_available)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [getCurrentTenantId(), skuId, warehouseId, binId, batchId || null, quantity],
        );
      }

      // 4. Record movement
      const movNum = await this.repository.getNextMovementNumber(getCurrentTenantId());
      const fromBin = quantity < 0 ? binId : null;
      const toBin = quantity > 0 ? binId : null;
      await client.query(
        `INSERT INTO stock_movements (tenant_id, movement_number, movement_type, sku_id, batch_id, warehouse_id, from_bin_id, to_bin_id, quantity, reference_type, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [getCurrentTenantId(), movNum, movementType, skuId, batchId || null, dto.warehouseId || null,
         fromBin, toBin, Math.abs(quantity), 'manual', notes || `${reason}: ${quantity} units`],
      );

      return { success: true, movementNumber: movNum, adjustment: quantity, reason };
    });

    // AFTER COMMIT — threshold crossings are derived from the signed delta this
    // adjustment applied to quantity_available.
    this.stockAlerts.evaluate({
      tenantId,
      actorUserId,
      changes: [{ skuId, warehouseId: affectedWarehouseId, delta: availableDelta }],
    });

    return result;
  }
}
