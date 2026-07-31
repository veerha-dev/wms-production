/**
 * Catalog of alert types configurable in Settings > Notifications (spec Tab 5).
 *
 * This list — not a migration — is the source of truth. `tenant_notification_settings`
 * rows are seeded lazily from here on first read, so adding an alert type is a
 * one-line change with no schema work. The notification workstream reads the
 * same table to decide whether to raise/email an alert and who receives it.
 */

export type AlertGroup = 'inventory' | 'operations' | 'approvals' | 'system';

export interface AlertTypeDef {
  /** Stable key stored in tenant_notification_settings.alert_type. */
  key: string;
  label: string;
  description: string;
  group: AlertGroup;
  /** Defaults applied the first time the row is seeded. */
  defaultEnabled: boolean;
  defaultEmailEnabled: boolean;
  defaultRecipients: 'admin' | 'manager' | 'both';
  /** Extra per-alert configuration seeded into the JSONB `config` column. */
  defaultConfig: Record<string, any>;
}

export const NOTIFICATION_ALERT_TYPES: AlertTypeDef[] = [
  // ─── Inventory ─────────────────────────────────────────────────────────────
  {
    key: 'low_stock',
    label: 'Low Stock Alert',
    description: 'Stock for a SKU falls to or below its reorder point.',
    group: 'inventory',
    defaultEnabled: true,
    defaultEmailEnabled: true,
    defaultRecipients: 'both',
    defaultConfig: {},
  },
  {
    key: 'zero_stock',
    label: 'Zero Stock Alert',
    description: 'A SKU has reached zero available quantity.',
    group: 'inventory',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'both',
    defaultConfig: {},
  },
  {
    key: 'overstock',
    label: 'Overstock Alert',
    description: 'Stock exceeds the configured maximum level for a SKU.',
    group: 'inventory',
    defaultEnabled: false,
    defaultEmailEnabled: false,
    defaultRecipients: 'manager',
    defaultConfig: {},
  },
  {
    key: 'expiry',
    label: 'Expiry Alert',
    description: 'A batch is approaching its expiry date.',
    group: 'inventory',
    defaultEnabled: true,
    defaultEmailEnabled: true,
    defaultRecipients: 'both',
    defaultConfig: { daysBefore: 30 },
  },

  // ─── Operations ────────────────────────────────────────────────────────────
  {
    key: 'task_exception',
    label: 'Task Exceptions',
    description: 'A task is blocked, overdue, or reported as an exception.',
    group: 'operations',
    defaultEnabled: true,
    defaultEmailEnabled: true,
    defaultRecipients: 'manager',
    defaultConfig: {},
  },
  {
    key: 'grn_qty_mismatch',
    label: 'GRN Quantity Mismatch',
    description: 'Received quantity differs from the ordered quantity on a GRN.',
    group: 'operations',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'both',
    defaultConfig: {},
  },
  {
    key: 'qc_failure',
    label: 'QC Failure',
    description: 'An inspection fails quality control.',
    group: 'operations',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'both',
    defaultConfig: {},
  },
  {
    key: 'order_due_not_picked',
    label: 'Order Due Today Not Picked',
    description: 'A sales order due today has not been picked yet.',
    group: 'operations',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'manager',
    defaultConfig: {},
  },
  {
    key: 'worker_reported_issue',
    label: 'Worker Reported Issue',
    description: 'A worker raised an issue from the mobile/task screen.',
    group: 'operations',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'manager',
    defaultConfig: {},
  },

  // ─── Approvals ─────────────────────────────────────────────────────────────
  {
    key: 'adjustment_approval_pending',
    label: 'Adjustment Approval Pending',
    description: 'A stock adjustment above the threshold is awaiting approval.',
    group: 'approvals',
    defaultEnabled: true,
    defaultEmailEnabled: true,
    defaultRecipients: 'admin',
    defaultConfig: {},
  },
  {
    key: 'transfer_approval_pending',
    label: 'Transfer Approval Pending',
    description: 'An inter-warehouse transfer is awaiting approval.',
    group: 'approvals',
    defaultEnabled: true,
    defaultEmailEnabled: true,
    defaultRecipients: 'admin',
    defaultConfig: {},
  },
  {
    key: 'cycle_count_variance',
    label: 'Cycle Count Variance Found',
    description: 'A cycle count produced a variance above the auto-approve threshold.',
    group: 'approvals',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'both',
    defaultConfig: {},
  },

  // ─── System ────────────────────────────────────────────────────────────────
  {
    key: 'daily_summary',
    label: 'Daily Summary',
    description: 'End-of-day summary of warehouse activity.',
    group: 'system',
    defaultEnabled: false,
    defaultEmailEnabled: true,
    defaultRecipients: 'admin',
    defaultConfig: { sendAtHour: 18 },
  },
  {
    key: 'user_activity',
    label: 'User Activity',
    description: 'Logins, role changes, and other user account events.',
    group: 'system',
    defaultEnabled: false,
    defaultEmailEnabled: false,
    defaultRecipients: 'admin',
    defaultConfig: {},
  },
  {
    key: 'system_updates',
    label: 'System Updates',
    description: 'Product releases, maintenance windows, and platform notices.',
    group: 'system',
    defaultEnabled: true,
    defaultEmailEnabled: false,
    defaultRecipients: 'admin',
    defaultConfig: {},
  },
];

export const NOTIFICATION_ALERT_KEYS: string[] = NOTIFICATION_ALERT_TYPES.map((a) => a.key);

export function findAlertType(key: string): AlertTypeDef | undefined {
  return NOTIFICATION_ALERT_TYPES.find((a) => a.key === key);
}
