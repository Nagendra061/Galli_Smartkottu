import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { customerApi } from '../../services/customerApi';

export function CustomerKhataPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: storeData } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const storeId = storeData?.store.id;
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_KHATA(slug),
    queryFn: () => customerApi.getKhata(storeId!),
    enabled: Boolean(user?.role === 'customer' && storeId),
  });

  if (user?.role !== 'customer') {
    return (
      <EmptyState
        icon={<BookOpen className="h-8 w-8" />}
        title="Sign in to view your Khata statement"
        description="Sign in with the phone number linked to your store Khata account."
        action={
          <Button onClick={() => navigate(ROUTES.STORE_ACCOUNT.replace(':slug', slug))}>
            Sign In
          </Button>
        }
      />
    );
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (!data) {
    return (
      <EmptyState
        icon={<BookOpen className="h-8 w-8" />}
        title="No Khata account at this store"
        description="Ask the store owner to enable Khata credit for your phone number."
        action={
          <Button variant="secondary" onClick={() => navigate(ROUTES.STORE_HOME.replace(':slug', slug))}>
            Back to Store
          </Button>
        }
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(ROUTES.STORE_ACCOUNT.replace(':slug', slug))}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Account
      </Button>

      <PageHeader title="My Store Khata" subtitle={storeData?.store.name} />

      <Card padding="md" className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-ink-muted">Credit Limit</div>
          <PriceText amountPaise={data.account.creditLimitPaise} className="text-sm font-semibold" />
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted">Current Balance Due</div>
          <PriceText amountPaise={data.account.balancePaise} className="text-xl font-bold text-ink-primary" />
        </div>
      </Card>

      <div className="space-y-2">
        {data.entries.map((e) => (
          <Card key={e.id} padding="sm" className="flex items-center justify-between gap-2 text-sm">
            <div>
              <div className="flex items-center gap-2">
                <StatusChip
                  kind="custom"
                  code={e.entryType}
                  overrideLabel={e.entryType === 'debit' ? 'PURCHASE' : 'PAYMENT'}
                  overrideTone={e.entryType === 'debit' ? 'danger' : 'success'}
                />
                <span className="text-xs text-ink-secondary">{e.note || e.orderNumber || ''}</span>
              </div>
              <DateTimeText iso={e.createdAt} className="text-xs text-ink-muted" />
            </div>
            <div className="text-right">
              <PriceText amountPaise={e.amountPaise} className="font-semibold" />
              <div className="text-[11px] text-ink-muted">
                Bal <PriceText amountPaise={e.balanceAfterPaise} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
