import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { NoAccessPage } from '../shared/components/layout/ErrorPages';
import { Skeleton } from '../shared/components/feedback/EmptyState';
import { ROUTES, STORAGE_KEYS } from '../shared/config/routes';
import { useAuth } from '../shared/hooks/useAuth';
import type { UserRole } from '../shared/types';

export function RequireRole({
  allowed,
  loginRoute,
  homeRoute,
  children,
}: {
  allowed: UserRole[];
  loginRoute: string;
  homeRoute: string;
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!user) {
    sessionStorage.setItem(STORAGE_KEYS.RETURN_TO_PATH, location.pathname + location.search);
    return <Navigate to={loginRoute} replace />;
  }

  if (!allowed.includes(user.role)) {
    return <NoAccessPage homeRoute={homeRoute || ROUTES.HOME} />;
  }

  return <>{children}</>;
}
