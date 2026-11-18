import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SessionExpiredModal } from '../shared/components/feedback/SessionExpiredModal';
import { ToastProvider } from '../shared/components/feedback/ToastProvider';
import { AuthProvider } from '../shared/hooks/useAuth';
import { useBootstrapConfig } from '../shared/hooks/useBootstrapConfig';
import { useRealtimeSync } from '../shared/hooks/useRealtime';
import { I18nProvider } from '../shared/i18n/I18nContext';
import { ErrorBoundary } from './ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function BootstrapShell({ children }: { children: React.ReactNode }) {
  const { data } = useBootstrapConfig();
  useRealtimeSync();

  return (
    <I18nProvider overrides={data?.i18nStrings}>
      <ToastProvider>
        {children}
        <SessionExpiredModal />
      </ToastProvider>
    </I18nProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BootstrapShell>{children}</BootstrapShell>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
