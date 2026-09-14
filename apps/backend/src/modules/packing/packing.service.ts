import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PackingRepository, ORDER_STATUS } from './packing.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { NotificationsService } from '../notifications/notifications.service';
import { scopeWarehouseForUser } from '../common/scope-warehouse';

interface AuthUser {
  id: string;
  role: string;
  warehouseId?: string | null;
  name?: string;
  fullName?: string;
}

/**
 * Volumetric divisor used by Indian couriers (Delhivery, Blue Dart, Shiprocket)
 * for surface freight: L×W×H in cm / 5000 = billable kg. The packer is told the
 * greater of actual and volumetric weight because that is what they are charged.
 */
const VOLUMETRIC_DIVISOR = 5000;

@Injectable()
export class PackingService {
  constructor(
    private readonly repository: PackingRepository,
    private readonly notifications: NotificationsService,
  ) {}

  /** Screen 1 — orders that have finished picking and are waiting to be packed. */
  async findPackableOrders(query: any, user?: AuthUser) {
    const warehouseId = scopeWarehouseForUser(user, query.warehouseId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Number(query.limit) || 50;
    const { data, total } = await this.repository.findPackableOrders(getCurrentTenantId(), {
      search: query.search,
      warehouseId,
      page,
      limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Screen 2 — open an order for packing.
   *
   * Opening is what creates the session, and the session is seeded from the
   * completed pick lists. An order with no completed pick is refused rather
   * than opened empty: an empty packing screen is exactly the bug this module
   * exists to fix, and a packer must never be left guessing what to put in the box.
   */
  async openOrder(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const order = await this.repository.findOrder(soId, tenantId);
    if (!order) throw new NotFoundException(`Sales order ${soId} not found`);
    this.assertWarehouseAccess(user, order.warehouseId);

    let session = await this.repository.findLiveSession(tenantId, soId);

    if (!session) {
      const picked = await this.repository.findPickedQuantities(tenantId, soId);
      if (picked.length === 0) {
        throw new BadRequestException(
          `Order ${order.soNumber} has no completed pick list yet. Finish picking before packing.`,
        );
      }
      session = await this.repository.createSession(tenantId, {
        soId,
        warehouseId: order.warehouseId,
        packedBy: user?.id ?? null,
        items: picked,
      });
    }

    return this.buildSessionView(tenantId, soId, session);
  }

  /** Read-only view of an in-progress packing session. */
  async getOrder(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const order = await this.repository.findOrder(soId, tenantId);
    if (!order) throw new NotFoundException(`Sales order ${soId} not found`);
    this.assertWarehouseAccess(user, order.warehouseId);

    const session = await this.repository.findLiveSession(tenantId, soId);
    if (!session) {
      // Not opened yet — show what packing *would* load, so the screen is never blank.
      const picked = await this.repository.findPickedQuantities(tenantId, soId);
      return {
        order,
        session: null,
        items: picked.map((p) => ({
          id: null,
          skuId: p.skuId,
          skuCode: p.skuCode,
          skuName: p.skuName,
          skuBarcode: p.skuBarcode,
          pickedQuantity: p.pickedQuantity,
          packedQuantity: 0,
          packageId: null,
          packageNumber: null,
          status: 'pending',
        })),
        packages: [],
        boxes: await this.repository.findActiveBoxes(tenantId),
        summary: this.summarise(picked.map((p) => ({ ...p, packedQuantity: 0 })), []),
      };
    }

    return this.buildSessionView(tenantId, soId, session);
  }

  /**
   * Scan an item into the box. One scan = one unit by default.
   *
   * A barcode that is not on this order is rejected loudly — that rejection is
   * the entire point of scanning at the packing bench, because the alternative
   * is the wrong product reaching the customer.
   */
  async scanItem(soId: string, payload: { barcode: string; quantity?: number }, user?: AuthUser) {
    if (!payload?.barcode) throw new BadRequestException('barcode is required');
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);

    const qty = Math.max(1, Number(payload.quantity) || 1);
    const candidates = await this.repository.findScanCandidates(session.id);
    const scanned = payload.barcode.trim().toUpperCase();

    // Barcode before code: barcode is unique per tenant (migration 090), so it
    // can never resolve to the wrong SKU. Code is the fallback for labels
    // printed before a barcode was assigned. Same contract as picking/putaway.
    const match =
      candidates.find((r: any) => r.sku_barcode && String(r.sku_barcode).toUpperCase() === scanned) ??
      candidates.find((r: any) => String(r.sku_code || '').toUpperCase() === scanned);

    if (!match) {
      throw new BadRequestException(
        `"${payload.barcode}" is not on this order. Do not put it in the box — set it aside and rescan.`,
      );
    }

    const picked = parseInt(match.picked_quantity ?? '0', 10);
    const already = parseInt(match.packed_quantity ?? '0', 10);
    if (already >= picked) {
      throw new BadRequestException(
        `${match.sku_code} is already fully packed (${already}/${picked}). Nothing more was picked for this order.`,
      );
    }

    const newPacked = Math.min(already + qty, picked);
    const newStatus = newPacked >= picked ? 'packed' : 'pending';
    await this.repository.setPackedQuantity(match.id, newPacked, newStatus);
    await this.refreshSessionPackedState(tenantId, session.id, soId);

    return {
      ok: true,
      itemId: match.id,
      skuId: match.sku_id,
      skuCode: match.sku_code,
      skuName: match.sku_name,
      packedQuantity: newPacked,
      pickedQuantity: picked,
      status: newStatus,
    };
  }

  /**
   * Manual quantity entry — the fallback for a damaged or unreadable barcode.
   * Capped at the picked quantity: packing more than was picked is not a thing
   * that can physically have happened.
   */
  async setItemQuantity(soId: string, itemId: string, quantity: number, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);

    const item = await this.repository.findItemById(itemId, session.id);
    if (!item) throw new NotFoundException(`Packing item ${itemId} not found on this order`);

    const requested = Number(quantity);
    if (!Number.isFinite(requested) || requested < 0) {
      throw new BadRequestException('quantity must be zero or more');
    }
    if (requested > item.pickedQuantity) {
      throw new BadRequestException(
        `Cannot pack ${requested} of ${item.skuCode} — only ${item.pickedQuantity} were picked.`,
      );
    }

    const status = requested >= item.pickedQuantity && item.pickedQuantity > 0 ? 'packed' : 'pending';
    await this.repository.setPackedQuantity(itemId, requested, status);
    await this.refreshSessionPackedState(tenantId, session.id, soId);

    return { ...item, packedQuantity: requested, status };
  }

  async assignItemToPackage(soId: string, itemId: string, packageId: string | null, user?: AuthUser) {
    const { session } = await this.requireLiveSession(soId, user);

    const item = await this.repository.findItemById(itemId, session.id);
    if (!item) throw new NotFoundException(`Packing item ${itemId} not found on this order`);

    if (packageId) {
      const pkg = await this.repository.findPackageById(packageId, session.id);
      if (!pkg) throw new NotFoundException(`Package ${packageId} not found on this order`);
    }

    await this.repository.assignItemToPackage(itemId, packageId);
    return this.repository.findItemById(itemId, session.id);
  }

  /**
   * Add a box. The suggested box is the smallest one in the master that can
   * hold what is still unassigned — courier pricing takes the greater of actual
   * and volumetric weight, so an oversized box costs real money on every parcel.
   */
  async addPackage(soId: string, dto: any, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);

    const packageNumber = await this.repository.nextPackageNumber(session.id);
    const boxes = await this.repository.findActiveBoxes(tenantId);

    let box: any = null;
    if (dto?.boxId) {
      box = boxes.find((b) => b.id === dto.boxId) ?? null;
      if (!box) throw new BadRequestException('Selected box is not in the box master');
    } else {
      const items = await this.repository.findSessionItems(session.id);
      const unassigned = items.filter((i) => !i.packageId);
      box = this.suggestBox(boxes, unassigned.length > 0 ? unassigned : items);
    }

    return this.repository.createPackage(session.id, {
      packageNumber,
      boxId: box?.id ?? null,
      boxName: box?.name ?? null,
      lengthCm: dto?.lengthCm ?? box?.lengthCm ?? null,
      widthCm: dto?.widthCm ?? box?.widthCm ?? null,
      heightCm: dto?.heightCm ?? box?.heightCm ?? null,
      weightKg: dto?.weightKg ?? null,
    });
  }

  /**
   * Update a package. Choosing a box re-fills the dimensions from the master
   * unless the packer typed their own — a box that has been cut down or
   * reinforced is still a real box, and the courier prices what is actually shipped.
   */
  async updatePackage(soId: string, packageId: string, dto: any, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);

    const pkg = await this.repository.findPackageById(packageId, session.id);
    if (!pkg) throw new NotFoundException(`Package ${packageId} not found on this order`);

    const fields: Record<string, any> = {};

    if (dto.boxId !== undefined) {
      if (dto.boxId === null) {
        fields.boxId = null;
        fields.boxName = null;
      } else {
        const boxes = await this.repository.findActiveBoxes(tenantId);
        const box = boxes.find((b) => b.id === dto.boxId);
        if (!box) throw new BadRequestException('Selected box is not in the box master');
        fields.boxId = box.id;
        fields.boxName = box.name;
        fields.lengthCm = dto.lengthCm ?? box.lengthCm;
        fields.widthCm = dto.widthCm ?? box.widthCm;
        fields.heightCm = dto.heightCm ?? box.heightCm;
      }
    }

    for (const key of ['lengthCm', 'widthCm', 'heightCm', 'weightKg'] as const) {
      if (dto[key] !== undefined) {
        const value = dto[key] === null ? null : Number(dto[key]);
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
          throw new BadRequestException(`${key} must be a positive number`);
        }
        fields[key] = value;
      }
    }

    return this.repository.updatePackage(packageId, fields);
  }

  async removePackage(soId: string, packageId: string, user?: AuthUser) {
    const { session } = await this.requireLiveSession(soId, user);
    const pkg = await this.repository.findPackageById(packageId, session.id);
    if (!pkg) throw new NotFoundException(`Package ${packageId} not found on this order`);
    await this.repository.deletePackage(packageId);
    return { id: packageId };
  }

  /**
   * Screen 3 — record the shipping label.
   *
   * For launch the packer types the tracking number the courier gave them and
   * prints a basic label. When a courier API is wired in it will call this same
   * method with `labelSource: 'courier'` and the courier's own PDF URL, so the
   * packing screen does not change at all.
   */
  async setLabel(
    soId: string,
    dto: { carrier?: string; trackingNumber?: string; labelUrl?: string; labelSource?: string },
    user?: AuthUser,
  ) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);

    if (!dto.trackingNumber && !dto.labelUrl) {
      throw new BadRequestException('A tracking number (or a courier label) is required');
    }

    return this.repository.updateSession(session.id, tenantId, {
      carrier: dto.carrier ?? session.carrier ?? null,
      trackingNumber: dto.trackingNumber ?? session.trackingNumber ?? null,
      labelUrl: dto.labelUrl ?? session.labelUrl ?? null,
      labelSource: dto.labelSource ?? (dto.labelUrl ? 'courier' : 'manual'),
    });
  }

  async markLabelPrinted(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);
    return this.repository.updateSession(session.id, tenantId, { labelPrintedAt: new Date() });
  }

  /**
   * Screen 4 — Complete Packing.
   *
   * Refuses on anything that would strand the parcel downstream: an unpacked
   * line, a box with no weight, or an item that belongs to no box. Every one of
   * those is cheap to fix at the bench and expensive to fix after dispatch.
   */
  async complete(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { order, session } = await this.requireLiveSession(soId, user);

    const items = await this.repository.findSessionItems(session.id);
    const packages = await this.repository.findPackages(session.id);

    const unpacked = items.filter((i) => i.packedQuantity < i.pickedQuantity);
    if (unpacked.length > 0) {
      throw new BadRequestException(
        `${unpacked.length} item(s) are not fully packed: ${unpacked
          .map((i) => `${i.skuCode} (${i.packedQuantity}/${i.pickedQuantity})`)
          .join(', ')}`,
      );
    }

    if (packages.length === 0) {
      throw new BadRequestException('Add at least one package before completing packing');
    }

    const unweighed = packages.filter((p) => p.weightKg === null || Number(p.weightKg) <= 0);
    if (unweighed.length > 0) {
      throw new BadRequestException(
        `Weigh every package first — package ${unweighed.map((p) => p.packageNumber).join(', ')} has no weight.`,
      );
    }

    const unboxed = packages.filter((p) => !p.boxId && (!p.lengthCm || !p.widthCm || !p.heightCm));
    if (unboxed.length > 0) {
      throw new BadRequestException(
        `Select a box size for package ${unboxed.map((p) => p.packageNumber).join(', ')} — the courier prices on its dimensions.`,
      );
    }

    const unassigned = items.filter((i) => !i.packageId);
    if (unassigned.length > 0) {
      throw new BadRequestException(
        `Assign every item to a package: ${unassigned.map((i) => i.skuCode).join(', ')}`,
      );
    }

    const totalWeight = packages.reduce((sum, p) => sum + Number(p.weightKg || 0), 0);
    const completed = await this.repository.completeSession(tenantId, session.id, soId, {
      weightKg: Number(totalWeight.toFixed(3)),
      packageCount: packages.length,
    });

    void this.notifications
      .emit('packing.completed', {
        tenantId,
        warehouseId: order.warehouseId ?? null,
        entityType: 'sales_order',
        entityId: soId,
        data: {
          actorUserId: user?.id,
          orderId: soId,
          orderNumber: order.soNumber,
          code: order.soNumber,
          customerName: order.customerName,
          warehouseName: order.warehouseName,
          packerName: user?.fullName ?? user?.name ?? null,
          packageCount: packages.length,
          totalWeightKg: Number(totalWeight.toFixed(3)),
        },
      })
      .catch(() => undefined);

    return {
      session: completed,
      orderStatus: ORDER_STATUS.readyForDispatch,
      packageCount: packages.length,
      totalWeightKg: Number(totalWeight.toFixed(3)),
    };
  }

  async cancel(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const { session } = await this.requireLiveSession(soId, user);
    if (user?.role === 'worker') {
      throw new ForbiddenException('Only a manager or admin can cancel a packing session');
    }
    const cancelled = await this.repository.updateSession(session.id, tenantId, { status: 'cancelled' });
    await this.repository.updateOrderStatus(tenantId, soId, ORDER_STATUS.picked);
    return cancelled;
  }

  async getBoxes() {
    return this.repository.findActiveBoxes(getCurrentTenantId());
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * A manager may only pack for their own warehouse.
   *
   * Deliberately not the shared `assertManagerWarehouseAccess` helper: that one
   * throws a bare Error carrying a `status` property, which Nest does not
   * recognise, so the caller gets a 500 instead of a 403.
   */
  private assertWarehouseAccess(user: AuthUser | undefined, warehouseId: string | null | undefined) {
    if (user?.role !== 'manager') return;
    if (!user.warehouseId || !warehouseId) return;
    if (user.warehouseId !== warehouseId) {
      throw new ForbiddenException('You can only pack orders for your assigned warehouse');
    }
  }

  private async requireLiveSession(soId: string, user?: AuthUser) {
    const tenantId = getCurrentTenantId();
    const order = await this.repository.findOrder(soId, tenantId);
    if (!order) throw new NotFoundException(`Sales order ${soId} not found`);
    this.assertWarehouseAccess(user, order.warehouseId);

    const session = await this.repository.findLiveSession(tenantId, soId);
    if (!session) {
      throw new BadRequestException(`Packing has not been started for ${order.soNumber}`);
    }
    if (session.status === ORDER_STATUS.readyForDispatch) {
      throw new BadRequestException(`${order.soNumber} is already packed and ready for dispatch`);
    }
    return { order, session };
  }

  private async buildSessionView(tenantId: string, soId: string, session: any) {
    const [order, items, packages, boxes] = await Promise.all([
      this.repository.findOrder(soId, tenantId),
      this.repository.findSessionItems(session.id),
      this.repository.findPackages(session.id),
      this.repository.findActiveBoxes(tenantId),
    ]);

    return {
      order,
      session,
      items,
      packages: packages.map((p) => ({
        ...p,
        volumetricWeightKg: this.volumetricWeight(p),
        itemCount: items.filter((i) => i.packageId === p.id).length,
      })),
      boxes,
      summary: this.summarise(items, packages),
    };
  }

  /**
   * Keeps the session's own status in step with its lines so the order list can
   * show "Packed" without re-reading every item.
   */
  private async refreshSessionPackedState(tenantId: string, sessionId: string, soId: string) {
    const items = await this.repository.findSessionItems(sessionId);
    const allPacked = items.length > 0 && items.every((i) => i.packedQuantity >= i.pickedQuantity);
    const session = await this.repository.findSessionById(tenantId, sessionId);
    if (!session || session.status === ORDER_STATUS.readyForDispatch) return;

    const nextStatus = allPacked ? ORDER_STATUS.packed : ORDER_STATUS.packing;
    if (session.status !== nextStatus) {
      await this.repository.updateSession(sessionId, tenantId, {
        status: nextStatus,
        packedAt: allPacked ? new Date() : null,
      });
      await this.repository.updateOrderStatus(tenantId, soId, nextStatus);
    }
  }

  private summarise(items: any[], packages: any[]) {
    const totalPicked = items.reduce((s, i) => s + (i.pickedQuantity ?? 0), 0);
    const totalPacked = items.reduce((s, i) => s + (i.packedQuantity ?? 0), 0);
    return {
      totalItems: items.length,
      itemsPacked: items.filter((i) => (i.packedQuantity ?? 0) >= (i.pickedQuantity ?? 0)).length,
      totalPickedUnits: totalPicked,
      totalPackedUnits: totalPacked,
      packageCount: packages.length,
      totalWeightKg: Number(packages.reduce((s, p) => s + Number(p.weightKg || 0), 0).toFixed(3)),
      allItemsPacked: items.length > 0 && totalPacked >= totalPicked,
    };
  }

  private volumetricWeight(pkg: any): number | null {
    if (!pkg.lengthCm || !pkg.widthCm || !pkg.heightCm) return null;
    return Number(((pkg.lengthCm * pkg.widthCm * pkg.heightCm) / VOLUMETRIC_DIVISOR).toFixed(3));
  }

  /**
   * Smallest box that clears both the contents' volume and their weight.
   * Falls back to the largest box when nothing fits, so the packer always gets
   * a starting point rather than an empty dropdown.
   */
  private suggestBox(boxes: any[], items: any[]): any | null {
    if (boxes.length === 0) return null;

    const totalVolume = items.reduce((sum, i) => {
      const qty = Math.max(i.pickedQuantity ?? 0, 1);
      const unit = (i.lengthCm ?? 0) * (i.widthCm ?? 0) * (i.heightCm ?? 0);
      return sum + unit * qty;
    }, 0);
    const totalWeight = items.reduce(
      (sum, i) => sum + (i.weightKg ?? 0) * Math.max(i.pickedQuantity ?? 0, 1),
      0,
    );

    // No usable SKU dimensions — the smallest active box is still the cheapest
    // default, and the packer overrides it by eye.
    if (totalVolume <= 0 && totalWeight <= 0) return boxes[0];

    const fits = boxes.find((b) => {
      const capacity = (b.lengthCm ?? 0) * (b.widthCm ?? 0) * (b.heightCm ?? 0);
      const volumeOk = capacity > 0 ? capacity >= totalVolume : true;
      const weightOk = b.maxWeightKg ? b.maxWeightKg >= totalWeight : true;
      return volumeOk && weightOk;
    });

    return fits ?? boxes[boxes.length - 1];
  }
}
