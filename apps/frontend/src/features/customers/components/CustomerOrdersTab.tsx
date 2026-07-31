import { ShoppingCart } from 'lucide-react';
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
import { useCustomerOrders } from '../hooks/useCustomers';
import { formatCurrency } from '../types';

/** Orders tab — every sales order placed by this customer (spec §5). */
export function CustomerOrdersTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error, refetch } = useCustomerOrders(customerId);
  const orders = data?.data ?? [];

  return (
    <DataState
      isLoading={isLoading}
      error={error as Error | null}
      isEmpty={!isLoading && orders.length === 0}
      emptyMessage="This customer has not placed any orders yet."
      emptyIcon={<ShoppingCart className="h-8 w-8 text-muted-foreground mb-3" />}
      onRetry={() => refetch()}
    >
      <div className="wms-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order Number</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order: any) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  {order.orderNumber || order.soNumber || order.order_number || '-'}
                </TableCell>
                <TableCell>
                  {order.orderDate || order.order_date
                    ? new Date(order.orderDate || order.order_date).toLocaleDateString()
                    : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={order.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {String(order.status || '').replace(/_/g, ' ') || '-'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {order._count?.items ?? order.items?.length ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(order.totalAmount ?? order.total_value ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DataState>
  );
}

export default CustomerOrdersTab;
