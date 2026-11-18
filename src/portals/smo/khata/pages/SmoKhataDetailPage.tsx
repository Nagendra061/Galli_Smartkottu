import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Lock, Printer, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { smoApi } from '../../services/smoApi';

export function SmoKhataDetailPage() {
  const { accountId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const [entryModal, setEntryModal] = useState<'credit' | 'debit' | 'write_off' | null>(null);
  const [amountPaise, setAmountPaise] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');

  const [editLimitOpen, setEditLimitOpen] = useState(false);
  const [newLimitPaise, setNewLimitPaise] = useState(0);

  const [overrideNeeded, setOverrideNeeded] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_KHATA_DETAIL(accountId),
    queryFn: () => smoApi.getKhataDetail(accountId),
    enabled: Boolean(accountId),
  });

  const { data: homeData } = useQuery({
    queryKey: QUERY_KEYS.SMO_HOME,
    queryFn: smoApi.getHome,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_DETAIL(accountId) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
  };

  const entryMutation = useMutation({
    mutationFn: (overrideLimit: boolean) =>
      smoApi.addKhataEntry({
        accountId,
        entryType: entryModal!,
        amountPaise,
        paymentMethod: entryModal === 'credit' ? paymentMethod : null,
        referenceNo: referenceNo.trim() || null,
        note: note.trim(),
        overrideLimit,
        overrideReason: overrideLimit ? overrideReason.trim() : undefined,
      }),
    onSuccess: () => {
      setEntryModal(null);
      setOverrideNeeded(false);
      setOverrideReason('');
      setAmountPaise(0);
      setNote('');
      setReferenceNo('');
      showToast({ tone: 'success', message: 'Khata entry recorded.' });
      invalidate();
    },
    onError: (err: unknown) => {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr.code === 'KHATA_LIMIT_EXCEEDED') {
        setOverrideNeeded(true);
        return;
      }
      showToast({ tone: 'error', message: apiErr.message || 'Entry failed.' });
    },
  });

  const controlMutation = useMutation({
    mutationFn: (payload: { status?: 'active' | 'frozen' | 'closed'; creditLimitPaise?: number }) =>
      smoApi.updateKhataControl(accountId, payload),
    onSuccess: () => {
      setEditLimitOpen(false);
      showToast({ tone: 'success', message: 'Khata account updated.' });
      invalidate();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Update failed.' }),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-48 w-full" />;
  }

  const { account, entries } = data;
  const currency = config?.appSettings.currencySymbol || '';
  const isOwner = user?.role === 'smo';

  const copyReminder = async () => {
    const msg = `Hello ${account.customerName}, reminder from ${homeData?.store.name || ''}: your Khata balance is ${currency}${(
      account.balancePaise / 100
    ).toFixed(2)}. Please settle at your convenience.`;
    await navigator.clipboard.writeText(msg);
    showToast({ tone: 'success', message: 'Reminder text copied.' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.OWNER_KHATA)}>
          <ArrowLeft className="h-4 w-4" /> Back to Khata Book
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copyReminder()}>
            <Copy className="h-4 w-4" /> Copy Reminder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print Statement
          </Button>
        </div>
      </div>

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-ink-primary">{account.customerName}</h1>
              <StatusChip
                kind="custom"
                code={account.status}
                overrideLabel={account.status.toUpperCase()}
                overrideTone={account.status === 'active' ? 'success' : 'warning'}
              />
            </div>
            <p className="text-xs text-ink-secondary mt-0.5">
              {account.phone} {account.address ? `· ${account.address}` : ''}
            </p>
            <p className="text-xs text-ink-muted mt-0.5">
              Credit Limit: <PriceText amountPaise={account.creditLimitPaise} /> · Billing Day {account.billingCycleDay}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Current Balance Due</div>
            <PriceText amountPaise={account.balancePaise} className="text-2xl font-bold text-ink-primary" />
          </div>
        </div>

        {isOwner && account.status !== 'closed' && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border-default print:hidden">
            <Button
              size="sm"
              onClick={() => {
                setAmountPaise(account.balancePaise);
                setEntryModal('credit');
              }}
            >
              Record Payment
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={account.status === 'frozen'}
              onClick={() => {
                setAmountPaise(0);
                setEntryModal('debit');
              }}
            >
              Add Manual Debit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNewLimitPaise(account.creditLimitPaise);
                setEditLimitOpen(true);
              }}
            >
              Edit Limit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                controlMutation.mutate({ status: account.status === 'frozen' ? 'active' : 'frozen' })
              }
            >
              {account.status === 'frozen' ? (
                <>
                  <Unlock className="h-3.5 w-3.5" /> Unfreeze
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" /> Freeze
                </>
              )}
            </Button>
            {account.balancePaise > 0 && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setAmountPaise(account.balancePaise);
                  setEntryModal('write_off');
                }}
              >
                Write Off
              </Button>
            )}
            {account.balancePaise === 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => controlMutation.mutate({ status: 'closed' })}
              >
                Close Account
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-primary">Itemized Statement ({entries.length})</h2>
        {entries.length === 0 ? (
          <EmptyState title="No ledger entries yet" description="Bills charged to Khata and repayments appear here." />
        ) : (
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-default bg-surface-subtle text-xs text-ink-secondary">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Note / Order</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      <DateTimeText iso={e.createdAt} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusChip
                        kind="custom"
                        code={e.entryType}
                        overrideLabel={e.entryType.replace('_', ' ').toUpperCase()}
                        overrideTone={e.entryType === 'debit' ? 'danger' : 'success'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-secondary">
                      {e.orderNumber ? `Order ${e.orderNumber} · ` : ''}
                      {e.note || e.paymentMethod || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      <PriceText amountPaise={e.amountPaise} />
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold">
                      <PriceText amountPaise={e.balanceAfterPaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Entry Modal */}
      <Modal
        open={Boolean(entryModal)}
        onClose={() => {
          setEntryModal(null);
          setOverrideNeeded(false);
        }}
        title={
          entryModal === 'credit'
            ? 'Record Payment'
            : entryModal === 'debit'
            ? 'Add Manual Charge'
            : 'Write Off Dues'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEntryModal(null)}>
              Cancel
            </Button>
            <Button
              variant={entryModal === 'write_off' ? 'danger' : 'primary'}
              disabled={
                amountPaise <= 0 ||
                (entryModal === 'write_off' && note.trim().length < 3) ||
                (overrideNeeded && overrideReason.trim().length < 3)
              }
              isLoading={entryMutation.isPending}
              onClick={() => entryMutation.mutate(overrideNeeded)}
            >
              {overrideNeeded ? 'Override Limit & Save' : 'Save Entry'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {overrideNeeded && (
            <Alert tone="warning" title="Exceeds credit limit">
              Enter an override reason below to approve this charge over limit.
            </Alert>
          )}
          <FormField label="Amount" htmlFor="khe-amt" required>
            <MoneyInput id="khe-amt" valuePaise={amountPaise} onChangePaise={setAmountPaise} />
          </FormField>
          {entryModal === 'credit' && (
            <div className="grid grid-cols-2 gap-2.5">
              <FormField label="Method" htmlFor="khe-pm">
                <Select id="khe-pm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank Transfer</option>
                </Select>
              </FormField>
              <FormField label="Reference" htmlFor="khe-ref">
                <TextInput id="khe-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </FormField>
            </div>
          )}
          <FormField label="Note / Reason" htmlFor="khe-note" required={entryModal === 'write_off'}>
            <TextInput
              id="khe-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={entryModal === 'write_off' ? 'Reason required...' : 'Optional note'}
            />
          </FormField>
          {overrideNeeded && (
            <FormField label="Override Reason" htmlFor="khe-ov" required>
              <TextInput
                id="khe-ov"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </FormField>
          )}
        </div>
      </Modal>

      {/* Edit Limit Modal */}
      <Modal
        open={editLimitOpen}
        onClose={() => setEditLimitOpen(false)}
        title="Edit Credit Limit"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditLimitOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={controlMutation.isPending}
              onClick={() => controlMutation.mutate({ creditLimitPaise: newLimitPaise })}
            >
              Update Limit
            </Button>
          </>
        }
      >
        <FormField label="New Credit Limit" htmlFor="new-lim">
          <MoneyInput id="new-lim" valuePaise={newLimitPaise} onChangePaise={setNewLimitPaise} />
        </FormField>
      </Modal>
    </div>
  );
}
