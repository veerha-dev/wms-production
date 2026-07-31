import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Loader2, Lock } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Switch } from '@/shared/components/ui/switch';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Separator } from '@/shared/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { DataState } from '@/shared/components/ui/data-state';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { useCrudList, useCrudCreate, useCrudUpdate, useCrudDelete } from '../hooks/useMasters';

// ─── Config types ────────────────────────────────────────────────────────────

export type MasterFieldType =
  | 'text' | 'number' | 'select' | 'checkbox' | 'time' | 'multiselect';

export interface MasterColumn<T = any> {
  /** Property on the row. */
  key: string;
  label: string;
  /** Custom cell renderer. Falls back to a type-aware default. */
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface MasterFieldDef {
  key: string;
  label: string;
  type: MasterFieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  /** 1 = half width, 2 = full width in the 2-column dialog grid. Default 1. */
  colSpan?: 1 | 2;
  /** Field cannot be changed once the record exists (e.g. system codes). */
  immutable?: boolean;
}

export interface MasterListSectionProps<T = any> {
  title: string;
  description?: string;
  /** FULL endpoint path including /api/v1, e.g. /api/v1/settings/masters/boxes */
  endpoint: string;
  /** Extra query params, also forwarded as defaults on create (e.g. { category }). */
  params?: Record<string, any>;
  columns: MasterColumn<T>[];
  fields: MasterFieldDef[];
  /** Singular entity name used in dialog titles and toasts. Defaults to `title`. */
  entityName?: string;
  /** Row property used in the delete confirmation. Default 'name'. */
  labelKey?: string;
  /** Row property holding 'active' | 'inactive'. Default 'status'. Pass null to hide. */
  statusKey?: string | null;
  /** Rows where this property is truthy are read-only (system seeded). */
  systemKey?: string;
  /** Gate the query (e.g. no warehouse selected yet). Default true. */
  enabled?: boolean;
  /** When false, all write affordances are hidden. Default true. */
  canWrite?: boolean;
  /** Show the client-side search box. Default true. */
  searchable?: boolean;
  emptyMessage?: string;
  /** Extra controls rendered next to the Add button (e.g. a category filter). */
  toolbar?: React.ReactNode;
  /** Render without the wms-card chrome (for use inside an accordion). */
  bare?: boolean;
  dialogClassName?: string;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MasterListSection<T extends Record<string, any>>({
  title,
  description,
  endpoint,
  params,
  columns,
  fields,
  entityName,
  labelKey = 'name',
  statusKey = 'status',
  systemKey,
  enabled = true,
  canWrite = true,
  searchable = true,
  emptyMessage,
  toolbar,
  bare = false,
  dialogClassName = 'max-w-2xl',
}: MasterListSectionProps<T>) {
  const name = entityName || title.replace(/s$/, '');
  const { data: rows = [], isLoading, error, refetch } = useCrudList<T>(endpoint, params, { enabled });
  const create = useCrudCreate(endpoint, params, name);
  const update = useCrudUpdate(endpoint, params, name);
  const remove = useCrudDelete(endpoint, params, name);

  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; row: T | null }>({ open: false, row: null });
  const [form, setForm] = useState<Record<string, any>>({});
  const [confirm, setConfirm] = useState<{ open: boolean; row: T | null }>({ open: false, row: null });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search, columns]);

  const blankForm = () => {
    const f: Record<string, any> = {};
    for (const fd of fields) {
      f[fd.key] = fd.defaultValue !== undefined
        ? fd.defaultValue
        : fd.type === 'checkbox' ? false
        : fd.type === 'multiselect' ? []
        : fd.type === 'number' ? ''
        : fd.type === 'select' ? (fd.options?.[0]?.value ?? '')
        : '';
    }
    if (statusKey) f[statusKey] = 'active';
    return f;
  };

  const openCreate = () => {
    setForm(blankForm());
    setDialog({ open: true, row: null });
  };

  const openEdit = (row: T) => {
    const f: Record<string, any> = {};
    for (const fd of fields) {
      const v = row[fd.key];
      f[fd.key] = fd.type === 'multiselect'
        ? (Array.isArray(v) ? v : [])
        : fd.type === 'checkbox'
        ? !!v
        : v ?? '';
    }
    if (statusKey) f[statusKey] = row[statusKey] ?? 'active';
    setForm(f);
    setDialog({ open: true, row });
  };

  const setValue = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = () => {
    const payload: Record<string, any> = { ...params };
    for (const fd of fields) {
      let v = form[fd.key];
      if (fd.type === 'number') v = v === '' || v === null ? null : Number(v);
      payload[fd.key] = v;
    }
    if (statusKey) payload[statusKey] = form[statusKey] ?? 'active';
    return payload;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = fields.find(
      (fd) => fd.required && (form[fd.key] === '' || form[fd.key] === null || form[fd.key] === undefined),
    );
    if (missing) {
      toast.error(`${missing.label} is required`);
      return;
    }
    const payload = buildPayload();
    const done = () => setDialog({ open: false, row: null });
    if (dialog.row) {
      update.mutate({ id: (dialog.row as any).id, ...payload }, { onSuccess: done });
    } else {
      create.mutate(payload, { onSuccess: done });
    }
  };

  const toggleStatus = (row: T, next: boolean) => {
    if (!statusKey) return;
    update.mutate({ id: (row as any).id, [statusKey]: next ? 'active' : 'inactive' });
  };

  const isSystem = (row: T) => !!(systemKey && row[systemKey]);
  const fieldByKey = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, f])),
    [fields],
  );

  const renderCell = (row: T, col: MasterColumn<T>) => {
    if (col.render) return col.render(row);
    const val = row[col.key];
    const fd = fieldByKey[col.key];
    if (fd?.type === 'checkbox' || typeof val === 'boolean') {
      return val
        ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Yes</Badge>
        : <span className="text-muted-foreground">No</span>;
    }
    if (fd?.type === 'multiselect' || Array.isArray(val)) {
      const arr: any[] = Array.isArray(val) ? val : [];
      if (!arr.length) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((v) => (
            <Badge key={String(v)} variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
              {fd?.options?.find((o) => o.value === v)?.label ?? String(v)}
            </Badge>
          ))}
        </div>
      );
    }
    if (fd?.type === 'select') {
      const label = fd.options?.find((o) => o.value === val)?.label;
      return label ?? (val ? <span className="capitalize">{String(val).replace(/_/g, ' ')}</span> : <span className="text-muted-foreground">—</span>);
    }
    if (val === null || val === undefined || val === '') return <span className="text-muted-foreground">—</span>;
    return String(val);
  };

  const body = (
    <div className="space-y-3">
      {(searchable || canWrite || toolbar) && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            {searchable && (
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${title.toLowerCase()}…`}
                  className="pl-9 h-9"
                />
              </div>
            )}
            {toolbar}
          </div>
          {canWrite && (
            <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />Add {name}
            </Button>
          )}
        </div>
      )}

      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && filtered.length === 0}
        emptyMessage={emptyMessage || `No ${title.toLowerCase()} yet`}
        onRetry={() => refetch()}
      >
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.className}>{c.label}</TableHead>
                ))}
                {statusKey && <TableHead>Status</TableHead>}
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={(row as any).id ?? String(row[labelKey])}>
                  {columns.map((c, i) => (
                    <TableCell key={c.key} className={cn(i === 0 && 'font-medium', c.className)}>
                      {renderCell(row, c)}
                    </TableCell>
                  ))}
                  {statusKey && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={(row[statusKey] ?? 'active') === 'active'}
                          onCheckedChange={(v) => toggleStatus(row, v)}
                          disabled={!canWrite || update.isPending}
                        />
                        <span className={cn('text-xs',
                          (row[statusKey] ?? 'active') === 'active' ? 'text-success' : 'text-muted-foreground')}>
                          {(row[statusKey] ?? 'active') === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                  )}
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isSystem(row) ? (
                          <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground" title="System record — cannot be deleted">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => setConfirm({ open: true, row })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataState>

      {/* Add / Edit dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false, row: null })}>
        <DialogContent className={dialogClassName}>
          <DialogHeader>
            <DialogTitle>{dialog.row ? `Edit ${name}` : `Add ${name}`}</DialogTitle>
            <DialogDescription>
              {description || `Configure ${title.toLowerCase()} for your organization.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
              {fields.map((fd) => (
                <div
                  key={fd.key}
                  className={cn('space-y-1.5', (fd.colSpan === 2 || fd.type === 'multiselect') && 'sm:col-span-2')}
                >
                  <Label className="text-sm">
                    {fd.label}{fd.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <FieldInput
                    def={fd}
                    value={form[fd.key]}
                    disabled={!!(fd.immutable && dialog.row) || !!(dialog.row && isSystem(dialog.row) && fd.immutable)}
                    onChange={(v) => setValue(fd.key, v)}
                  />
                  {fd.hint && <p className="text-xs text-muted-foreground">{fd.hint}</p>}
                </div>
              ))}
              {statusKey && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Status</Label>
                  <Select value={form[statusKey] ?? 'active'} onValueChange={(v) => setValue(statusKey, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialog({ open: false, row: null })}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending} className="gap-2">
                {(create.isPending || update.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {dialog.row ? `Save ${name}` : `Create ${name}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(o) => !o && setConfirm({ open: false, row: null })}
        title={`Remove ${name.toLowerCase()}?`}
        description={`"${confirm.row?.[labelKey] ?? ''}" will be deactivated and hidden from selection lists. Existing records that reference it are not affected.`}
        confirmText="Remove"
        variant="destructive"
        isLoading={remove.isPending}
        onConfirm={() =>
          remove.mutate((confirm.row as any)?.id, { onSuccess: () => setConfirm({ open: false, row: null }) })
        }
      />
    </div>
  );

  if (bare) return body;

  return (
    <div className="wms-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Separator />
      {body}
    </div>
  );
}

// ─── Field renderer ──────────────────────────────────────────────────────────

function FieldInput({ def, value, onChange, disabled }: {
  def: MasterFieldDef; value: any; onChange: (v: any) => void; disabled?: boolean;
}) {
  switch (def.type) {
    case 'number':
      return (
        <Input
          type="number" value={value ?? ''} disabled={disabled}
          min={def.min} max={def.max} step={def.step ?? 'any'}
          placeholder={def.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'time':
      return (
        <Input type="time" value={value ?? ''} disabled={disabled}
          onChange={(e) => onChange(e.target.value)} />
      );
    case 'select':
      return (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder={def.placeholder || 'Select…'} /></SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'checkbox':
      return (
        <div className="flex items-center gap-2 h-10">
          <Checkbox checked={!!value} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} />
          <span className="text-sm text-muted-foreground">{def.placeholder || 'Yes'}</span>
        </div>
      );
    case 'multiselect': {
      const selected: string[] = Array.isArray(value) ? value : [];
      const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
      return (
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value} type="button" disabled={disabled} onClick={() => toggle(o.value)}
                className={cn(
                  'px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
                  on ? 'bg-primary text-primary-foreground border-primary'
                     : 'bg-background text-muted-foreground hover:border-primary/40',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <Input value={value ?? ''} disabled={disabled} placeholder={def.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      );
  }
}
