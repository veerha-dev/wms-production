import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Generic CRUD hooks used by <MasterListSection />.
 *
 * Every settings list endpoint in the Settings module follows the same contract:
 *   GET    <endpoint>          -> { success, data: [...] }
 *   POST   <endpoint>          -> { success, data }
 *   PUT    <endpoint>/:id      -> { success, data }
 *   DELETE <endpoint>/:id      -> soft delete
 *
 * `endpoint` is always the FULL path (including /api/v1).
 */

export const MASTERS_BASE = '/api/v1/settings/masters';
export const OPERATIONS_BASE = '/api/v1/settings/operations';

export function crudQueryKey(endpoint: string, params?: Record<string, any>) {
  return ['settings-crud', endpoint, params ?? null];
}

export function useCrudList<T = any>(
  endpoint: string,
  params?: Record<string, any>,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: crudQueryKey(endpoint, params),
    queryFn: async (): Promise<T[]> => {
      const { data } = await api.get(endpoint, { params });
      const payload = data?.data ?? data;
      return Array.isArray(payload) ? payload : (payload?.items ?? []);
    },
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useCrudCreate(endpoint: string, params?: Record<string, any>, entityName = 'Record') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, any>) => api.post(endpoint, dto).then((r) => r.data?.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crudQueryKey(endpoint, params) });
      qc.invalidateQueries({ queryKey: ['settings-crud', endpoint] });
      toast.success(`${entityName} created`);
    },
    onError: (e: any) => toast.error(errMsg(e, `Failed to create ${entityName.toLowerCase()}`)),
  });
}

export function useCrudUpdate(endpoint: string, params?: Record<string, any>, entityName = 'Record') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & Record<string, any>) =>
      api.put(`${endpoint}/${id}`, dto).then((r) => r.data?.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crudQueryKey(endpoint, params) });
      qc.invalidateQueries({ queryKey: ['settings-crud', endpoint] });
      toast.success(`${entityName} updated`);
    },
    onError: (e: any) => toast.error(errMsg(e, `Failed to update ${entityName.toLowerCase()}`)),
  });
}

export function useCrudDelete(endpoint: string, params?: Record<string, any>, entityName = 'Record') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crudQueryKey(endpoint, params) });
      qc.invalidateQueries({ queryKey: ['settings-crud', endpoint] });
      toast.success(`${entityName} removed`);
    },
    onError: (e: any) => toast.error(errMsg(e, `Failed to remove ${entityName.toLowerCase()}`)),
  });
}

function errMsg(e: any, fallback: string) {
  return e?.response?.data?.error?.message || e?.response?.data?.message || fallback;
}

// ─── Barcode & Label settings (singleton) ────────────────────────────────────

export interface BarcodeSettings {
  locationCodeType: 'qr' | 'barcode';
  labelSize: 'small' | 'medium' | 'large';
  /** Must match the barcode_settings.print_format CHECK constraint (080). */
  printFormat: 'a4' | 'thermal';
  includeHumanReadable: boolean;
  skuBarcodeSource: 'manufacturer' | 'auto' | 'both';
}

export const BARCODE_DEFAULTS: BarcodeSettings = {
  locationCodeType: 'qr',
  labelSize: 'medium',
  printFormat: 'a4',
  includeHumanReadable: true,
  skuBarcodeSource: 'both',
};

export function useBarcodeSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['settings-barcode'],
    queryFn: async (): Promise<BarcodeSettings> => {
      const { data } = await api.get(`${MASTERS_BASE}/barcode-settings`);
      return { ...BARCODE_DEFAULTS, ...(data?.data ?? {}) };
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    placeholderData: BARCODE_DEFAULTS,
  });
}

export function useUpdateBarcodeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: Partial<BarcodeSettings>) =>
      api.patch(`${MASTERS_BASE}/barcode-settings`, dto).then((r) => r.data?.data),
    onSuccess: (data) => {
      qc.setQueryData(['settings-barcode'], (old: any) => ({ ...BARCODE_DEFAULTS, ...old, ...data }));
      toast.success('Barcode & label settings saved');
    },
    onError: (e: any) => toast.error(errMsg(e, 'Failed to save barcode settings')),
  });
}

// ─── Document Numbering ──────────────────────────────────────────────────────

export interface DocumentNumberingRule {
  docType: string;
  prefix: string;
  startingNumber: number;
  numberLength: number;
  resetYearly: boolean;
}

export const DOC_TYPES: { value: string; label: string; prefix: string }[] = [
  { value: 'purchase_order', label: 'Purchase Order', prefix: 'PO-' },
  { value: 'sales_order', label: 'Sales Order', prefix: 'SO-' },
  { value: 'grn', label: 'GRN', prefix: 'GRN-' },
  { value: 'pick_list', label: 'Pick List', prefix: 'PL-' },
  { value: 'shipment', label: 'Shipment', prefix: 'SHP-' },
  { value: 'invoice', label: 'Invoice', prefix: 'INV-' },
  { value: 'transfer', label: 'Transfer', prefix: 'TRF-' },
  { value: 'cycle_count', label: 'Cycle Count', prefix: 'CC-' },
  { value: 'putaway', label: 'Putaway', prefix: 'PUT-' },
  { value: 'return', label: 'Return', prefix: 'RET-' },
  { value: 'task', label: 'Task', prefix: 'TSK-' },
];

export function useDocumentNumbering() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['settings-doc-numbering'],
    queryFn: async (): Promise<DocumentNumberingRule[]> => {
      const { data } = await api.get(`${MASTERS_BASE}/document-numbering`);
      const rows: any[] = Array.isArray(data?.data) ? data.data : [];
      // Merge server rows over the canonical doc-type list so every type renders.
      return DOC_TYPES.map((t) => {
        const row = rows.find((r) => r.docType === t.value) || {};
        return {
          docType: t.value,
          prefix: row.prefix ?? t.prefix,
          // The API field is `nextNumber` (document_numbering.next_number);
          // the UI labels it "Starting Number".
          startingNumber: Number(row.nextNumber ?? 1),
          numberLength: Number(row.numberLength ?? 3),
          resetYearly: row.resetYearly ?? false,
        };
      });
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDocumentNumbering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docType, startingNumber, ...dto }: DocumentNumberingRule) =>
      // Send `nextNumber` — the DTO whitelist silently drops `startingNumber`,
      // which made Save report success while persisting nothing.
      api
        .patch(`${MASTERS_BASE}/document-numbering/${docType}`, {
          ...dto,
          nextNumber: Number(startingNumber) || 1,
        })
        .then((r) => r.data?.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-doc-numbering'] });
      toast.success('Numbering rule saved');
    },
    onError: (e: any) => toast.error(errMsg(e, 'Failed to save numbering rule')),
  });
}

// ─── Approval Rules ──────────────────────────────────────────────────────────

/**
 * Backend shape of `GET /api/v1/settings/approval-rules`. Each of the five
 * spec rules stores its value in a DIFFERENT column, so the UI must read and
 * write the right one per module (see APPROVAL_RULE_DEFS.field in MastersTab):
 *   stock_adjustment_units    -> thresholdUnits
 *   stock_adjustment_value    -> thresholdAmount
 *   inter_warehouse_transfer  -> transferRequiresApproval (boolean)
 *   purchase_order            -> thresholdAmount
 *   cycle_count_variance      -> cycleCountAutoApprovePct
 */
export interface ApprovalRule {
  id?: string;
  module: string;
  label?: string;
  thresholdAmount?: number | null;
  thresholdUnits?: number | null;
  transferRequiresApproval?: boolean;
  cycleCountAutoApprovePct?: number | null;
  isActive: boolean;
}

/** Only the mutable fields — `module` selects the row, the rest is the patch. */
export type ApprovalRulePatch = { module: string } & Partial<
  Pick<
    ApprovalRule,
    'thresholdAmount' | 'thresholdUnits' | 'transferRequiresApproval' | 'cycleCountAutoApprovePct' | 'isActive'
  >
>;

export function useApprovalRules() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['settings-approval-rules'],
    queryFn: async (): Promise<ApprovalRule[]> => {
      const { data } = await api.get('/api/v1/settings/approval-rules');
      return Array.isArray(data?.data) ? data.data : [];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    // Send only the keys the caller supplied — the PATCH DTO treats every field
    // as optional, so an omitted key leaves that column untouched.
    mutationFn: ({ module, ...patch }: ApprovalRulePatch) =>
      api.patch(`/api/v1/settings/approval-rules/${module}`, patch)
        .then((r) => r.data?.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-approval-rules'] });
      toast.success('Approval rule saved');
    },
    onError: (e: any) => toast.error(errMsg(e, 'Failed to save approval rule')),
  });
}
