/**
 * The notification event registry — the contract between business modules and
 * the delivery engine (spec Part 2).
 *
 * Every event a business flow can raise is declared here exactly once:
 * its category, severity, who receives it by default, whether it maps to a
 * tenant-configurable alert type, whether its email is immediate or batched,
 * and — the rule that matters most (spec Part 1) — the `linkPath` that opens
 * the exact page where the recipient can act:
 *
 *   > "A notification that says 'QC failed' without a link is useless.
 *   >  It must open that QC inspection directly."
 *
 * Every entry below therefore returns a real frontend route (see
 * apps/frontend/src/app/App.tsx) with the filter query params needed to land
 * on the right record. Tabbed pages use `?tab=<TabsTrigger value>`; the
 * notification-centre UI wave is responsible for honouring those params.
 *
 * All ~42 spec events are registered even though only a subset gets
 * instrumented in this phase — the registry is the contract, not the backlog.
 */

export type NotificationCategory = 'inbound' | 'inventory' | 'outbound' | 'worker' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
/** 'user' routes to exactly ctx.userId (worker/requester notifications). */
export type NotificationRecipients = 'admin' | 'manager' | 'both' | 'user';
export type NotificationPriority = 'immediate' | 'batched';

/** Everything a business module passes to `NotificationsService.emit()`. */
export interface NotificationContext {
  tenantId: string;
  /** Scopes manager recipients. Omitting it on a warehouse event means NO manager gets it. */
  warehouseId?: string | null;
  /** Target for `recipients: 'user'` events (worker tasks, approval outcomes). */
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Free-form payload used by title/body/linkPath. `actorUserId` is always excluded from recipients. */
  data?: Record<string, any>;
}

export interface NotificationEventDef {
  eventType: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  defaultRecipients: NotificationRecipients;
  /** Key in tenant_notification_settings. No key => always enabled, email off unless forced. */
  settingsKey?: string;
  priority: NotificationPriority;
  /** Shows in the Approvals tab with inline Approve/Reject (spec Part 4). */
  requiresAction?: boolean;
  /** Repeat fires collapse into one row instead of flooding the bell (spec Part 3). */
  groupable?: boolean;
  /**
   * True only for events that genuinely concern the whole company. Used as the
   * ONLY licence to fall back to "all managers" when no warehouse is supplied.
   */
  companyWide?: boolean;
  title: (ctx: NotificationContext) => string;
  body?: (ctx: NotificationContext) => string;
  linkPath: (ctx: NotificationContext) => string;
  /** Collapse key. Defaults to `${eventType}:${warehouseId ?? 'all'}` for groupable events. */
  groupKey?: (ctx: NotificationContext) => string;
  /** Title shown once collapsed, e.g. "8 SKUs are below reorder point". */
  groupTitle?: (count: number, ctx: NotificationContext) => string;
  /** Link used once collapsed — usually the list/report rather than one record. */
  groupLinkPath?: (ctx: NotificationContext) => string;
}

/** Reads a key from ctx.data without ever throwing on a missing payload. */
function d(ctx: NotificationContext, key: string, fallback = ''): string {
  const v = ctx.data?.[key];
  return v === undefined || v === null || v === '' ? fallback : String(v);
}

function n(ctx: NotificationContext, key: string, fallback = 0): number {
  const v = Number(ctx.data?.[key]);
  return Number.isFinite(v) ? v : fallback;
}

/** `?a=1&b=2` from defined values only — keeps link paths clean. */
function qs(params: Record<string, string | number | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Entity reference for a title, e.g. "PO-0012" falling back to the raw id. */
function ref(ctx: NotificationContext, key = 'code'): string {
  return d(ctx, key, ctx.entityId ? String(ctx.entityId).slice(0, 8) : '');
}

function at(ctx: NotificationContext): string {
  const wh = d(ctx, 'warehouseName');
  return wh ? ` at ${wh}` : '';
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // INBOUND (spec Part 2 — 7 events)
  // ══════════════════════════════════════════════════════════════════════════
  {
    eventType: 'po.submitted',
    category: 'inbound',
    severity: 'info',
    defaultRecipients: 'admin',
    priority: 'immediate', // approval request — never batched (spec Part 5)
    requiresAction: true,
    title: (c) => `PO ${ref(c, 'poNumber')} awaits your approval`,
    body: (c) =>
      `${d(c, 'submittedBy', 'A user')} submitted purchase order ${ref(c, 'poNumber')}` +
      `${d(c, 'supplierName') ? ` to ${d(c, 'supplierName')}` : ''}` +
      `${d(c, 'totalAmount') ? ` for ${d(c, 'totalAmount')}` : ''}.`,
    linkPath: (c) => `/inbound${qs({ po: c.entityId, status: 'pending_approval' })}`,
  },
  {
    eventType: 'po.approved',
    category: 'inbound',
    severity: 'info',
    defaultRecipients: 'user', // the creator
    priority: 'immediate',
    title: (c) => `PO ${ref(c, 'poNumber')} approved`,
    body: (c) => `${d(c, 'approvedBy', 'An admin')} approved purchase order ${ref(c, 'poNumber')}.`,
    linkPath: (c) => `/inbound${qs({ po: c.entityId })}`,
  },
  {
    eventType: 'po.rejected',
    category: 'inbound',
    severity: 'warning',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `PO ${ref(c, 'poNumber')} rejected`,
    body: (c) =>
      `${d(c, 'rejectedBy', 'An admin')} rejected purchase order ${ref(c, 'poNumber')}.` +
      `${d(c, 'reason') ? ` Reason: ${d(c, 'reason')}` : ''}`,
    linkPath: (c) => `/inbound${qs({ po: c.entityId })}`,
  },
  {
    eventType: 'grn.created',
    category: 'inbound',
    severity: 'info',
    defaultRecipients: 'manager',
    priority: 'batched',
    title: (c) => `GRN ${ref(c, 'grnNumber')} created${at(c)}`,
    body: (c) =>
      `Goods receipt ${ref(c, 'grnNumber')}${d(c, 'supplierName') ? ` from ${d(c, 'supplierName')}` : ''} was created` +
      `${d(c, 'totalItems') ? ` with ${d(c, 'totalItems')} line(s)` : ''}.`,
    linkPath: (c) => `/inbound/grn${qs({ grn: c.entityId })}`,
  },
  {
    eventType: 'grn.qty_mismatch',
    category: 'inbound',
    severity: 'warning',
    defaultRecipients: 'both',
    settingsKey: 'grn_qty_mismatch',
    priority: 'immediate',
    title: (c) => `Quantity mismatch on GRN ${ref(c, 'grnNumber')}`,
    body: (c) =>
      `Received ${d(c, 'receivedQty', '?')} against an ordered ${d(c, 'orderedQty', '?')}` +
      `${d(c, 'skuName') ? ` for ${d(c, 'skuName')}` : ''}${at(c)}.`,
    linkPath: (c) => `/inbound/grn${qs({ grn: c.entityId, highlight: 'mismatch' })}`,
  },
  {
    eventType: 'qc.pending',
    category: 'inbound',
    severity: 'info',
    defaultRecipients: 'manager',
    priority: 'batched',
    groupable: true,
    title: (c) => `QC inspection pending for ${ref(c, 'grnNumber')}`,
    body: (c) => `An inspection is waiting to be carried out${at(c)}.`,
    linkPath: () => `/inbound/qc${qs({ status: 'pending' })}`,
    groupTitle: (count) => `${count} QC inspections are pending`,
    groupLinkPath: () => `/inbound/qc${qs({ status: 'pending' })}`,
  },
  {
    eventType: 'qc.failed',
    category: 'inbound',
    severity: 'critical',
    defaultRecipients: 'both',
    settingsKey: 'qc_failure',
    priority: 'immediate', // critical — never batched (spec Part 5)
    title: (c) => `QC failed — ${ref(c, 'grnNumber')}${at(c)}`,
    body: (c) =>
      `${d(c, 'rejectedQty', 'Some')} unit(s) of ${d(c, 'skuName', 'an item')} failed inspection` +
      `${d(c, 'grnNumber') ? ` in ${d(c, 'grnNumber')}` : ''}.` +
      `${d(c, 'reason') ? ` Reason: ${d(c, 'reason')}` : ''}`,
    linkPath: (c) => `/inbound/qc${qs({ inspection: c.entityId })}`,
  },
  {
    eventType: 'putaway.overdue',
    category: 'inbound',
    severity: 'warning',
    defaultRecipients: 'manager',
    settingsKey: 'task_exception',
    priority: 'batched',
    groupable: true,
    title: (c) => `Putaway pending too long — ${ref(c, 'taskCode')}`,
    body: (c) => `A putaway task has been waiting over ${d(c, 'thresholdHours', '4')} hours${at(c)}.`,
    linkPath: () => `/inbound/putaway${qs({ status: 'pending' })}`,
    groupTitle: (count) => `${count} putaway tasks are overdue`,
    groupLinkPath: () => `/inbound/putaway${qs({ status: 'pending' })}`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INVENTORY (spec Part 2 — 13 events)
  // ══════════════════════════════════════════════════════════════════════════
  {
    eventType: 'inventory.low_stock',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'both',
    settingsKey: 'low_stock',
    priority: 'batched', // low priority — batched (spec Part 5)
    groupable: true,
    title: (c) => `${d(c, 'skuName', 'A SKU')} is below reorder point`,
    body: (c) =>
      `${d(c, 'skuName', 'SKU')} ${d(c, 'skuCode') ? `(${d(c, 'skuCode')})` : ''} is at ` +
      `${d(c, 'currentQty', '?')} against a reorder point of ${d(c, 'reorderPoint', '?')}${at(c)}.`,
    linkPath: (c) =>
      `/inventory${qs({ tab: 'stock-levels', sku: c.data?.skuId ?? c.entityId, filter: 'low_stock' })}`,
    groupTitle: (count) => `${count} SKUs are below reorder point`,
    groupLinkPath: (c) => `/reports/low-stock${qs({ warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'inventory.zero_stock',
    category: 'inventory',
    severity: 'critical',
    defaultRecipients: 'both',
    settingsKey: 'zero_stock',
    priority: 'immediate',
    groupable: true,
    title: (c) => `${d(c, 'skuName', 'A SKU')} is out of stock`,
    body: (c) => `${d(c, 'skuName', 'SKU')} has reached zero available quantity${at(c)}.`,
    linkPath: (c) =>
      `/inventory${qs({ tab: 'stock-levels', sku: c.data?.skuId ?? c.entityId, filter: 'zero_stock' })}`,
    groupTitle: (count) => `${count} SKUs are out of stock`,
    groupLinkPath: (c) => `/inventory${qs({ tab: 'stock-levels', filter: 'zero_stock', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'inventory.overstock',
    category: 'inventory',
    severity: 'info',
    defaultRecipients: 'manager',
    settingsKey: 'overstock',
    priority: 'batched',
    groupable: true,
    title: (c) => `${d(c, 'skuName', 'A SKU')} is overstocked`,
    body: (c) =>
      `${d(c, 'skuName', 'SKU')} is at ${d(c, 'currentQty', '?')} against a maximum of ${d(c, 'maxLevel', '?')}${at(c)}.`,
    linkPath: (c) =>
      `/inventory${qs({ tab: 'stock-levels', sku: c.data?.skuId ?? c.entityId, filter: 'overstock' })}`,
    groupTitle: (count) => `${count} SKUs are above maximum level`,
    groupLinkPath: (c) => `/inventory${qs({ tab: 'stock-levels', filter: 'overstock', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'inventory.batch_expiring_soon',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'manager',
    settingsKey: 'expiry',
    priority: 'batched', // expiry warnings are low priority (spec Part 5)
    groupable: true,
    title: (c) => `Batch ${ref(c, 'batchNumber')} expires in ${d(c, 'daysToExpiry', '30')} days`,
    body: (c) =>
      `${d(c, 'skuName', 'A batch')} — batch ${ref(c, 'batchNumber')} expires on ${d(c, 'expiryDate', 'soon')}` +
      `${d(c, 'quantity') ? `, ${d(c, 'quantity')} unit(s) affected` : ''}${at(c)}.`,
    linkPath: (c) =>
      `/inventory${qs({ tab: 'batch-expiry', batch: c.entityId, expiringInDays: d(c, 'daysBefore', '30') })}`,
    groupTitle: (count) => `${count} batches are expiring soon`,
    groupLinkPath: (c) =>
      `/inventory${qs({ tab: 'batch-expiry', expiringInDays: '30', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'inventory.batch_expiring_critical',
    category: 'inventory',
    severity: 'critical',
    defaultRecipients: 'both',
    settingsKey: 'expiry',
    priority: 'immediate',
    groupable: true,
    title: (c) => `Batch ${ref(c, 'batchNumber')} expires in ${d(c, 'daysToExpiry', '7')} days`,
    body: (c) =>
      `${d(c, 'skuName', 'A batch')} — batch ${ref(c, 'batchNumber')} expires on ${d(c, 'expiryDate', 'within 7 days')}. Act now${at(c)}.`,
    linkPath: (c) => `/inventory${qs({ tab: 'batch-expiry', batch: c.entityId, expiringInDays: '7' })}`,
    groupTitle: (count) => `${count} batches expire within 7 days`,
    groupLinkPath: (c) => `/inventory${qs({ tab: 'batch-expiry', expiringInDays: '7', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'adjustment.approval_pending',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'admin',
    settingsKey: 'adjustment_approval_pending',
    priority: 'immediate',
    requiresAction: true,
    title: (c) => `Adjustment ${ref(c, 'adjustmentNumber')} awaits your approval`,
    body: (c) =>
      `${d(c, 'requestedBy', 'A user')} submitted a stock adjustment of ${d(c, 'quantity', '?')} unit(s)` +
      `${d(c, 'skuName') ? ` on ${d(c, 'skuName')}` : ''}${at(c)}.` +
      `${d(c, 'reason') ? ` Reason: ${d(c, 'reason')}` : ''}`,
    linkPath: (c) => `/inventory${qs({ tab: 'adjustments', adjustment: c.entityId, status: 'pending' })}`,
  },
  {
    eventType: 'adjustment.approved',
    category: 'inventory',
    severity: 'info',
    defaultRecipients: 'user', // the requester
    priority: 'immediate',
    title: (c) => `Adjustment ${ref(c, 'adjustmentNumber')} approved`,
    body: (c) => `${d(c, 'approvedBy', 'An admin')} approved your stock adjustment.`,
    linkPath: (c) => `/inventory${qs({ tab: 'adjustments', adjustment: c.entityId })}`,
  },
  {
    eventType: 'adjustment.rejected',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `Adjustment ${ref(c, 'adjustmentNumber')} rejected`,
    body: (c) =>
      `${d(c, 'rejectedBy', 'An admin')} rejected your stock adjustment.` +
      `${d(c, 'reason') ? ` Reason: ${d(c, 'reason')}` : ''}`,
    linkPath: (c) => `/inventory${qs({ tab: 'adjustments', adjustment: c.entityId })}`,
  },
  {
    eventType: 'cycle_count.variance_found',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'manager',
    settingsKey: 'cycle_count_variance',
    priority: 'batched',
    title: (c) => `Variance found on count ${ref(c, 'countNumber')}`,
    body: (c) =>
      `Cycle count ${ref(c, 'countNumber')} found ${d(c, 'varianceCount', 'a')} variance(s)` +
      `${d(c, 'variancePct') ? ` (${d(c, 'variancePct')}%)` : ''}${at(c)}.`,
    linkPath: (c) => `/inventory${qs({ tab: 'cycle-count', count: c.entityId, view: 'variance' })}`,
  },
  {
    eventType: 'cycle_count.variance_escalated',
    category: 'inventory',
    severity: 'critical',
    defaultRecipients: 'admin',
    settingsKey: 'cycle_count_variance',
    priority: 'immediate',
    requiresAction: true,
    title: (c) => `Count ${ref(c, 'countNumber')} escalated for approval`,
    body: (c) =>
      `Cycle count ${ref(c, 'countNumber')} exceeded the auto-approve threshold` +
      `${d(c, 'variancePct') ? ` at ${d(c, 'variancePct')}% variance` : ''} and needs your decision${at(c)}.`,
    linkPath: (c) => `/inventory${qs({ tab: 'cycle-count', count: c.entityId, view: 'variance' })}`,
  },
  {
    eventType: 'transfer.approval_pending',
    category: 'inventory',
    severity: 'warning',
    defaultRecipients: 'admin',
    settingsKey: 'transfer_approval_pending',
    priority: 'immediate',
    requiresAction: true,
    title: (c) =>
      `Transfer ${ref(c, 'transferNumber')} ${d(c, 'fromWarehouseName') && d(c, 'toWarehouseName') ? `${d(c, 'fromWarehouseName')} → ${d(c, 'toWarehouseName')} ` : ''}awaits your approval`,
    body: (c) =>
      `${d(c, 'requestedBy', 'A manager')} requested an inter-warehouse transfer of ${d(c, 'totalItems', 'several')} line(s).`,
    linkPath: (c) => `/inventory${qs({ tab: 'transfers', transfer: c.entityId, status: 'pending' })}`,
  },
  {
    eventType: 'transfer.approved',
    category: 'inventory',
    severity: 'info',
    defaultRecipients: 'user', // the requesting manager
    priority: 'immediate',
    title: (c) => `Transfer ${ref(c, 'transferNumber')} approved`,
    body: (c) => `${d(c, 'approvedBy', 'An admin')} approved your transfer request.`,
    linkPath: (c) => `/inventory${qs({ tab: 'transfers', transfer: c.entityId })}`,
  },
  {
    eventType: 'transfer.received_shortage',
    category: 'inventory',
    severity: 'critical',
    defaultRecipients: 'both',
    priority: 'immediate',
    title: (c) => `Shortage on transfer ${ref(c, 'transferNumber')}`,
    body: (c) =>
      `${d(c, 'toWarehouseName', 'The destination')} received ${d(c, 'receivedQty', '?')} of ${d(c, 'sentQty', '?')} unit(s)` +
      `${d(c, 'skuName') ? ` for ${d(c, 'skuName')}` : ''} — investigate the shortfall.`,
    linkPath: (c) => `/inventory${qs({ tab: 'transfers', transfer: c.entityId, highlight: 'shortage' })}`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // OUTBOUND (spec Part 2 — 9 events)
  // ══════════════════════════════════════════════════════════════════════════
  {
    eventType: 'sales_order.created_ecommerce',
    category: 'outbound',
    severity: 'info',
    defaultRecipients: 'both',
    priority: 'batched',
    groupable: true,
    title: (c) => `New ${d(c, 'channel', 'ecommerce')} order ${ref(c, 'orderNumber')}`,
    body: (c) =>
      `${d(c, 'customerName', 'A customer')} placed order ${ref(c, 'orderNumber')} via ${d(c, 'channel', 'an ecommerce channel')}` +
      `${d(c, 'totalAmount') ? ` for ${d(c, 'totalAmount')}` : ''}.`,
    linkPath: (c) => `/outbound${qs({ order: c.entityId })}`,
    groupTitle: (count, c) => `${count} new ${d(c, 'channel', 'ecommerce')} orders`,
    groupLinkPath: (c) => `/outbound${qs({ source: 'ecommerce', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'sales_order.due_not_picked',
    category: 'outbound',
    severity: 'warning',
    defaultRecipients: 'manager',
    settingsKey: 'order_due_not_picked',
    priority: 'batched',
    groupable: true,
    title: (c) => `Order ${ref(c, 'orderNumber')} is due today and not picked`,
    body: (c) => `Order ${ref(c, 'orderNumber')} ships today but picking has not started${at(c)}.`,
    linkPath: (c) => `/outbound${qs({ order: c.entityId })}`,
    groupTitle: (count) => `${count} orders due today are not picked`,
    groupLinkPath: (c) => `/outbound${qs({ dueToday: 'true', status: 'pending', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'pick_list.completed',
    category: 'outbound',
    severity: 'info',
    defaultRecipients: 'manager',
    priority: 'batched',
    groupable: true,
    title: (c) => `Pick list ${ref(c, 'pickListNumber')} completed`,
    body: (c) =>
      `${d(c, 'pickerName', 'A worker')} completed pick list ${ref(c, 'pickListNumber')}` +
      `${d(c, 'totalItems') ? ` — ${d(c, 'totalItems')} line(s)` : ''}${at(c)}.`,
    linkPath: (c) => `/outbound/picking${qs({ pickList: c.entityId })}`,
    groupTitle: (count) => `${count} pick lists completed`,
    groupLinkPath: (c) => `/outbound/picking${qs({ status: 'completed', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'pick.issue_reported',
    category: 'outbound',
    severity: 'critical',
    defaultRecipients: 'manager',
    settingsKey: 'worker_reported_issue',
    priority: 'immediate',
    title: (c) => `Pick issue reported on ${ref(c, 'pickListNumber')}`,
    body: (c) =>
      `${d(c, 'workerName', 'A worker')} reported "${d(c, 'issueType', 'an issue')}"` +
      `${d(c, 'binCode') ? ` at bin ${d(c, 'binCode')}` : ''}${d(c, 'skuName') ? ` for ${d(c, 'skuName')}` : ''}.` +
      `${d(c, 'notes') ? ` ${d(c, 'notes')}` : ''}`,
    linkPath: (c) =>
      `/outbound/picking${qs({ pickList: c.data?.pickListId ?? c.entityId, issue: c.entityId })}`,
  },
  {
    eventType: 'packing.completed',
    category: 'outbound',
    severity: 'info',
    defaultRecipients: 'manager',
    priority: 'batched',
    groupable: true,
    title: (c) => `Packing completed for ${ref(c, 'orderNumber')}`,
    body: (c) => `${d(c, 'packerName', 'A worker')} finished packing ${ref(c, 'orderNumber')}${at(c)}.`,
    linkPath: (c) => `/outbound/packing${qs({ order: c.data?.orderId ?? c.entityId })}`,
    groupTitle: (count) => `${count} orders packed`,
    groupLinkPath: (c) => `/outbound/packing${qs({ status: 'completed', warehouseId: c.warehouseId })}`,
  },
  {
    eventType: 'shipment.dispatch_delayed',
    category: 'outbound',
    severity: 'warning',
    defaultRecipients: 'manager',
    settingsKey: 'task_exception',
    priority: 'immediate',
    title: (c) => `Shipment ${ref(c, 'shipmentNumber')} dispatch is delayed`,
    body: (c) =>
      `Shipment ${ref(c, 'shipmentNumber')} was due to depart at ${d(c, 'departureTime', 'its scheduled time')}` +
      `${d(c, 'courierName') ? ` with ${d(c, 'courierName')}` : ''} and has not left${at(c)}.`,
    linkPath: (c) => `/outbound/shipping${qs({ shipment: c.entityId, status: 'delayed' })}`,
  },
  {
    eventType: 'shipment.delivered',
    category: 'outbound',
    severity: 'info',
    defaultRecipients: 'admin',
    priority: 'batched',
    groupable: true,
    title: (c) => `Shipment ${ref(c, 'shipmentNumber')} delivered`,
    body: (c) =>
      `${d(c, 'courierName', 'The courier')} confirmed delivery` +
      `${d(c, 'customerName') ? ` to ${d(c, 'customerName')}` : ''}` +
      `${d(c, 'deliveredAt') ? ` on ${d(c, 'deliveredAt')}` : ''}.`,
    linkPath: (c) => `/outbound/shipping${qs({ shipment: c.entityId })}`,
    groupTitle: (count) => `${count} shipments delivered`,
    groupLinkPath: () => `/outbound/shipping${qs({ status: 'delivered' })}`,
  },
  {
    eventType: 'shipment.courier_booking_failed',
    category: 'outbound',
    severity: 'critical',
    defaultRecipients: 'both',
    priority: 'immediate', // critical — never batched (spec Part 5)
    title: (c) => `Courier booking failed for ${ref(c, 'shipmentNumber')}`,
    body: (c) =>
      `${d(c, 'courierName', 'The courier API')} rejected the booking for shipment ${ref(c, 'shipmentNumber')}.` +
      `${d(c, 'errorMessage') ? ` ${d(c, 'errorMessage')}` : ''}`,
    linkPath: (c) => `/outbound/shipping${qs({ shipment: c.entityId, highlight: 'booking_failed' })}`,
  },
  {
    eventType: 'ecommerce.sync_failed',
    category: 'outbound',
    severity: 'critical',
    defaultRecipients: 'admin',
    priority: 'immediate',
    title: (c) => `${d(c, 'channel', 'Ecommerce')} sync failed for ${ref(c, 'orderNumber')}`,
    body: (c) =>
      `Tracking could not be pushed back to ${d(c, 'channel', 'the sales channel')} for order ${ref(c, 'orderNumber')}.` +
      `${d(c, 'errorMessage') ? ` ${d(c, 'errorMessage')}` : ''}`,
    linkPath: (c) => `/outbound${qs({ order: c.entityId, highlight: 'sync_failed' })}`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WORKER (spec Part 2 — 8 events). All route to exactly one worker.
  // ══════════════════════════════════════════════════════════════════════════
  {
    eventType: 'task.assigned',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `New ${d(c, 'taskType', 'task')} assigned to you`,
    body: (c) =>
      `Task ${ref(c, 'taskCode')}${d(c, 'priority') ? ` (${d(c, 'priority')} priority)` : ''} is ready` +
      `${d(c, 'dueAt') ? `, due ${d(c, 'dueAt')}` : ''}.`,
    linkPath: (c) => `/m${qs({ task: c.entityId })}`,
  },
  {
    eventType: 'task.deadline_soon',
    category: 'worker',
    severity: 'warning',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `Task ${ref(c, 'taskCode')} is due in ${d(c, 'minutesRemaining', '30')} minutes`,
    body: (c) => `Your ${d(c, 'taskType', 'task')} is approaching its deadline${at(c)}.`,
    linkPath: (c) => `/m${qs({ task: c.entityId })}`,
  },
  {
    eventType: 'task.reassigned_away',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'batched',
    title: (c) => `Task ${ref(c, 'taskCode')} was reassigned`,
    body: (c) =>
      `Task ${ref(c, 'taskCode')} is no longer assigned to you` +
      `${d(c, 'reassignedBy') ? ` — reassigned by ${d(c, 'reassignedBy')}` : ''}.`,
    linkPath: () => `/m`,
  },
  {
    eventType: 'worker.badge_earned',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'batched',
    title: (c) => `You earned the ${d(c, 'badgeName', 'new')} badge`,
    body: (c) => `${d(c, 'badgeDescription', 'Nice work — keep it up.')}`,
    linkPath: () => `/m${qs({ tab: 'profile' })}`,
  },
  {
    eventType: 'worker.challenge_completed',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'batched',
    title: (c) => `Daily challenge complete — ${d(c, 'challengeName', 'well done')}`,
    body: (c) => `${d(c, 'rewardText', 'You finished today\'s challenge.')}`,
    linkPath: () => `/m${qs({ tab: 'profile' })}`,
  },
  {
    eventType: 'worker.manager_message',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `Message from ${d(c, 'fromName', 'your manager')}`,
    body: (c) => d(c, 'message', ''),
    linkPath: () => `/m${qs({ tab: 'messages' })}`,
  },
  {
    eventType: 'worker.shift_starting',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: (c) => `Your shift starts in ${d(c, 'minutesRemaining', '30')} minutes`,
    body: (c) => `Shift ${d(c, 'shiftName', '')} begins at ${d(c, 'startsAt', 'soon')}${at(c)}.`,
    linkPath: () => `/m`,
  },
  {
    eventType: 'worker.role_updated',
    category: 'worker',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'batched',
    title: () => `Your role and allowed tasks were updated`,
    body: (c) =>
      `You are now a ${d(c, 'role', 'worker')}` +
      `${d(c, 'allowedTasks') ? ` and can perform: ${d(c, 'allowedTasks')}` : ''}.`,
    linkPath: () => `/m`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // USER AND SYSTEM (spec Part 2 — 5 events)
  // ══════════════════════════════════════════════════════════════════════════
  {
    eventType: 'user.joined',
    category: 'system',
    severity: 'info',
    defaultRecipients: 'admin',
    settingsKey: 'user_activity',
    priority: 'batched',
    companyWide: true,
    title: (c) => `${d(c, 'fullName', 'A new user')} joined your organisation`,
    body: (c) =>
      `${d(c, 'fullName', 'A user')} (${d(c, 'email', 'no email')}) accepted their invitation as ${d(c, 'role', 'a user')}.`,
    linkPath: (c) => `/users${qs({ user: c.entityId })}`,
  },
  {
    eventType: 'user.login_lockout',
    category: 'system',
    severity: 'critical',
    defaultRecipients: 'admin',
    settingsKey: 'user_activity',
    priority: 'immediate',
    companyWide: true,
    title: (c) => `Account locked — ${d(c, 'email', 'a user')}`,
    body: (c) =>
      `${d(c, 'failedAttempts', 'Several')} failed login attempts locked this account` +
      `${d(c, 'ipAddress') ? ` (last attempt from ${d(c, 'ipAddress')})` : ''}.`,
    linkPath: (c) => `/users${qs({ user: c.entityId, highlight: 'locked' })}`,
  },
  {
    eventType: 'plan.limit_approaching',
    category: 'system',
    severity: 'warning',
    defaultRecipients: 'admin',
    priority: 'batched',
    companyWide: true,
    title: (c) => `You are at ${d(c, 'percentUsed', '90')}% of your ${d(c, 'limitType', 'plan')} limit`,
    body: (c) =>
      `${d(c, 'used', '?')} of ${d(c, 'limit', '?')} ${d(c, 'limitType', 'records')} used on the ${d(c, 'planName', 'current')} plan.`,
    linkPath: () => `/settings${qs({ tab: 'organization' })}`,
  },
  {
    eventType: 'plan.limit_reached',
    category: 'system',
    severity: 'critical',
    defaultRecipients: 'admin',
    priority: 'immediate',
    companyWide: true,
    title: (c) => `${d(c, 'limitType', 'Plan')} limit reached`,
    body: (c) =>
      `You have used all ${d(c, 'limit', 'available')} ${d(c, 'limitType', 'records')} on the ${d(c, 'planName', 'current')} plan. Upgrade to continue.`,
    linkPath: () => `/settings${qs({ tab: 'organization' })}`,
  },
  {
    // Settings > Notifications > "Send test notification". Deliberately routed
    // through the real engine so the button proves the actual pipeline —
    // registry → settings gate → recipient resolution → insert → socket → email
    // — rather than writing a row nobody else's code path would ever produce.
    // It goes to exactly the person who clicked it and nobody else.
    eventType: 'system.test_notification',
    category: 'system',
    severity: 'info',
    defaultRecipients: 'user',
    priority: 'immediate',
    title: () => `Test notification`,
    body: (c) =>
      `This is a test notification sent from Settings${d(c, 'triggeredBy') ? ` by ${d(c, 'triggeredBy')}` : ''}. ` +
      `If you can see it, notification delivery is working.`,
    linkPath: () => `/notifications`,
  },
  {
    eventType: 'system.daily_summary',
    category: 'system',
    severity: 'info',
    defaultRecipients: 'both',
    settingsKey: 'daily_summary',
    priority: 'batched',
    companyWide: true,
    title: (c) => `Daily summary — ${d(c, 'date', 'today')}`,
    body: (c) =>
      `${n(c, 'ordersShipped')} order(s) shipped, ${n(c, 'grnsReceived')} GRN(s) received, ` +
      `${n(c, 'pendingApprovals')} approval(s) pending, ${n(c, 'lowStockCount')} SKU(s) low on stock.`,
    linkPath: () => `/`,
  },
];

const BY_TYPE = new Map<string, NotificationEventDef>(
  NOTIFICATION_EVENTS.map((e) => [e.eventType, e]),
);

export function findEventDef(eventType: string): NotificationEventDef | undefined {
  return BY_TYPE.get(eventType);
}

export const NOTIFICATION_EVENT_TYPES: string[] = NOTIFICATION_EVENTS.map((e) => e.eventType);

/** Collapse key for a groupable event — explicit builder, else event+warehouse. */
export function resolveGroupKey(def: NotificationEventDef, ctx: NotificationContext): string | null {
  if (!def.groupable) return null;
  const key = def.groupKey ? def.groupKey(ctx) : `${def.eventType}:${ctx.warehouseId ?? 'all'}`;
  return key ? key.slice(0, 120) : null;
}
