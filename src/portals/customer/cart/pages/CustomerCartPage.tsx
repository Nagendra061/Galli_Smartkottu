import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState } from '../../../../shared/components/feedback/EmptyState';
import { NumberStepper } from '../../../../shared/components/forms/NumberStepper';
import { Select } from '../../../../shared/components/forms/Select';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi } from '../../services/customerApi';

export function CustomerCartPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const cart = useCustomerCart(slug);

  const { data } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = data?.store;
  const minOrder = store?.minOrderPaise ?? 0;
  const meetsMin = cart.subtotalPaise >= minOrder;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(ROUTES.STORE_HOME.replace(':slug', slug))}
        >
          <ArrowLeft className="h-4 w-4" /> Continue Shopping
        </Button>
        {cart.items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={cart.clearCart}>
            Clear Cart
          </Button>
        )}
      </div>

      <PageHeader title="Your Cart" subtitle={store ? `Shopping at ${store.name}` : undefined} />

      {cart.items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Your cart is empty"
          description="Browse items in the store and add them to your basket."
          action={
            <Button onClick={() => navigate(ROUTES.STORE_HOME.replace(':slug', slug))}>
              Browse Products
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {cart.items.map((item) => (
              <Card key={item.productId} padding="md" className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-primary">{item.name}</div>
                    <div className="text-xs text-ink-secondary">
                      <PriceText amountPaise={item.unitPricePaise} /> / {item.unitLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => cart.setItemQty(item.productId, 0)}
                    aria-label={`Remove ${item.name}`}
                    className="p-1.5 text-ink-muted hover:text-status-danger-fg cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <NumberStepper
                    value={item.qty}
                    min={0}
                    max={item.maxStock}
                    step={item.allowDecimal ? 0.5 : 1}
                    allowDecimal={item.allowDecimal}
                    onChange={(qty) => cart.setItemQty(item.productId, qty)}
                  />
                  <PriceText
                    amountPaise={Math.round(item.unitPricePaise * item.qty)}
                    className="text-sm font-bold text-ink-primary"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-default text-xs">
                  <span className="text-ink-muted">If unavailable:</span>
                  <div className="w-44">
                    <Select
                      value={item.substitutionPref}
                      onChange={(e) =>
                        cart.setSubstitutionPref(
                          item.productId,
                          e.target.value as 'call_me' | 'replace' | 'remove'
                        )
                      }
                    >
                      <option value="call_me">Call me before replacing</option>
                      <option value="replace">Store may substitute</option>
                      <option value="remove">Remove item</option>
                    </Select>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!meetsMin && minOrder > 0 && (
            <Alert tone="warning" title="Minimum order not reached">
              Add <PriceText amountPaise={minOrder - cart.subtotalPaise} className="font-bold" /> more to reach the{' '}
              <PriceText amountPaise={minOrder} /> minimum order.
            </Alert>
          )}

          <Card padding="md" className="space-y-2 text-sm">
            <div className="flex justify-between text-ink-secondary">
              <span>Items Subtotal</span>
              <PriceText amountPaise={cart.subtotalPaise} />
            </div>
            {cart.savingsPaise > 0 && (
              <div className="flex justify-between text-status-success-fg font-medium">
                <span>Your Savings</span>
                <PriceText amountPaise={cart.savingsPaise} />
              </div>
            )}
            <div className="pt-2">
              <Button
                fullWidth
                size="lg"
                disabled={!meetsMin || !store?.isOpen}
                onClick={() => navigate(ROUTES.STORE_CHECKOUT.replace(':slug', slug))}
              >
                {store && !store.isOpen ? 'Store Currently Closed' : 'Proceed to Checkout'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
