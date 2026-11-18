import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { StatCard } from '../../../shared/components/data-display/StatCard';
import { Alert } from '../../../shared/components/feedback/Alert';
import { Skeleton } from '../../../shared/components/feedback/EmptyState';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { Card } from '../../../shared/components/ui/Card';
import { Switch } from '../../../shared/components/ui/Switch';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { ROUTES } from '../../../shared/config/routes';
import { useAuth } from '../../../shared/hooks/useAuth';
import { smoApi } from '../services/smoApi';

export function SmoHomeStrip() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_HOME,
    queryFn: smoApi.getHome,
  });

  const toggleOpen = useMutation({
    mutationFn: (isOpen: boolean) => smoApi.updateStoreSettings({ isOpen }),
    onSuccess: (updated) => {
      showToast({
        tone: 'success',
        message: updated.isOpen ? 'Store is now Open' : 'Store marked Closed',
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_STORE_SETTINGS });
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-24 w-full mb-4" />;
  }

  const { store, snapshot } = data;

  return (
    <div className="space-y-3 mb-5">
      {store.status === 'suspended' && (
        <Alert tone="danger" title="Store suspended">
          {store.suspensionReason || 'Your store has been suspended by Platform Admin.'}{' '}
          {store.supportContact && `Support: ${store.supportContact}`}
        </Alert>
      )}

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-primary">{store.name}</div>
            <div className="text-xs text-ink-secondary">/store/{store.slug}</div>
          </div>
          {user?.role === 'smo' && (
            <Switch
              label={store.isOpen ? 'Store Open' : 'Store Closed'}
              checked={store.isOpen}
              disabled={toggleOpen.isPending}
              onChange={(next) => toggleOpen.mutate(next)}
            />
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard
            label="Today Sales"
            value={<PriceText amountPaise={snapshot.todaySalesPaise} />}
            subtext={`${snapshot.todayOrderCount} order(s)`}
          />
          <StatCard
            label="Cash / UPI"
            value={
              <span className="text-sm font-semibold">
                <PriceText amountPaise={snapshot.cashTodayPaise} /> / <PriceText amountPaise={snapshot.upiTodayPaise} />
              </span>
            }
          />
          <StatCard
            label="Online Pending"
            value={snapshot.pendingOnline}
            tone={snapshot.pendingOnline > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Verify UPI"
            value={snapshot.awaitingVerification}
            tone={snapshot.awaitingVerification > 0 ? 'warning' : 'default'}
          />
        </div>

        {(snapshot.lowStockCount > 0 ||
          snapshot.nearExpiryCount > 0 ||
          snapshot.khataDuesCount > 0 ||
          snapshot.awaitingVerification > 0) && (
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            {snapshot.awaitingVerification > 0 && (
              <button
                type="button"
                onClick={() => navigate(ROUTES.OWNER_ORDERS_ONLINE)}
                className="px-2.5 py-1.5 rounded-md bg-status-warning-bg text-status-warning-fg font-medium cursor-pointer"
              >
                {snapshot.awaitingVerification} UPI payment(s) to verify
              </button>
            )}
            {snapshot.lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(ROUTES.OWNER_INVENTORY)}
                className="px-2.5 py-1.5 rounded-md bg-status-danger-bg text-status-danger-fg font-medium cursor-pointer"
              >
                {snapshot.lowStockCount} low stock item(s)
              </button>
            )}
            {snapshot.nearExpiryCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(ROUTES.OWNER_FINANCE_PREDICTIONS)}
                className="px-2.5 py-1.5 rounded-md bg-status-warning-bg text-status-warning-fg font-medium cursor-pointer"
              >
                {snapshot.nearExpiryCount} near expiry
              </button>
            )}
            {snapshot.khataDuesCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(ROUTES.OWNER_KHATA)}
                className="px-2.5 py-1.5 rounded-md bg-status-info-bg text-status-info-fg font-medium cursor-pointer"
              >
                {snapshot.khataDuesCount} Khata due(s)
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
