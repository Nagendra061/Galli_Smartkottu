import { useQuery } from '@tanstack/react-query';
import { Grid, Home, ShoppingBag, ShoppingCart, User } from 'lucide-react';
import type React from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { NotificationBell } from '../../shared/components/feedback/NotificationBell';
import { AppShell, type NavDestination } from '../../shared/components/layout/AppShell';
import { NotFoundPage } from '../../shared/components/layout/ErrorPages';
import { QUERY_KEYS } from '../../shared/config/queryKeys';
import { ROUTES } from '../../shared/config/routes';
import { useAuth } from '../../shared/hooks/useAuth';
import { useCustomerCart } from './hooks/useCustomerCart';
import { CustomerCartPage } from './cart/pages/CustomerCartPage';
import { CustomerCheckoutPage } from './checkout/pages/CustomerCheckoutPage';
import { CustomerKhataPage } from './khata/pages/CustomerKhataPage';
import { CustomerOrdersPage } from './orders/pages/CustomerOrdersPage';
import { CustomerOrderTrackPage } from './orders/pages/CustomerOrderTrackPage';
import { CustomerAccountPage } from './profile/pages/CustomerAccountPage';
import { CustomerNotificationsPage } from './profile/pages/CustomerNotificationsPage';
import { customerApi } from './services/customerApi';
import { CustomerStorePage } from './store/pages/CustomerStorePage';

export function CustomerRoutes() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const cart = useCustomerCart(slug);

  const { data } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = data?.store;
  const accentStyle = store?.brandColor
    ? ({ '--color-accent-primary': store.brandColor } as React.CSSProperties)
    : undefined;

  const base = `/store/${slug}`;
  const navItems: NavDestination[] = [
    {
      id: 'home',
      label: 'Home',
      to: base,
      icon: <Home className="h-5 w-5" />,
    },
    {
      id: 'categories',
      label: 'Browse',
      to: `${base}/products`,
      matchPrefix: `${base}/products`,
      icon: <Grid className="h-5 w-5" />,
    },
    {
      id: 'orders',
      label: 'Orders',
      to: `${base}/orders`,
      matchPrefix: `${base}/orders`,
      icon: <ShoppingBag className="h-5 w-5" />,
    },
    {
      id: 'account',
      label: 'Account',
      to: `${base}/account`,
      matchPrefix: `${base}/account`,
      icon: <User className="h-5 w-5" />,
    },
  ];

  return (
    <AppShell
      brandTitle={store?.name || 'Storefront'}
      brandLink={base}
      navItems={navItems}
      accentStyle={accentStyle}
      topRight={
        <div className="flex items-center gap-1.5">
          {user?.role === 'customer' && (
            <NotificationBell onClick={() => navigate(ROUTES.STORE_NOTIFICATIONS.replace(':slug', slug))} />
          )}
          <button
            type="button"
            onClick={() => navigate(ROUTES.STORE_CART.replace(':slug', slug))}
            aria-label={`Cart (${cart.items.length} items)`}
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary cursor-pointer"
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.items.length > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-primary text-ink-inverse text-[10px] font-mono font-bold flex items-center justify-center">
                {cart.items.length}
              </span>
            )}
          </button>
        </div>
      }
    >
      <Routes>
        <Route index element={<CustomerStorePage />} />
        <Route path="categories" element={<CustomerStorePage />} />
        <Route path="products" element={<CustomerStorePage />} />
        <Route path="products/:productId" element={<CustomerStorePage />} />
        <Route path="cart" element={<CustomerCartPage />} />
        <Route path="checkout" element={<CustomerCheckoutPage />} />
        <Route path="orders" element={<CustomerOrdersPage />} />
        <Route path="orders/:orderId" element={<CustomerOrderTrackPage />} />
        <Route path="orders/:orderId/success" element={<CustomerOrderTrackPage />} />
        <Route path="account" element={<CustomerAccountPage />} />
        <Route path="khata" element={<CustomerKhataPage />} />
        <Route path="notifications" element={<CustomerNotificationsPage />} />
        <Route path="*" element={<NotFoundPage homeRoute={base} />} />
      </Routes>
    </AppShell>
  );
}
