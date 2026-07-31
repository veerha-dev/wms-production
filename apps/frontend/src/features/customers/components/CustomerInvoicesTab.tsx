import { FileText } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { DataState } from '@/shared/components/ui/data-state';
import { useCustomerInvoices } from '../hooks/useCustomers';
import { formatCurrency } from '../types';

/**
 * Invoices tab — outstanding total up top, because this is the number the
 * credit-limit check reads from (spec §5).
 */
export function CustomerInvoicesTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error, refetch } = useCustomerInvoices(customerId);
  const invoices = data?.data ?? [];
  const outstandingTotal = data?.meta?.outstandingTotal;

  return (
    <div className="space-y-4">
      <div className="wms-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
          <p className="text-2xl font-bold">
            {outstandingTotal != null ? formatCurrency(outstandingTotal) : '—'}
          </p>
        </div>
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>

      <DataState
        isLoading={isLoading}
        error={error as Error | null}
        isEmpty={!isLoading && invoices.length === 0}
        emptyMessage="No invoices raised for this customer yet."
        emptyIcon={<FileText className="h-8 w-8 text-muted-foreground mb-3" />}
        onRetry={() => refetch()}
      >
        <div className="wms-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice: any) => {
                const status = String(invoice.status || invoice.paymentStatus || '').toLowerCase();
                const isPaid = status === 'paid';
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber || invoice.invoice_number || '-'}
                    </TableCell>
                    <TableCell>
                      {invoice.invoiceDate || invoice.invoice_date
                        ? new Date(invoice.invoiceDate || invoice.invoice_date).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {invoice.dueDate || invoice.due_date
                        ? new Date(invoice.dueDate || invoice.due_date).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isPaid ? 'default' : 'destructive'}>
                        {status ? status.replace(/_/g, ' ') : 'unpaid'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.totalAmount ?? invoice.total_amount ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        invoice.balanceDue ??
                          invoice.balance_due ??
                          (isPaid ? 0 : (invoice.totalAmount ?? invoice.total_amount ?? 0))
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DataState>
    </div>
  );
}

export default CustomerInvoicesTab;
