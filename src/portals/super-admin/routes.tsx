import {
  BarChart3,
  Bot,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { RequireRole } from '../../app/RouteGuards';
import { NotificationBell } from '../../shared/components/feedback/NotificationBell';
import { AppShell, type NavDestination } from '../../shared/components/layout/AppShell';
import { NotFoundPage } from '../../shared/components/layout/ErrorPages';
import { BrandLogo } from '../../shared/components/ui/BrandLogo';
import { Button } from '../../shared/components/ui/Button';
import { ROUTES } from '../../shared/config/routes';
import { useAuth } from '../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../shared/hooks/useBootstrapConfig';
import { AdminConfigPage } from './pages/AdminConfigPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import {
  AdminAnalyticsPage,
  AdminAutomationPage,
  AdminCompliancePage,
  AdminUsersPage,
} from './pages/AdminGovernancePage';
import { AdminMasterCataloguePage } from './pages/AdminMasterCataloguePage';
import { AdminNotificationsPage } from './pages/AdminNotificationsPage';
import { AdminPlansPage } from './pages/AdminPlansPage';
import { AdminStoresPage } from './pages/AdminStoresPage';
import { AdminSupportPage } from './pages/AdminSupportPage';

function AdminLayout() {
  const { logout } = useAuth();
  const { data: config } = useBootstrapConfig();
  const navigate = useNavigate();

  const navItems: NavDestination[] = [
    { id: 'dash', label: 'Dashboard', to: ROUTES.ADMIN_ROOT, icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'stores', label: 'Stores', to: ROUTES.ADMIN_STORES, icon: <Store className="h-4 w-4" />, matchPrefix: ROUTES.ADMIN_STORES },
    { id: 'plans', label: 'Plans', to: ROUTES.ADMIN_PLANS, icon: <CreditCard className="h-4 w-4" /> },
    { id: 'catalogue', label: 'Catalogue Master', to: ROUTES.ADMIN_CATALOGUE, icon: <Package className="h-4 w-4" /> },
    { id: 'config', label: 'Platform Config', to: ROUTES.ADMIN_CONFIG, icon: <Settings className="h-4 w-4" /> },
    { id: 'support', label: 'Support Desk', to: ROUTES.ADMIN_SUPPORT, icon: <LifeBuoy className="h-4 w-4" /> },
    { id: 'analytics', label: 'Analytics', to: ROUTES.ADMIN_ANALYTICS, icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'compliance', label: 'Compliance & Audit', to: ROUTES.ADMIN_COMPLIANCE, icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'automation', label: 'Automation', to: ROUTES.ADMIN_AUTOMATION, icon: <Bot className="h-4 w-4" /> },
    { id: 'users', label: 'Admin Users', to: ROUTES.ADMIN_USERS, icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <AppShell
      brandTitle={`${config?.appSettings.appName || 'Galli Smartkottu'} Admin`}
      brandLogo={<BrandLogo size="md" badge="Admin" />}
      brandLink={ROUTES.ADMIN_ROOT}
      navItems={navItems}
      topRight={
        <>
          <NotificationBell onClick={() => navigate(ROUTES.ADMIN_NOTIFICATIONS)} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              logout();
              navigate(ROUTES.ADMIN_LOGIN);
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </>
      }
    >
      <Routes>
        <Route index element={<AdminDashboardPage />} />
        <Route path="stores/*" element={<AdminStoresPage />} />
        <Route path="plans" element={<AdminPlansPage />} />
        <Route path="catalogue" element={<AdminMasterCataloguePage />} />
        <Route path="config" element={<AdminConfigPage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="compliance" element={<AdminCompliancePage />} />
        <Route path="automation" element={<AdminAutomationPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="*" element={<NotFoundPage homeRoute={ROUTES.ADMIN_ROOT} />} />
      </Routes>
    </AppShell>
  );
}

export function SuperAdminRoutes() {
  return (
    <RequireRole allowed={['super_admin']} loginRoute={ROUTES.ADMIN_LOGIN} homeRoute={ROUTES.HOME}>
      <AdminLayout />
    </RequireRole>
  );
}
