import { ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { Button } from '../../../shared/components/ui/Button';
import { ROUTES } from '../../../shared/config/routes';
import { useCustomerCart } from '../hooks/useCustomerCart';

export function CustomerFloatingCartBar({ slug }: { slug: string }) {
  const cart = useCustomerCart(slug);
  const navigate = useNavigate();

  if (cart.items.length === 0) return null;

  return (
    <div
      aria-label="Shopping Cart Bar"
      className="fixed left-3 right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:left-auto md:right-8 md:w-96 z-40 max-w-lg mx-auto pointer-events-auto"
    >
      <Button
        fullWidth
        size="lg"
        onClick={() => navigate(ROUTES.STORE_CART.replace(':slug', slug))}
        className="justify-between shadow-[0_12px_32px_-4px_rgba(15,23,42,0.35)] bg-accent-primary text-ink-inverse hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer font-semibold py-3"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 shrink-0" />
          <span>
            {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} in cart
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-bold">
          <PriceText amountPaise={cart.subtotalPaise} />
          <span className="opacity-90 font-normal">· View Cart →</span>
        </span>
      </Button>
    </div>
  );
}
