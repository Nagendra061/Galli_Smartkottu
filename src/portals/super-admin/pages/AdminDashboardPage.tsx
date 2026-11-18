import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { StatCard } from '../../../shared/components/data-display/StatCard';
import { EmptyState, ErrorState, Skeleton } from '../../../shared/components/feedback/EmptyState';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { ResponsiveTable } from '../../../shared/components/layout/ResponsiveTable';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { ROUTES } from '../../../shared/config/routes';
import { adminApi } from '../services/adminApi';

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_DASHBOARD,
    queryFn: adminApi.getDashboard,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error instanceof Error ? error.message : 'Failed to load dashboard.'} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Overview"
        subtitle="Live network summary across onboarded stores and services."
        actions={
          <Button onClick={() => navigate(ROUTES.ADMIN_STORES)}>Onboard Store</Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Stores" value={`${data.activeStores} / ${data.totalStores}`} />
        <StatCard label="Orders Today" value={data.ordersToday} />
        <StatCard label="GMV Today" value={<PriceText amountPaise={data.gmvTodayPaise} />} />
        <StatCard label="QR Scans" value={data.totalQrScans} subtext={`${data.openTickets} open ticket(s)`} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-primary">System Health</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
            <span>API: {data.systemHealth.api}</span>
            <span aria-hidden="true">·</span>
            <span>Database: {data.systemHealth.database}</span>
            <span aria-hidden="true">·</span>
            <span>Automation: {data.systemHealth.automation}</span>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink-primary">Stores on Network</h2>
        {data.topStores.length === 0 ? (
          <EmptyState
            title="No stores onboarded"
            description="Add your first store to start accepting QR orders."
            actionLabel="Go to Stores"
            onAction={() => navigate(ROUTES.ADMIN_STORES)}
          />
        ) : (
          <ResponsiveTable
            rows={data.topStores}
            getKey={(s) => s.id}
            onRowClick={() => navigate(ROUTES.ADMIN_STORES)}
            columns={[
              { key: 'name', header: 'Store', render: (s) => <span className="font-medium">{s.name}</span> },
              { key: 'slug', header: 'Slug', render: (s) => <span className="font-mono text-xs">/store/{s.slug}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (s) => (
                  <StatusChip
                    kind="custom"
                    code={s.status}
                    overrideLabel={s.status}
                    overrideTone={s.status === 'active' ? 'success' : 'danger'}
                  />
                ),
              },
              { key: 'orders', header: 'Orders', align: 'right', render: (s) => <span className="tabular-nums">{s.orderCount}</span> },
              { key: 'gmv', header: 'GMV', align: 'right', render: (s) => <PriceText amountPaise={s.gmvPaise} /> },
            ]}
            renderMobileCard={(s) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-primary">{s.name}</span>
                  <StatusChip
                    kind="custom"
                    code={s.status}
                    overrideLabel={s.status}
                    overrideTone={s.status === 'active' ? 'success' : 'danger'}
                  />
                </div>
                <div className="text-xs text-ink-secondary">
                  /store/{s.slug} · {s.orderCount} orders · <PriceText amountPaise={s.gmvPaise} />
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
