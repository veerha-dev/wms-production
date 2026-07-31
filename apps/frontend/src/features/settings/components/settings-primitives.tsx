import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Save, Loader2 } from 'lucide-react';

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ToggleRow({ label, description, checked, onCheckedChange, disabled }: {
  label: string; description: string; checked: boolean;
  onCheckedChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function SaveBar({ onSave, isPending, label = 'Save Changes' }: {
  onSave: () => void; isPending: boolean; label?: string;
}) {
  return (
    <div className="flex justify-end pt-2">
      <Button onClick={onSave} disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {label}
      </Button>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}
