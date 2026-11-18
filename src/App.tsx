import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PortalHubPage } from './app/PortalHubPage';
import { Providers } from './app/Providers';
import { CustomerRoutes } from './portals/customer/routes';
import { SmoLoginPage } from './portals/smo/account/pages/SmoLoginPage';
import { SmoRoutes } from './portals/smo/routes';
import { AdminLoginPage } from './portals/super-admin/pages/AdminLoginPage';
import { SuperAdminRoutes } from './portals/super-admin/routes';
import { NoAccessPage, NotFoundPage } from './shared/components/layout/ErrorPages';
import { ROUTES } from './shared/config/routes';

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route path={ROUTES.HOME} element={<PortalHubPage />} />
          <Route path={ROUTES.ADMIN_LOGIN} element={<AdminLoginPage />} />
          <Route path="/admin/*" element={<SuperAdminRoutes />} />
          <Route path={ROUTES.OWNER_LOGIN} element={<SmoLoginPage />} />
          <Route path="/owner/*" element={<SmoRoutes />} />
          <Route path="/store/:slug/*" element={<CustomerRoutes />} />
          <Route path={ROUTES.NO_ACCESS} element={<NoAccessPage homeRoute={ROUTES.HOME} />} />
          <Route path={ROUTES.NOT_FOUND} element={<NotFoundPage homeRoute={ROUTES.HOME} />} />
          <Route path="*" element={<NotFoundPage homeRoute={ROUTES.HOME} />} />
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
