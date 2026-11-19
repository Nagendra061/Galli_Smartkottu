import {
  BookOpen,
  Boxes,
  IndianRupee,
  ShoppingBag,
  UserCog,
} from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { RequireRole } from '../../app/RouteGuards';
import { NotificationBell } from '../../shared/components/feedback/NotificationBell';
import { AppShell, type NavDestination } from '../../shared/components/layout/AppShell';
import { BrandLogo } from '../../shared/components/ui/BrandLogo';
import { NotFoundPage } from '../../shared/components/layout/ErrorPages';
import { ROUTES } from '../../shared/config/routes';
import { useAuth } from '../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../shared/hooks/useBootstrapConfig';
import { readOfflinePosQueue } from '../../shared/utils/offlinePosQueue';
import { SmoAccountPage } from './account/pages/SmoAccountPage';
import { SmoNotificationsPage } from './account/pages/SmoNotificationsPage';
import { SmoFinancePage } from './finance/pages/SmoFinancePage';
import { SmoInventoryPage } from './inventory/pages/SmoInventoryPage';
import { SmoKhataDetailPage } from './khata/pages/SmoKhataDetailPage';
import { SmoKhataPage } from './khata/pages/SmoKhataPage';
import { SmoBillViewPage } from './orders/pages/SmoBillViewPage';
import { SmoOnlineOrdersPage } from './orders/pages/SmoOnlineOrdersPage';
import { SmoPosPage } from './orders/pages/SmoPosPage';

function SmoShellLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useBootstrapConfig();

  const isOwner = user?.role === 'smo';

  // Strictly 5 top-level sections per PRD Section 3 (4 for staff since Finance is hidden)
  const navItems: NavDestination[] = [
    {
      id: 'orders',
      label: 'Orders',
      to: ROUTES.OWNER_ORDERS_POS,
      matchPrefix: '/owner/orders',
      icon: <ShoppingBag className="h-5 w-5" />,
    },
    {
      id: 'inventory',
      label: 'Inventory',
      to: ROUTES.OWNER_INVENTORY,
      matchPrefix: '/owner/inventory',
      icon: <Boxes className="h-5 w-5" />,
    },
    ...(isOwner
      ? [
          {
            id: 'finance',
            label: 'Finance',
            to: ROUTES.OWNER_FINANCE,
            matchPrefix: '/owner/finance',
            icon: <IndianRupee className="h-5 w-5" />,
          },
        ]
      : []),
    {
      id: 'khata',
      label: 'Khata Book',
      to: ROUTES.OWNER_KHATA,
      matchPrefix: '/owner/khata',
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      id: 'account',
      label: 'Account',
      to: ROUTES.OWNER_ACCOUNT,
      matchPrefix: '/owner/account',
      icon: <UserCog className="h-5 w-5" />,
    },
  ];

  const offlineQueueCount = readOfflinePosQueue().length;

  return (
    <AppShell
      brandTitle={config?.appSettings.appName || 'Galli Smartkottu'}
      brandLogo={<BrandLogo size="md" />}
      brandLink={ROUTES.OWNER_ORDERS_POS}
      navItems={navItems}
      offlineQueueCount={offlineQueueCount}
      topRight={<NotificationBell onClick={() => navigate(ROUTES.OWNER_NOTIFICATIONS)} />}
    >
      <Routes>
        <Route index element={<Navigate to={ROUTES.OWNER_ORDERS_POS} replace />} />
        <Route path="orders/pos" element={<SmoPosPage />} />
        <Route path="orders/held" element={<SmoPosPage />} />
        <Route path="orders/online" element={<SmoOnlineOrdersPage />} />
        <Route path="orders/:orderId" element={<SmoOnlineOrdersPage />} />
        <Route path="bills/:orderId" element={<SmoBillViewPage />} />

        <Route path="inventory" element={<SmoInventoryPage />} />
        <Route path="inventory/new" element={<SmoInventoryPage />} />
        <Route path="inventory/stock" element={<SmoInventoryPage />} />
        <Route path="inventory/offers" element={<SmoInventoryPage />} />
        <Route path="inventory/suppliers" element={<SmoInventoryPage />} />
        <Route path="inventory/:productId" element={<SmoInventoryPage />} />

        {/* Finance strictly blocked for staff role */}
        <Route
          path="finance/*"
          element={
            <RequireRole allowed={['smo']} loginRoute={ROUTES.OWNER_LOGIN} homeRoute={ROUTES.OWNER_ORDERS_POS}>
              <SmoFinancePage />
            </RequireRole>
          }
        />

        <Route path="khata" element={<SmoKhataPage />} />
        <Route path="khata/:accountId" element={<SmoKhataDetailPage />} />

        <Route path="account/*" element={<SmoAccountPage />} />
        <Route path="notifications" element={<SmoNotificationsPage />} />
        <Route path="*" element={<NotFoundPage homeRoute={ROUTES.OWNER_ORDERS_POS} />} />
      </Routes>
    </AppShell>
  );
}

export function SmoRoutes() {
  return (
    <RequireRole allowed={['smo', 'staff']} loginRoute={ROUTES.OWNER_LOGIN} homeRoute={ROUTES.HOME}>
      <SmoShellLayout />
    </RequireRole>
  );
}
