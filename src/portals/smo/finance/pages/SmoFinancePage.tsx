import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  DollarSign,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { SimpleChart } from '../../../../shared/components/data-display/SimpleChart';
import { StatCard } from '../../../../shared/components/data-display/StatCard';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { ProgressBar } from '../../../../shared/components/ui/ProgressBar';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { Tabs } from '../../../../shared/components/ui/Tabs';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { smoApi } from '../../services/smoApi';

export function SmoFinancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const routeTab = location.pathname.includes('/closing')
    ? 'closing'
    : location.pathname.includes('/expenses')
    ? 'expenses'
    : location.pathname.includes('/upi')
    ? 'upi'
    : location.pathname.includes('/predictions')
    ? 'predictions'
    : location.pathname.includes('/advisor')
    ? 'advisor'
    : 'summary';

  const [tab, setTab] = useState<'summary' | 'closing' | 'expenses' | 'upi' | 'predictions' | 'advisor'>(routeTab);
  useEffect(() => {
    setTab(routeTab);
  }, [routeTab]);

  // Daily Closing state
  const today = new Date().toISOString().slice(0, 10);
  const [openingCashPaise, setOpeningCashPaise] = useState(0);
  const [actualCashPaise, setActualCashPaise] = useState(0);
  const [closingNote, setClosingNote] = useState('');

  // Expense state
  const [expCategory, setExpCategory] = useState('rent');
  const [expTitle, setExpTitle] = useState('');
  const [expAmountPaise, setExpAmountPaise] = useState(0);
  const [expDate, setExpDate] = useState(today);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_SUMMARY,
    queryFn: () => smoApi.getFinanceSummary(),
  });
  const { data: closings } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_CLOSINGS,
    queryFn: () => smoApi.getClosings(today),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_EXPENSES,
    queryFn: smoApi.listExpenses,
  });
  const { data: upiList = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_UPI,
    queryFn: smoApi.listUpiReconciliation,
  });
  const { data: predictions = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_PREDICTIONS,
    queryFn: smoApi.getPredictions,
  });
  const { data: advisor } = useQuery({
    queryKey: QUERY_KEYS.SMO_FINANCE_ADVISOR,
    queryFn: smoApi.getAdvisor,
  });

  const closingMutation = useMutation({
    mutationFn: () =>
      smoApi.submitClosing({
        closingDate: today,
        openingCashPaise,
        actualCashPaise,
        note: closingNote.trim() || undefined,
      }),
    onSuccess: () => {
      setClosingNote('');
      showToast({ tone: 'success', message: 'Daily register closing recorded.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_CLOSINGS });
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Closing failed.' }),
  });

  const expenseMutation = useMutation({
    mutationFn: () =>
      smoApi.createExpense({
        category: expCategory,
        title: expTitle.trim(),
        amountPaise: expAmountPaise,
        expenseDate: expDate,
      }),
    onSuccess: () => {
      setExpTitle('');
      setExpAmountPaise(0);
      showToast({ tone: 'success', message: 'Expense added.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_EXPENSES });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_SUMMARY });
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to save expense.' }),
  });

  const advisorActionMutation = useMutation({
    mutationFn: ({ actionKey, status }: { actionKey: string; status: 'done' | 'dismissed' }) =>
      smoApi.setAdvisorAction(actionKey, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_ADVISOR });
    },
  });

  const createClearanceOffer = async (productId: string, title: string) => {
    try {
      await smoApi.createOffer({
        title: `Clearance: ${title.slice(0, 28)}`,
        offerType: 'percent',
        discountValue: 15,
        productIds: [productId],
      });
      showToast({ tone: 'success', message: '15% clearance offer created and active.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_OFFERS });
    } catch (err) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Offer creation failed.' });
    }
  };

  const expectedDrawerCash = closings
    ? openingCashPaise + closings.cashSalesPaise - closings.expensesPaise
    : 0;
  const drawerDiff = actualCashPaise - expectedDrawerCash;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Financial Reconciliation"
        subtitle="P&L, GST breakdown, daily closing, UPI verification, loss alerts, and profit advisor."
      />

      <Tabs
        activeId={tab}
        onChange={(id) => {
          const next = id as typeof tab;
          setTab(next);
          if (next === 'summary') navigate(ROUTES.OWNER_FINANCE);
          if (next === 'closing') navigate(ROUTES.OWNER_FINANCE_CLOSING);
          if (next === 'expenses') navigate(ROUTES.OWNER_FINANCE_EXPENSES);
          if (next === 'upi') navigate(ROUTES.OWNER_FINANCE_UPI);
          if (next === 'predictions') navigate(ROUTES.OWNER_FINANCE_PREDICTIONS);
          if (next === 'advisor') navigate(ROUTES.OWNER_FINANCE_ADVISOR);
        }}
        options={[
          { id: 'summary', label: 'Summary & P&L' },
          { id: 'closing', label: 'Daily Closing' },
          { id: 'expenses', label: 'Expenses', count: expenses.length },
          { id: 'upi', label: 'UPI Reconciliation' },
          { id: 'predictions', label: 'Loss Alerts', count: predictions.length },
          { id: 'advisor', label: 'Profit Advisor' },
        ]}
      />

      {tab === 'summary' && (
        <div className="space-y-4">
          {loadingSummary || !summary ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Revenue (30d)" value={<PriceText amountPaise={summary.revenuePaise} />} />
                <StatCard label="Gross Profit" value={<PriceText amountPaise={summary.grossProfitPaise} />} />
                <StatCard label="Expenses" value={<PriceText amountPaise={summary.expensesPaise} />} />
                <StatCard
                  label="Net Profit"
                  value={<PriceText amountPaise={summary.netProfitPaise} />}
                  tone={summary.netProfitPaise >= 0 ? 'success' : 'danger'}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card padding="md" className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink-primary">Cash Flow & Receivables</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Khata Receivable</span>
                      <PriceText amountPaise={summary.khataReceivablePaise} className="font-semibold" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-secondary">Supplier Payables</span>
                      <PriceText amountPaise={summary.supplierPayablePaise} className="font-semibold" />
                    </div>
                    <div className="flex justify-between border-t border-border-default pt-2">
                      <span className="text-ink-primary font-medium">30-Day Cash Position</span>
                      <PriceText amountPaise={summary.expectedCash30dPaise} className="font-bold" />
                    </div>
                  </div>
                </Card>

                <Card padding="md" className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink-primary">GST / Tax Summary</h3>
                  {summary.taxBySlab.length === 0 ? (
                    <p className="text-xs text-ink-muted">No sales in this period yet.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {summary.taxBySlab.map((t) => (
                        <div key={t.ratePercent} className="flex justify-between">
                          <span className="text-ink-secondary">GST {t.ratePercent}% Slab</span>
                          <span className="font-mono text-ink-primary">
                            Tax <PriceText amountPaise={t.taxPaise} /> on <PriceText amountPaise={t.salesPaise} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {summary.categoryMargins.length > 0 && (
                <Card padding="md" className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink-primary">Category Revenue & Margin</h3>
                  <SimpleChart
                    data={summary.categoryMargins.map((c) => ({
                      label: `${c.category} (${c.marginPercent}% margin)`,
                      value: c.revenuePaise,
                      formatted: `${(c.revenuePaise / 100).toFixed(0)}`,
                    }))}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'closing' && closings && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card padding="md" className="md:col-span-6 space-y-3">
            <h3 className="text-sm font-semibold text-ink-primary">Daily Cash Register Closing ({today})</h3>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-surface-subtle p-3 rounded-lg">
              <div>
                <span className="text-ink-muted">Cash Sales:</span>{' '}
                <PriceText amountPaise={closings.cashSalesPaise} className="font-bold" />
              </div>
              <div>
                <span className="text-ink-muted">Verified UPI:</span>{' '}
                <PriceText amountPaise={closings.upiVerifiedPaise} className="font-bold" />
              </div>
              <div>
                <span className="text-ink-muted">Khata Given:</span>{' '}
                <PriceText amountPaise={closings.khataGivenPaise} className="font-bold" />
              </div>
              <div>
                <span className="text-ink-muted">Expenses:</span>{' '}
                <PriceText amountPaise={closings.expensesPaise} className="font-bold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Opening Cash" htmlFor="open-cash">
                <MoneyInput id="open-cash" valuePaise={openingCashPaise} onChangePaise={setOpeningCashPaise} />
              </FormField>
              <FormField label="Actual Counted Cash" htmlFor="act-cash">
                <MoneyInput id="act-cash" valuePaise={actualCashPaise} onChangePaise={setActualCashPaise} />
              </FormField>
            </div>

            <div className="flex justify-between text-xs rounded-lg border border-border-default p-2.5">
              <span>Expected Drawer: <PriceText amountPaise={expectedDrawerCash} className="font-bold" /></span>
              <span className={drawerDiff === 0 ? 'text-status-success-fg' : 'text-status-warning-fg'}>
                Difference: <PriceText amountPaise={drawerDiff} showSign className="font-bold" />
              </span>
            </div>

            <FormField label="Closing Note" htmlFor="close-note">
              <TextInput
                id="close-note"
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                placeholder="Note any cash variance..."
              />
            </FormField>

            <Button isLoading={closingMutation.isPending} onClick={() => closingMutation.mutate()}>
              Save Daily Closing
            </Button>
          </Card>

          <Card padding="md" className="md:col-span-6 space-y-2.5">
            <h3 className="text-sm font-semibold text-ink-primary">Closing History</h3>
            {closings.history.length === 0 ? (
              <EmptyState title="No closings recorded" description="Submit your first end-of-day cash count." />
            ) : (
              closings.history.map((h) => (
                <div key={h.id} className="rounded-lg border border-border-default p-3 text-xs space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{h.closingDate}</span>
                    <span>
                      Actual <PriceText amountPaise={h.actualCashPaise} /> (Diff{' '}
                      <PriceText amountPaise={h.differencePaise} showSign />)
                    </span>
                  </div>
                  {h.note && <p className="text-ink-muted">{h.note}</p>}
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card padding="md" className="md:col-span-5 space-y-3">
            <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> Record Expense
            </h3>
            <FormField label="Category" htmlFor="exp-cat">
              <Select id="exp-cat" value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                <option value="rent">Rent</option>
                <option value="salary">Staff Salary</option>
                <option value="electricity">Electricity & Utilities</option>
                <option value="transport">Transport & Delivery</option>
                <option value="supplies">Packaging & Supplies</option>
                <option value="other">Other</option>
              </Select>
            </FormField>
            <FormField label="Title" htmlFor="exp-title" required>
              <TextInput
                id="exp-title"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="e.g. Monthly shop electricity"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2.5">
              <FormField label="Amount" htmlFor="exp-amt" required>
                <MoneyInput id="exp-amt" valuePaise={expAmountPaise} onChangePaise={setExpAmountPaise} />
              </FormField>
              <FormField label="Date" htmlFor="exp-date">
                <TextInput id="exp-date" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
              </FormField>
            </div>
            <Button
              disabled={!expTitle.trim() || expAmountPaise <= 0}
              isLoading={expenseMutation.isPending}
              onClick={() => expenseMutation.mutate()}
            >
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </Card>

          <div className="md:col-span-7 space-y-2.5">
            {expenses.length === 0 ? (
              <EmptyState title="No expenses recorded" description="Log store expenses for accurate net profit." />
            ) : (
              expenses.map((ex) => (
                <Card key={ex.id} padding="md" className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{ex.title}</div>
                    <div className="text-xs text-ink-secondary capitalize">
                      {ex.category} · {ex.expenseDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PriceText amountPaise={ex.amountPaise} className="text-sm font-bold" />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await smoApi.deleteExpense(ex.id);
                        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_EXPENSES });
                        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_SUMMARY });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'upi' && (
        <div className="space-y-3">
          {upiList.length === 0 ? (
            <EmptyState title="No UPI payments yet" description="Online UPI references submitted by customers appear here." />
          ) : (
            <Card padding="none" className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border-default bg-surface-subtle text-xs text-ink-secondary">
                  <tr>
                    <th className="px-4 py-2.5">Order</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Ref / UTR</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {upiList.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5 font-mono font-semibold">{u.orderNumber}</td>
                      <td className="px-4 py-2.5">{u.customerName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {u.referenceNo || '—'}
                        {u.isDuplicate && (
                          <span className="ml-2 text-status-danger-fg font-semibold">Duplicate</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-bold">
                        <PriceText amountPaise={u.amountPaise} />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip kind="payment" code={u.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'predictions' && (
        <div className="space-y-3">
          {predictions.length === 0 ? (
            <EmptyState
              title="No loss or damage risks detected"
              description="Expiry, slow-moving stock, negative margins, and cash variances are monitored automatically."
            />
          ) : (
            predictions.map((p) => (
              <Card key={p.id} padding="md" className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`h-4 w-4 ${
                        p.severity === 'high' ? 'text-status-danger-fg' : 'text-status-warning-fg'
                      }`}
                    />
                    <span className="text-sm font-semibold text-ink-primary">{p.title}</span>
                    <StatusChip
                      kind="custom"
                      code={p.severity}
                      overrideLabel={p.severity.toUpperCase()}
                      overrideTone={p.severity === 'high' ? 'danger' : 'warning'}
                    />
                  </div>
                  <p className="text-xs text-ink-secondary">{p.reasoning}</p>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xs text-ink-muted">Est. Risk</div>
                  <PriceText amountPaise={p.estimatedImpactPaise} className="text-sm font-bold text-status-danger-fg" />
                  {p.productId && (
                    <div>
                      <Button size="sm" variant="secondary" onClick={() => void createClearanceOffer(p.productId!, p.title)}>
                        Create Clearance Offer
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'advisor' && advisor && (
        <div className="space-y-4">
          <Card padding="md" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-muted font-semibold">
                  Profit Health Score
                </div>
                <div className="text-3xl font-bold font-mono text-ink-primary">
                  {advisor.healthScore} / 100
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-muted">Net Margin</div>
                <div className="text-lg font-bold font-mono text-ink-primary">{advisor.marginPercent}%</div>
              </div>
            </div>
            <ProgressBar
              value={advisor.healthScore}
              max={100}
              tone={advisor.healthScore >= 70 ? 'success' : advisor.healthScore >= 40 ? 'warning' : 'danger'}
            />
          </Card>

          {advisor.mistakes.length > 0 && (
            <Alert tone="warning" title="Profit Leaks Identified">
              <ul className="list-disc pl-4 space-y-1 text-xs mt-1">
                {advisor.mistakes.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Recommended Actions
            </h3>
            {advisor.actions.length === 0 ? (
              <EmptyState title="Store profit metrics look healthy" description="Keep recording sales and stock-ins for live advice." />
            ) : (
              advisor.actions.map((act) => (
                <Card key={act.actionKey} padding="md" className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-accent-primary" />
                      <span className="text-sm font-semibold text-ink-primary">{act.title}</span>
                      {act.status !== 'open' && (
                        <StatusChip kind="custom" code={act.status} overrideLabel={act.status} />
                      )}
                    </div>
                    <p className="text-xs text-ink-secondary">{act.reasoning}</p>
                    <p className="text-xs font-medium text-status-success-fg">
                      Potential Gain: <PriceText amountPaise={act.estimatedImpactPaise} />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {act.productId && (
                      <Button
                        size="sm"
                        onClick={() => void createClearanceOffer(act.productId!, act.title)}
                      >
                        {act.ctaLabel}
                      </Button>
                    )}
                    {act.status === 'open' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => advisorActionMutation.mutate({ actionKey: act.actionKey, status: 'done' })}
                        >
                          <Check className="h-3.5 w-3.5" /> Done
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => advisorActionMutation.mutate({ actionKey: act.actionKey, status: 'dismissed' })}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
