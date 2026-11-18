import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import type { OrderRecord } from '../../../../shared/types';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi } from '../../services/customerApi';

export function CustomerOrdersPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const cart = useCustomerCart(slug);

  const { data: storeData } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const storeId = storeData?.store.id;
  const { data: orders = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_ORDERS(slug),
    queryFn: () => customerApi.listOrders(storeId),
    enabled: Boolean(user?.role === 'customer' && storeId),
  });

  const handleReorder = (order: OrderRecord) => {
    const productMap = new Map((storeData?.products || []).map((p) => [p.id, p]));
    let added = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      const prod = productMap.get(item.productId);
      if (prod && prod.availableQty > 0) {
        cart.addProduct(prod, false, Math.min(prod.availableQty, item.qty));
        added += 1;
      }
    }
    if (added > 0) {
      showToast({ tone: 'success', message: `${added} item(s) added to cart.` });
      navigate(ROUTES.STORE_CART.replace(':slug', slug));
    } else {
      showToast({ tone: 'warning', message: 'Items from this order are currently unavailable.' });
    }
  };

  if (user?.role !== 'customer') {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-8 w-8" />}
        title="Sign in at checkout to track orders"
        description="Your orders at this store will appear here once you sign in with your phone and PIN."
        action={
          <Button onClick={() => navigate(ROUTES.STORE_ACCOUNT.replace(':slug', slug))}>
            Sign in with Phone & PIN
          </Button>
        }
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader title="My Orders" subtitle={storeData?.store.name} />

      {isLoading ? (
        <Skeleton className="h-44 w-full" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="No orders placed yet"
          description="Browse items in the store and place your first order."
          action={
            <Button onClick={() => navigate(ROUTES.STORE_HOME.replace(':slug', slug))}>
              Start Shopping
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} padding="md" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-ink-primary">
                      {order.orderNumber}
                    </span>
                    <StatusChip kind="order" code={order.statusCode} />
                    <StatusChip kind="payment" code={order.paymentStatus} />
                  </div>
                  <DateTimeText iso={order.createdAt} className="text-xs text-ink-muted" />
                </div>
                <PriceText amountPaise={order.totalPaise} className="text-base font-bold" />
              </div>

              <div className="text-xs text-ink-secondary">
                {order.items.map((i) => `${i.productName} ×${i.qty}`).join(', ')}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() =>
                    navigate(ROUTES.STORE_ORDER_TRACK.replace(':slug', slug).replace(':orderId', order.id))
                  }
                >
                  Track / Pay
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleReorder(order)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Reorder
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
