import { useEffect, useState } from 'react';
import { Edit, MapPin, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { DataState } from '@/shared/components/ui/data-state';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  useDeleteCustomerAddress,
} from '../hooks/useCustomers';
import { CustomerAddress, INDIAN_STATES } from '../types';

interface AddressDraft {
  label: string;
  addressType: 'billing' | 'shipping';
  street: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const EMPTY_DRAFT: AddressDraft = {
  label: '',
  addressType: 'shipping',
  street: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

/**
 * Addresses tab — a customer like Raj Traders can have several shops receiving
 * deliveries, so this is a full add/edit/remove list (spec §4, §5).
 */
export function CustomerAddressesTab({ customerId }: { customerId: string }) {
  const { data: addresses = [], isLoading, error, refetch } = useCustomerAddresses(customerId);
  const createAddress = useCreateCustomerAddress();
  const updateAddress = useUpdateCustomerAddress();
  const deleteAddress = useDeleteCustomerAddress();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [removing, setRemoving] = useState<CustomerAddress | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setDraft({
        label: editing.label || '',
        addressType: (editing.addressType as any) || 'shipping',
        street: editing.street || '',
        city: editing.city || '',
        state: editing.state || '',
        pincode: editing.pincode || '',
        isDefault: !!editing.isDefault,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [dialogOpen, editing]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (address: CustomerAddress) => {
    setEditing(address);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft.label.trim() || !draft.street.trim()) {
      toast.error('Label and street are required');
      return;
    }
    try {
      if (editing) {
        await updateAddress.mutateAsync({ customerId, addressId: editing.id, ...draft });
        toast.success('Address updated');
      } else {
        await createAddress.mutateAsync({ customerId, ...draft });
        toast.success('Address added');
      }
      setDialogOpen(false);
      setEditing(null);
    } catch {
      // mutation surfaces the error toast
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await deleteAddress.mutateAsync({ customerId, addressId: removing.id });
      toast.success('Address removed');
      setRemoving(null);
    } catch {
      // mutation surfaces the error toast
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Saved delivery addresses appear in the Sales Order shipping dropdown.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Address
        </Button>
      </div>

      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && addresses.length === 0}
        emptyMessage="No saved addresses yet."
        emptyIcon={<MapPin className="h-8 w-8 text-muted-foreground mb-3" />}
        onRetry={() => refetch()}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <div key={address.id} className="wms-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{address.label || 'Address'}</span>
                    <Badge variant="secondary" className="capitalize">
                      {address.addressType || 'shipping'}
                    </Badge>
                    {address.isDefault && <Badge>Default</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[address.street, address.city, address.state, address.pincode]
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(address)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setRemoving(address)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DataState>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Address' : 'Add Address'}</DialogTitle>
            <DialogDescription>
              Give each location a clear name — e.g. “Chennai Main Shop”.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="address-label">Label *</Label>
              <Input
                id="address-label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Chennai Main Shop"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={draft.addressType}
                onValueChange={(v) => setDraft({ ...draft, addressType: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address-pincode">Pincode</Label>
              <Input
                id="address-pincode"
                maxLength={6}
                value={draft.pincode}
                onChange={(e) => setDraft({ ...draft, pincode: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="address-street">Street *</Label>
              <Input
                id="address-street"
                value={draft.street}
                onChange={(e) => setDraft({ ...draft, street: e.target.value })}
                placeholder="12 Anna Salai"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address-city">City</Label>
              <Input
                id="address-city"
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={draft.state} onValueChange={(v) => setDraft({ ...draft, state: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {INDIAN_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Checkbox
                id="address-default"
                checked={draft.isDefault}
                onCheckedChange={(checked) => setDraft({ ...draft, isDefault: checked === true })}
              />
              <Label htmlFor="address-default" className="font-normal">
                Use as the default address for this customer
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createAddress.isPending || updateAddress.isPending}
            >
              {editing ? 'Save Changes' : 'Add Address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove address?"
        description={`“${removing?.label ?? 'This address'}” will no longer be selectable on sales orders.`}
        confirmText="Remove"
        variant="destructive"
        isLoading={deleteAddress.isPending}
        onConfirm={handleRemove}
      />
    </div>
  );
}

export default CustomerAddressesTab;
