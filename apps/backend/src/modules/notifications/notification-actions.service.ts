import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { AdjustmentsService } from '../adjustments/adjustments.service';
import { StockTransfersService } from '../stock-transfers/stock-transfers.service';
import { CycleCountsService } from '../cycle-counts/cycle-counts.service';

export interface ActionUser {
  id: string;
  email?: string;
  role?: string;
  fullName?: string;
  warehouseId?: string | null;
}

type Handler = (
  moduleRef: ModuleRef,
  entityId: string,
  action: 'approve' | 'reject',
  reason: string | undefined,
  user: ActionUser,
) => Promise<any>;

/**
 * Turns the notification centre's Approvals tab into a real approval inbox
 * (spec Part 4) by delegating inline Approve/Reject straight to the module that
 * owns the record — the same service method the record's own screen calls, so
 * every permission check, status guard and side effect still applies.
 *
 * Services are pulled from the container lazily via ModuleRef (`strict: false`)
 * rather than imported as modules, so instrumenting those same modules with
 * NotificationsService later cannot create a circular module graph.
 */
@Injectable()
export class NotificationActionsService {
  private readonly logger = new Logger(NotificationActionsService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  /** entity_type (as stamped on the notification) → owning module's handler. */
  private readonly handlers: Record<string, Handler> = {
    purchase_order: async (ref, id, action, reason, user) => {
      const svc = ref.get(PurchaseOrdersService, { strict: false });
      return action === 'approve'
        ? svc.approve(id, user as any)
        : svc.reject(id, reason ?? '', user as any);
    },
    adjustment: async (ref, id, action, _reason, user) => {
      const svc = ref.get(AdjustmentsService, { strict: false });
      return action === 'approve' ? svc.approve(id, user as any) : svc.reject(id, user as any);
    },
    stock_transfer: async (ref, id, action, _reason, user) => {
      const svc = ref.get(StockTransfersService, { strict: false });
      // StockTransfersService has no reject(); cancelling a requested transfer
      // is its rejection path.
      return action === 'approve' ? svc.approve(id, user as any) : svc.cancel(id);
    },
    cycle_count: async (ref, id, action, _reason, user) => {
      const svc = ref.get(CycleCountsService, { strict: false });
      return action === 'approve' ? svc.approve(id, user as any) : svc.reject(id, user as any);
    },
  };

  /** Aliases so instrumenters can stamp whichever name reads naturally. */
  private readonly aliases: Record<string, string> = {
    po: 'purchase_order',
    purchaseorder: 'purchase_order',
    purchase_orders: 'purchase_order',
    stock_adjustment: 'adjustment',
    adjustments: 'adjustment',
    transfer: 'stock_transfer',
    stock_transfers: 'stock_transfer',
    cyclecount: 'cycle_count',
    cycle_counts: 'cycle_count',
  };

  supports(entityType: string | null | undefined): boolean {
    return !!this.normalise(entityType);
  }

  private normalise(entityType: string | null | undefined): string | null {
    if (!entityType) return null;
    const key = String(entityType).toLowerCase();
    const resolved = this.aliases[key] ?? key;
    return this.handlers[resolved] ? resolved : null;
  }

  /**
   * Executes the approve/reject. Throws BadRequestException when the entity
   * type has no handler — the caller must say so plainly rather than stamping
   * action_state and pretending something happened.
   */
  async execute(params: {
    entityType: string | null;
    entityId: string | null;
    action: 'approve' | 'reject';
    reason?: string;
    user: ActionUser;
  }): Promise<any> {
    const key = this.normalise(params.entityType);
    if (!key) {
      throw new BadRequestException(
        `This notification cannot be actioned here — no approval handler is registered for entity type "${params.entityType ?? 'none'}". Open the record and act on it there.`,
      );
    }
    if (!params.entityId) {
      throw new BadRequestException('This notification has no linked record to action.');
    }

    return this.handlers[key](this.moduleRef, params.entityId, params.action, params.reason, params.user);
  }
}
