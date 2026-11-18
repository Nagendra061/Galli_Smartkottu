import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { StatCard } from '../../../../shared/components/data-display/StatCard';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { PhoneInput } from '../../../../shared/components/forms/PhoneInput';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { smoApi } from '../../services/smoApi';

export function SmoKhataPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimitPaise, setCreditLimitPaise] = useState(500000);
  const [billingCycleDay, setBillingCycleDay] = useState(1);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS,
    queryFn: smoApi.listKhataAccounts,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      smoApi.createKhataAccount({
        customerName: customerName.trim(),
        phone,
        address: address.trim(),
        creditLimitPaise,
        billingCycleDay,
      }),
    onSuccess: () => {
      setModalOpen(false);
      setCustomerName('');
      setPhone('');
      setAddress('');
      showToast({ tone: 'success', message: 'Khata customer created.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to create Khata.' }),
  });

  const stats = useMemo(() => {
    let totalDue = 0;
    let d0_30 = 0;
    let d31_60 = 0;
    let d60Plus = 0;
    for (const a of accounts) {
      totalDue += a.balancePaise;
      if (a.overdueDays > 60) d60Plus += a.balancePaise;
      else if (a.overdueDays > 30) d31_60 += a.balancePaise;
      else d0_30 += a.balancePaise;
    }
    return { totalDue, d0_30, d31_60, d60Plus };
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => a.customerName.toLowerCase().includes(q) || a.phone.includes(q));
  }, [accounts, search]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Khata Book"
        subtitle="Manage customer credit limits, monthly dues, and itemized statements."
        actions={
          user?.role === 'smo' && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Add Khata Customer
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Receivable" value={<PriceText amountPaise={stats.totalDue} />} />
        <StatCard label="0–30 Days" value={<PriceText amountPaise={stats.d0_30} />} />
        <StatCard label="31–60 Days" value={<PriceText amountPaise={stats.d31_60} />} tone="warning" />
        <StatCard label="60+ Days Overdue" value={<PriceText amountPaise={stats.d60Plus} />} tone="danger" />
      </div>

      <div className="w-full sm:w-72">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or phone..." />
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" />}
          title="No Khata customers yet"
          description="Add regular neighbourhood customers to track credit limits and monthly repayments."
          action={
            user?.role === 'smo' && (
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" /> Add Khata Customer
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((acc) => (
            <Card
              key={acc.id}
              padding="md"
              className="flex flex-wrap items-center justify-between gap-3 hover:border-accent-primary transition-colors cursor-pointer"
            >
              <button
                type="button"
                onClick={() => navigate(ROUTES.OWNER_KHATA_DETAIL.replace(':accountId', acc.id))}
                className="flex-1 text-left flex flex-wrap items-center justify-between gap-3 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-primary">{acc.customerName}</span>
                    {acc.status !== 'active' && (
                      <StatusChip
                        kind="custom"
                        code={acc.status}
                        overrideLabel={acc.status.toUpperCase()}
                        overrideTone={acc.status === 'frozen' ? 'warning' : 'neutral'}
                      />
                    )}
                    {acc.customerId && (
                      <StatusChip kind="custom" code="linked" overrideLabel="App Linked" overrideTone="info" />
                    )}
                  </div>
                  <div className="text-xs text-ink-secondary mt-0.5">
                    {acc.phone} · Limit <PriceText amountPaise={acc.creditLimitPaise} />
                    {acc.overdueDays > 0 ? ` · ${acc.overdueDays}d overdue` : ''}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-ink-muted">Balance Due</div>
                  <PriceText
                    amountPaise={acc.balancePaise}
                    className={`text-base font-bold ${
                      acc.balancePaise > acc.creditLimitPaise ? 'text-status-danger-fg' : 'text-ink-primary'
                    }`}
                  />
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Khata Customer"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!customerName.trim() || phone.length < 10}
              isLoading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create Account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Customer Name" htmlFor="kh-name" required>
            <TextInput id="kh-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </FormField>
          <FormField label="Phone Number" htmlFor="kh-phone" hint="Auto-links if customer signs up with this phone." required>
            <PhoneInput id="kh-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          <FormField label="Address" htmlFor="kh-addr">
            <TextInput id="kh-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="Credit Limit" htmlFor="kh-lim">
              <MoneyInput id="kh-lim" valuePaise={creditLimitPaise} onChangePaise={setCreditLimitPaise} />
            </FormField>
            <FormField label="Billing Day (1-28)" htmlFor="kh-day">
              <TextInput
                id="kh-day"
                type="number"
                min={1}
                max={28}
                value={String(billingCycleDay)}
                onChange={(e) => setBillingCycleDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
              />
            </FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
