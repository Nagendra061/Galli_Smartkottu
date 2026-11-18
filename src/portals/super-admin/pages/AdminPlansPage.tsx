import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { ErrorState, Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../shared/components/forms/MoneyInput';
import { Select } from '../../../shared/components/forms/Select';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { adminApi } from '../services/adminApi';

export function AdminPlansPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    tagline: '',
    maxProducts: 500,
    maxStaff: 5,
    maxMonthlyOrders: 2000,
    pricePaise: 29900,
    billingCycle: 'monthly' as 'monthly' | 'yearly',
  });

  const { data: plans, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_PLANS,
    queryFn: adminApi.listPlans,
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createPlan(form),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Plan created' });
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_PLANS });
    },
    onError: (err) => showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed' }),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Error'} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscription Plans"
        subtitle="Manage plan limits for products, staff, and monthly orders (manual assignment in v1)."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(plans || []).map((p) => (
          <Card key={p.id} padding="lg" className="space-y-3">
            <div>
              <h2 className="font-display text-lg font-bold text-ink-primary">{p.name}</h2>
              <p className="text-xs text-ink-secondary">{p.tagline}</p>
            </div>
            <div className="text-2xl font-bold text-ink-primary">
              <PriceText amountPaise={p.pricePaise} />
              <span className="text-xs font-normal text-ink-muted"> / {p.billingCycle}</span>
            </div>
            <ul className="text-xs text-ink-secondary space-y-1.5 border-t border-border-default pt-3">
              <li>Up to {p.maxProducts} products</li>
              <li>Up to {p.maxStaff} staff accounts</li>
              <li>Up to {p.maxMonthlyOrders} monthly orders</li>
            </ul>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Subscription Plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Save Plan
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Plan Name" required>
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Tagline" required>
            <TextInput value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Max Products">
              <TextInput
                type="number"
                value={form.maxProducts}
                onChange={(e) => setForm({ ...form, maxProducts: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="Max Staff">
              <TextInput
                type="number"
                value={form.maxStaff}
                onChange={(e) => setForm({ ...form, maxStaff: Number(e.target.value) })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Price">
              <MoneyInput valuePaise={form.pricePaise} onChangePaise={(v) => setForm({ ...form, pricePaise: v })} />
            </FormField>
            <FormField label="Billing Cycle">
              <Select
                value={form.billingCycle}
                onChange={(e) => setForm({ ...form, billingCycle: e.target.value as 'monthly' | 'yearly' })}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
