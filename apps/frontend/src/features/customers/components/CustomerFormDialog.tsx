import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Separator } from '@/shared/components/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/AuthContext';
import {
  useCreateCustomer,
  useUpdateCustomer,
  useCreateCustomerAddress,
  useCustomerStats,
} from '../hooks/useCustomers';
import {
  Customer,
  GSTIN_REGEX,
  PAN_REGEX,
  PAYMENT_TERMS_OPTIONS,
  INDIAN_STATES,
  isValidGstin,
  stateFromGSTIN,
  unknownGstStateCodeMessage,
} from '../types';

const customerFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Customer name is required'),
    code: z.string().trim().optional().or(z.literal('')),
    customerType: z.enum(['b2b', 'b2c']),
    contactPerson: z.string().trim().optional().or(z.literal('')),
    phone: z.string().trim().min(6, 'Phone number is required'),
    whatsappNumber: z.string().trim().optional().or(z.literal('')),
    email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),

    gstNumber: z.string().trim().optional().or(z.literal('')),
    panNumber: z.string().trim().optional().or(z.literal('')),

    addressLine1: z.string().trim().optional().or(z.literal('')),
    city: z.string().trim().optional().or(z.literal('')),
    state: z.string().trim().optional().or(z.literal('')),
    postalCode: z.string().trim().optional().or(z.literal('')),
    country: z.string().trim().optional().or(z.literal('')),

    sameAsBilling: z.boolean().optional(),
    shippingLabel: z.string().trim().optional().or(z.literal('')),
    shippingStreet: z.string().trim().optional().or(z.literal('')),
    shippingCity: z.string().trim().optional().or(z.literal('')),
    shippingState: z.string().trim().optional().or(z.literal('')),
    shippingPincode: z.string().trim().optional().or(z.literal('')),

    paymentTerms: z.enum(['immediate', 'net_15', 'net_30', 'net_45', 'net_60']),
    creditLimit: z.string().trim().optional().or(z.literal('')),
    status: z.enum(['active', 'inactive']),
    notes: z.string().trim().optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    if (values.customerType === 'b2b') {
      if (!values.gstNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstNumber'],
          message: 'GSTIN is required for B2B customers',
        });
      } else if (values.gstNumber.length !== 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstNumber'],
          message: 'GSTIN must be exactly 15 characters',
        });
      } else if (!GSTIN_REGEX.test(values.gstNumber.toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstNumber'],
          message: 'GSTIN format looks invalid (e.g. 33ABCDE1234F1Z5)',
        });
      } else if (!isValidGstin(values.gstNumber)) {
        // Right shape, but a state code that was never issued. Without this the
        // customer saves with state: null and every invoice picks the wrong
        // CGST+SGST / IGST split — and the backend rejects it anyway, so the
        // user would only find out from an opaque server error.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['gstNumber'],
          message: unknownGstStateCodeMessage(values.gstNumber),
        });
      }
    }
    if (values.panNumber && !PAN_REGEX.test(values.panNumber.toUpperCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['panNumber'],
        message: 'PAN must look like ABCDE1234F',
      });
    }
    if (values.creditLimit) {
      const amount = Number(values.creditLimit);
      if (Number.isNaN(amount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['creditLimit'],
          message: 'Credit limit must be a number',
        });
      } else if (amount < 0) {
        // The CSV importer already rejects negatives ("Must be a positive
        // amount"); before this the form relied only on the input's min="0",
        // so the two entry points disagreed.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['creditLimit'],
          message: 'Credit limit cannot be negative',
        });
      }
    }
  });

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

const EMPTY_VALUES: CustomerFormValues = {
  name: '',
  code: '',
  customerType: 'b2b',
  contactPerson: '',
  phone: '',
  whatsappNumber: '',
  email: '',
  gstNumber: '',
  panNumber: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  sameAsBilling: true,
  shippingLabel: '',
  shippingStreet: '',
  shippingCity: '',
  shippingState: '',
  shippingPincode: '',
  paymentTerms: 'net_30',
  creditLimit: '',
  status: 'active',
  notes: '',
};

export interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present => edit mode. Absent => create mode. */
  customer?: Customer | null;
  /** `quick` renders only name / phone / type / GSTIN — used from the Sales Order form. */
  mode?: 'full' | 'quick';
  onSuccess?: (customer: Customer) => void;
}

/**
 * ONE dialog used for create AND edit (and a compact quick-create mode).
 * Deliberately not duplicated per action — see SuppliersPage for the pattern
 * this replaces.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  mode = 'full',
  onSuccess,
}: CustomerFormDialogProps) {
  const isEdit = !!customer?.id;
  const isQuick = mode === 'quick';
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const createAddress = useCreateCustomerAddress();
  const { data: stats } = useCustomerStats();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  const customerType = form.watch('customerType');
  const sameAsBilling = form.watch('sameAsBilling');

  /**
   * Auto-generated code suggestion (spec §4: auto-generated, editable).
   * Derived from the customer count so it reads CUST-001, CUST-002, ...
   */
  const suggestedCode = useMemo(() => {
    const next = (stats?.total ?? 0) + 1;
    return `CUST-${String(next).padStart(3, '0')}`;
  }, [stats?.total]);

  useEffect(() => {
    if (!open) return;
    if (customer) {
      form.reset({
        ...EMPTY_VALUES,
        name: customer.name || '',
        code: customer.code || '',
        customerType: (customer.customerType as any) || 'b2b',
        contactPerson: customer.contactPerson || '',
        phone: customer.phone || '',
        whatsappNumber: customer.whatsappNumber || '',
        email: customer.email || '',
        gstNumber: customer.gstNumber || '',
        panNumber: customer.panNumber || '',
        addressLine1: customer.addressLine1 || '',
        city: customer.city || '',
        state: customer.state || '',
        postalCode: customer.postalCode || '',
        country: customer.country || 'India',
        paymentTerms: (customer.paymentTerms as any) || 'net_30',
        creditLimit: customer.creditLimit != null ? String(customer.creditLimit) : '',
        status: (customer.status as any) || 'active',
        notes: customer.notes || '',
      });
    } else {
      form.reset({ ...EMPTY_VALUES, code: suggestedCode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer, suggestedCode]);

  /** State auto-extracted from the GSTIN's first two digits, live as you type. */
  const handleGstinChange = (raw: string) => {
    const value = raw.toUpperCase().slice(0, 15);
    form.setValue('gstNumber', value, { shouldValidate: false });
    const derived = stateFromGSTIN(value);
    if (derived) {
      form.setValue('state', derived, { shouldValidate: false });
    }
  };

  const buildPayload = (values: CustomerFormValues): Partial<Customer> => {
    const isB2B = values.customerType === 'b2b';
    const payload: Record<string, any> = {
      name: values.name,
      code: values.code || undefined,
      customerType: values.customerType,
      contactPerson: values.contactPerson || null,
      phone: values.phone,
      whatsappNumber: values.whatsappNumber || null,
      email: values.email || null,
      gstNumber: isB2B ? values.gstNumber?.toUpperCase() || null : null,
      panNumber: isB2B ? values.panNumber?.toUpperCase() || null : null,
      status: values.status,
    };

    if (!isQuick) {
      payload.addressLine1 = values.addressLine1 || null;
      payload.city = values.city || null;
      payload.state = values.state || null;
      payload.postalCode = values.postalCode || null;
      payload.country = values.country || 'India';
      payload.paymentTerms = values.paymentTerms;
      payload.notes = values.notes || null;
      // Credit limit is admin-only (spec §7) — never send it otherwise, so a
      // manager saving a customer cannot silently clear or change the value.
      if (isAdmin) {
        payload.creditLimit = values.creditLimit ? Number(values.creditLimit) : null;
      }
    } else {
      payload.state = isB2B ? stateFromGSTIN(values.gstNumber) : null;
      payload.paymentTerms = values.paymentTerms;
    }

    return payload as Partial<Customer>;
  };

  const handleSubmit = async (values: CustomerFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = buildPayload(values);
      let saved: Customer;

      if (isEdit && customer) {
        saved = await updateCustomer.mutateAsync({ id: customer.id, ...payload });
        toast.success('Customer updated');
      } else {
        saved = await createCustomer.mutateAsync(payload);
        toast.success('Customer created');

        // A distinct shipping address only makes sense on create; afterwards the
        // customer's Addresses tab owns the full list.
        if (!isQuick && !values.sameAsBilling && values.shippingStreet && saved?.id) {
          try {
            await createAddress.mutateAsync({
              customerId: saved.id,
              label: values.shippingLabel || 'Primary Shipping',
              addressType: 'shipping',
              street: values.shippingStreet,
              city: values.shippingCity || '',
              state: values.shippingState || '',
              pincode: values.shippingPincode || '',
              isDefault: true,
            });
          } catch {
            toast.warning('Customer saved, but the shipping address could not be added.');
          }
        }
      }

      onSuccess?.(saved);
      onOpenChange(false);
    } catch {
      // Toast already surfaced by the mutation's onError handler.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isQuick ? 'max-w-lg' : 'max-w-3xl max-h-[90vh] overflow-y-auto'}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Customer' : isQuick ? 'Quick Add Customer' : 'Create Customer'}
          </DialogTitle>
          <DialogDescription>
            {isQuick
              ? 'Capture the essentials now — you can fill in the rest from the Customers page later.'
              : isEdit
                ? 'Update this customer’s details.'
                : 'Add a customer so orders and invoices can reference a single clean record.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* ---------------- Basic Details ---------------- */}
            <section className="space-y-4">
              {!isQuick && (
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Basic Details
                </h3>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Raj Traders" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isQuick && (
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Code</FormLabel>
                        <FormControl>
                          <Input placeholder={suggestedCode} {...field} />
                        </FormControl>
                        <FormDescription>Auto-generated — edit if you use your own codes.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover">
                          <SelectItem value="b2b">B2B — Business with GSTIN</SelectItem>
                          <SelectItem value="b2c">B2C — Individual consumer</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., +91 98765 43210" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isQuick && (
                  <>
                    <FormField
                      control={form.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Rajesh Kumar" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="whatsappNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Optional" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            {/* Deliberately type="text": type="email" makes the
                                browser abort the submit with its own bubble
                                before zod ever runs, so the inline FormMessage
                                below could never render. inputMode keeps the
                                phone keyboard correct. */}
                            <Input
                              type="text"
                              inputMode="email"
                              autoComplete="email"
                              placeholder="invoices@customer.com"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>Used to send invoices and tracking updates.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            </section>

            {/* ---------------- Tax Details (B2B only) ---------------- */}
            {customerType === 'b2b' && (
              <>
                {!isQuick && <Separator />}
                <section className="space-y-4">
                  {!isQuick && (
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Tax Details
                    </h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="gstNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GSTIN *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="33ABCDE1234F1Z5"
                              maxLength={15}
                              value={field.value || ''}
                              onChange={(e) => handleGstinChange(e.target.value)}
                              onBlur={field.onBlur}
                            />
                          </FormControl>
                          <FormDescription>
                            {(field.value || '').length}/15 characters
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isQuick && (
                      <>
                        <FormField
                          control={form.control}
                          name="panNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>PAN</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="ABCDE1234F"
                                  maxLength={10}
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ''}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Auto-filled from GSTIN" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="bg-popover max-h-64">
                                  {INDIAN_STATES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Derived from the GSTIN state code — drives CGST+SGST vs IGST.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                </section>
              </>
            )}

            {!isQuick && (
              <>
                {/* ---------------- Addresses ---------------- */}
                <Separator />
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Billing Address
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Street</FormLabel>
                          <FormControl>
                            <Input placeholder="12 Anna Salai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Chennai" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {customerType === 'b2c' && (
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-popover max-h-64">
                                {INDIAN_STATES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pincode</FormLabel>
                          <FormControl>
                            <Input placeholder="600002" maxLength={6} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {isEdit ? (
                    <p className="text-sm text-muted-foreground">
                      Shipping addresses are managed on the customer’s{' '}
                      <span className="font-medium">Addresses</span> tab — a customer can have as many
                      as they need.
                    </p>
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="sameAsBilling"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-2 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Shipping address is the same as billing
                            </FormLabel>
                          </FormItem>
                        )}
                      />

                      {!sameAsBilling && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-4">
                          <FormField
                            control={form.control}
                            name="shippingLabel"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Address Label</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g., Chennai Main Shop" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="shippingStreet"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Street</FormLabel>
                                <FormControl>
                                  <Input placeholder="Street address" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="shippingCity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="shippingState"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>State</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select state" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="bg-popover max-h-64">
                                    {INDIAN_STATES.map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {s}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="shippingPincode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pincode</FormLabel>
                                <FormControl>
                                  <Input maxLength={6} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </>
                  )}
                </section>

                {/* ---------------- Commercial ---------------- */}
                <Separator />
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Commercial Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="paymentTerms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Terms</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select terms" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-popover">
                              {PAYMENT_TERMS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Credit Limit is admin-only (spec §7). */}
                    {isAdmin && (
                      <FormField
                        control={form.control}
                        name="creditLimit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Credit Limit (₹)</FormLabel>
                            <FormControl>
                              {/* type="text" for the same reason as Email:
                                  type="number" silently discards non-numeric
                                  input and blocks submit via min="0", so the
                                  schema's messages never reached the user.
                                  The schema now owns both rules. */}
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="100000"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>Leave blank for no limit.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-popover">
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="e.g., prefers morning deliveries" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </section>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerFormDialog;
