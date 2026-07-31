import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Badge } from '@/shared/components/ui/badge';
import { useCustomers } from '@/features/customers/hooks/useCustomers';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { usePurchaseOrders } from '@/features/inbound/hooks/usePurchaseOrders';
import { useSalesOrders } from '@/features/outbound/hooks/useSalesOrders';
import { useGRNs } from '@/features/inbound/hooks/useGRN';
import { useShipments } from '@/features/outbound/hooks/useShipments';
import { useWarehouses } from '@/features/warehouse/hooks/useWarehouses';

interface LineItem {
  itemType: string;
  skuCode: string;
  skuName: string;
  hsnCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
}

interface InvoiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isLoading?: boolean;
  defaultWarehouseId?: string;
  isManager?: boolean;
}

const emptyItem = (): LineItem => ({
  itemType: 'product', skuCode: '', skuName: '', hsnCode: '', description: '',
  quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 18,
});

export function InvoiceForm({ open, onOpenChange, onSubmit, isLoading, defaultWarehouseId, isManager }: InvoiceFormProps) {
  const [type, setType] = useState<string>('sales');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [soId, setSoId] = useState('');
  const [poId, setPoId] = useState('');
  const [grnId, setGrnId] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [gstType, setGstType] = useState('intra-state');
  const [billingStart, setBillingStart] = useState('');
  const [billingEnd, setBillingEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);

  // This dialog stays mounted while closed, and /api/v1/customers is
  // admin/manager-only — an ungated fetch 403s for every worker on /invoices.
  const { canAccess } = usePermissions();
  const { data: customersData } = useCustomers(undefined, {
    enabled: open && canAccess('Customers', 'view'),
  });
  const { data: suppliersData } = useSuppliers();
  const { data: posData } = usePurchaseOrders();
  const { data: sosData } = useSalesOrders();
  const { data: grnsData } = useGRNs();
  const { data: shipmentsData } = useShipments();
  const { data: warehouses } = useWarehouses();

  const customers = customersData?.data || customersData || [];
  const suppliers = suppliersData?.data || suppliersData || [];
  const pos = posData?.data || posData || [];
  const sos = sosData?.data || sosData || [];
  const grns = grnsData?.data || grnsData || [];
  const shipments = shipmentsData?.data || shipmentsData || [];

  // GST calculation
  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, cgst = 0, sgst = 0, igst = 0;
    items.forEach(item => {
      const lineSub = item.quantity * item.unitPrice;
      const lineDisc = lineSub * (item.discountPercent / 100);
      const taxable = lineSub - lineDisc;
      subtotal += lineSub;
      discount += lineDisc;
      if (gstType === 'inter-state') {
        igst += taxable * (item.taxRate / 100);
      } else {
        cgst += taxable * (item.taxRate / 2 / 100);
        sgst += taxable * (item.taxRate / 2 / 100);
      }
    });
    const tax = cgst + sgst + igst;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      cgst: Math.round(cgst * 100) / 100,
      sgst: Math.round(sgst * 100) / 100,
      igst: Math.round(igst * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((subtotal - discount + tax) * 100) / 100,
    };
  }, [items, gstType]);

  const resetForm = () => {
    setType('sales'); setCustomerId(''); setSupplierId('');
    setSoId(''); setPoId(''); setGrnId(''); setShipmentId('');
    setWarehouseId(defaultWarehouseId || '');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentTerms(30); setGstType('intra-state');
    setBillingStart(''); setBillingEnd('');
    setNotes(''); setItems([emptyItem()]);
  };

  useEffect(() => {
    if (type === 'service') {
      setItems([
        { ...emptyItem(), description: 'Storage Charges', itemType: 'service' },
        { ...emptyItem(), description: 'Handling Charges', itemType: 'service' },
        { ...emptyItem(), description: 'Value-Added Services', itemType: 'service' },
      ]);
    }
  }, [type]);

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    if (items.length === 0 || items.every(i => i.quantity === 0 && i.unitPrice === 0)) {
      return;
    }
    onSubmit({
      type,
      customerId: customerId || undefined,
      supplierId: supplierId || undefined,
      soId: soId || undefined,
      poId: poId || undefined,
      grnId: grnId || undefined,
      shipmentId: shipmentId || undefined,
      warehouseId: warehouseId || undefined,
      invoiceDate,
      paymentTerms,
      gstType,
      billingPeriodStart: type === 'service' ? billingStart : undefined,
      billingPeriodEnd: type === 'service' ? billingEnd : undefined,
      notes: notes || undefined,
      items: items.map(i => ({
        itemType: i.itemType,
        skuCode: i.skuCode || undefined,
        skuName: i.skuName || undefined,
        hsnCode: i.hsnCode || undefined,
        description: i.description || undefined,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPercent: i.discountPercent,
        taxRate: i.taxRate,
      })),
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Invoice</DialogTitle>
          <DialogDescription>Select invoice type and fill in the details. GST is auto-calculated.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type Selector */}
          <div className="flex gap-2 border rounded-lg p-1 bg-muted/30">
            {['purchase', 'sales', 'service'].map(t => (
              <Button key={t} variant={type === t ? 'default' : 'ghost'} size="sm" className="flex-1 capitalize" onClick={() => setType(t)}>
                {t === 'purchase' ? 'Purchase' : t === 'sales' ? 'Sales' : 'Service'} Invoice
              </Button>
            ))}
          </div>

          {/* Type-specific fields */}
          <div className="grid grid-cols-2 gap-4">
            {type === 'purchase' && (
              <>
                <div className="space-y-1.5">
                  <Label>Supplier</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(suppliers) ? suppliers : []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linked PO</Label>
                  <Select value={poId} onValueChange={setPoId}>
                    <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(pos) ? pos : []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.poNumber || p.po_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linked GRN</Label>
                  <Select value={grnId} onValueChange={setGrnId}>
                    <SelectTrigger><SelectValue placeholder="Select GRN" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(grns) ? grns : []).map((g: any) => (
                        <SelectItem key={g.id} value={g.id}>{g.grnNumber || g.grn_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {(type === 'sales' || type === 'service') && (
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(customers) ? customers : []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {type === 'sales' && (
              <>
                <div className="space-y-1.5">
                  <Label>Linked SO</Label>
                  <Select value={soId} onValueChange={setSoId}>
                    <SelectTrigger><SelectValue placeholder="Select SO" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(sos) ? sos : []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.soNumber || s.so_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linked Shipment</Label>
                  <Select value={shipmentId} onValueChange={setShipmentId}>
                    <SelectTrigger><SelectValue placeholder="Select shipment" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(shipments) ? shipments : []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.shipmentNumber || s.shipment_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {type === 'service' && (
              <>
                <div className="space-y-1.5">
                  <Label>Billing Period Start</Label>
                  <Input type="date" value={billingStart} onChange={e => setBillingStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Billing Period End</Label>
                  <Input type="date" value={billingEnd} onChange={e => setBillingEnd(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* Invoice metadata */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Select value={String(paymentTerms)} onValueChange={v => setPaymentTerms(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="45">45 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GST Type</Label>
              <Select value={gstType} onValueChange={setGstType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intra-state">Intra-State (CGST+SGST)</SelectItem>
                  <SelectItem value="inter-state">Inter-State (IGST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isManager && !!defaultWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(warehouses || []).map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Line Items</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add Item</Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {type === 'service' ? (
                      <th className="px-2 py-2 text-left font-medium">Description</th>
                    ) : (
                      <>
                        <th className="px-2 py-2 text-left font-medium">SKU Code</th>
                        <th className="px-2 py-2 text-left font-medium">Name</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-left font-medium">HSN</th>
                    <th className="px-2 py-2 text-left font-medium w-16">Qty</th>
                    <th className="px-2 py-2 text-left font-medium w-20">Price</th>
                    <th className="px-2 py-2 text-left font-medium w-16">Disc%</th>
                    <th className="px-2 py-2 text-left font-medium w-16">GST%</th>
                    <th className="px-2 py-2 text-right font-medium w-20">Total</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const lineSub = item.quantity * item.unitPrice;
                    const lineDisc = lineSub * (item.discountPercent / 100);
                    const taxable = lineSub - lineDisc;
                    const lineTax = gstType === 'inter-state' ? taxable * (item.taxRate / 100) : taxable * (item.taxRate / 100);
                    const lineTotal = taxable + lineTax;
                    return (
                      <tr key={idx} className="border-t">
                        {type === 'service' ? (
                          <td className="px-1 py-1"><Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="h-7 text-xs" placeholder="Description" /></td>
                        ) : (
                          <>
                            <td className="px-1 py-1"><Input value={item.skuCode} onChange={e => updateItem(idx, 'skuCode', e.target.value)} className="h-7 text-xs" placeholder="Code" /></td>
                            <td className="px-1 py-1"><Input value={item.skuName} onChange={e => updateItem(idx, 'skuName', e.target.value)} className="h-7 text-xs" placeholder="Name" /></td>
                          </>
                        )}
                        <td className="px-1 py-1"><Input value={item.hsnCode} onChange={e => updateItem(idx, 'hsnCode', e.target.value)} className="h-7 text-xs w-16" placeholder="HSN" /></td>
                        <td className="px-1 py-1"><Input type="number" min={0} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-7 text-xs w-16" /></td>
                        <td className="px-1 py-1"><Input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} className="h-7 text-xs w-20" /></td>
                        <td className="px-1 py-1"><Input type="number" min={0} max={100} value={item.discountPercent} onChange={e => updateItem(idx, 'discountPercent', parseFloat(e.target.value) || 0)} className="h-7 text-xs w-16" /></td>
                        <td className="px-1 py-1"><Input type="number" min={0} value={item.taxRate} onChange={e => updateItem(idx, 'taxRate', parseFloat(e.target.value) || 0)} className="h-7 text-xs w-16" /></td>
                        <td className="px-1 py-1 text-right text-xs font-medium">₹{lineTotal.toFixed(2)}</td>
                        <td className="px-1 py-1">
                          {items.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* GST Totals */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-red-600">-₹{totals.discount.toFixed(2)}</span></div>}
            {gstType === 'intra-state' ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">CGST</span><span>₹{totals.cgst.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SGST</span><span>₹{totals.sgst.toFixed(2)}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-muted-foreground">IGST</span><span>₹{totals.igst.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-bold border-t pt-1.5"><span>Grand Total</span><span>₹{totals.total.toFixed(2)}</span></div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>{isLoading ? 'Creating...' : 'Create Invoice'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
