import { useEffect, useState } from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { toast } from 'sonner';
import { useUpdateCustomer } from '../hooks/useCustomers';
import type { Customer } from '../types';

/** Notes tab — internal notes only, never shown to the customer (spec §5). */
export function CustomerNotesTab({ customer }: { customer: Customer }) {
  const [notes, setNotes] = useState(customer.notes || '');
  const updateCustomer = useUpdateCustomer();

  useEffect(() => {
    setNotes(customer.notes || '');
  }, [customer.id, customer.notes]);

  const isDirty = (customer.notes || '') !== notes;

  const handleSave = async () => {
    try {
      await updateCustomer.mutateAsync({ id: customer.id, notes: notes || null } as any);
      toast.success('Notes saved');
    } catch {
      // mutation surfaces the error toast
    }
  };

  return (
    <div className="wms-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StickyNote className="h-4 w-4" />
        Internal notes — e.g. “prefers morning deliveries”, “always negotiates rates”.
      </div>
      <Textarea
        rows={10}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add anything the team should know about this customer…"
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setNotes(customer.notes || '')}
          disabled={!isDirty || updateCustomer.isPending}
        >
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!isDirty || updateCustomer.isPending}>
          {updateCustomer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Notes
        </Button>
      </div>
    </div>
  );
}

export default CustomerNotesTab;
