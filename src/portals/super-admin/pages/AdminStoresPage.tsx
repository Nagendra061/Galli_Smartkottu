import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Eye, Plus, QrCode, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { QrDisplay } from '../../../shared/components/data-display/QrDisplay';
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { PasswordInput } from '../../../shared/components/forms/PasswordInput';
import { PhoneInput } from '../../../shared/components/forms/PhoneInput';
import { SearchBar } from '../../../shared/components/forms/SearchBar';
import { Select } from '../../../shared/components/forms/Select';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { ResponsiveTable } from '../../../shared/components/layout/ResponsiveTable';
import { Button } from '../../../shared/components/ui/Button';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { adminApi, type AdminStoreRow } from '../services/adminApi';

export function AdminStoresPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<AdminStoreRow | null>(null);
  const [qrStore, setQrStore] = useState<AdminStoreRow | null>(null);
  const [impersonateData, setImpersonateData] = useState<{
    storeName: string;
    snapshot: Record<string, number>;
    productsCount: number;
  } | null>(null);

  // Onboarding wizard form state
  const [form, setForm] = useState({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerPassword: '',
    storeName: '',
    slug: '',
    address: '',
    timings: '08:00 AM - 09:00 PM',
    planId: '',
    gstNumber: '',
    fssaiNumber: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: stores, isLoading, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_STORES,
    queryFn: adminApi.listStores,
  });

  const { data: plans } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_PLANS,
    queryFn: adminApi.listPlans,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      adminApi.createStore({
        ...form,
        planId: form.planId || plans?.[0]?.id || '',
      }),
    onSuccess: (created) => {
      showToast({ tone: 'success', message: `Store ${created.name} onboarded` });
      setWizardOpen(false);
      setForm({
        ownerName: '',
        ownerEmail: '',
        ownerPhone: '',
        ownerPassword: '',
        storeName: '',
        slug: '',
        address: '',
        timings: '08:00 AM - 09:00 PM',
        planId: '',
        gstNumber: '',
        fssaiNumber: '',
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_DASHBOARD });
    },
    onError: (err) => {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to create store.' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: 'active' | 'suspended'; reason?: string }) =>
      adminApi.setStoreStatus(vars.id, { status: vars.status, reason: vars.reason }),
    onSuccess: (updated) => {
      showToast({
        tone: 'success',
        message: updated.status === 'suspended' ? `${updated.name} suspended` : `${updated.name} reactivated`,
      });
      setSuspendTarget(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_DASHBOARD });
    },
    onError: (err) => showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Action failed' }),
  });

  const regenQrMutation = useMutation({
    mutationFn: adminApi.regenerateQr,
    onSuccess: (updated) => {
      showToast({ tone: 'success', message: `QR regenerated (v${(updated as unknown as { qrVersion: number }).qrVersion ?? 2})` });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
    },
  });

  const handleOpenImpersonate = async (store: AdminStoreRow) => {
    try {
      const res = await adminApi.impersonateStore(store.id);
      setImpersonateData({
        storeName: res.store.name,
        snapshot: res.snapshot,
        productsCount: res.productsCount,
      });
    } catch (err) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Unable to view store.' });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.ownerName.trim()) errs.ownerName = 'Owner name is required.';
    if (!form.ownerEmail.includes('@')) errs.ownerEmail = 'Valid email is required.';
    if (form.ownerPhone.replace(/\D/g, '').length < 10) errs.ownerPhone = '10-digit phone is required.';
    if (form.ownerPassword.length < 6) errs.ownerPassword = 'Password must be at least 6 characters.';
    if (!form.storeName.trim()) errs.storeName = 'Store name is required.';
    if (!form.slug.trim()) errs.slug = 'Slug is required.';
    if (!form.address.trim()) errs.address = 'Address is required.';
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    createMutation.mutate();
  };

  const filtered = (stores || []).filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Error'} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Store Management"
        subtitle="Onboard stores, suspend or reactivate access, assign plans, and verify QR codes."
        actions={
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" /> Onboard Store
          </Button>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search stores by name, slug, or owner..." />

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching stores"
          description="Try another search or onboard a new neighbourhood supermarket."
          actionLabel="Onboard Store"
          onAction={() => setWizardOpen(true)}
        />
      ) : (
        <ResponsiveTable
          rows={filtered}
          getKey={(s) => s.id}
          columns={[
            {
              key: 'store',
              header: 'Store',
              render: (s) => (
                <div>
                  <div className="font-semibold text-ink-primary">{s.name}</div>
                  <div className="text-xs text-ink-muted font-mono">/store/{s.slug}</div>
                </div>
              ),
            },
            {
              key: 'owner',
              header: 'Owner',
              render: (s) => (
                <div className="text-xs">
                  <div className="font-medium text-ink-primary">{s.ownerName}</div>
                  <div className="text-ink-muted">{s.ownerPhone}</div>
                </div>
              ),
            },
            {
              key: 'plan',
              header: 'Plan',
              render: (s) => (
                <Select
                  aria-label={`Plan for ${s.name}`}
                  value={s.planId}
                  onChange={(e) => {
                    void adminApi.assignPlan(s.id, e.target.value).then(() => {
                      showToast({ tone: 'success', message: 'Plan updated' });
                      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
                    });
                  }}
                >
                  {(plans || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              ),
            },
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
            {
              key: 'gmv',
              header: 'GMV',
              align: 'right',
              render: (s) => <PriceText amountPaise={s.gmvPaise} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (s) => (
                <div className="inline-flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setQrStore(s)} title="QR Code">
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleOpenImpersonate(s)} title="Read-only View">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {s.status === 'active' ? (
                    <Button size="sm" variant="danger" onClick={() => setSuspendTarget(s)}>
                      Suspend
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => statusMutation.mutate({ id: s.id, status: 'active' })}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          renderMobileCard={(s) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink-primary">{s.name}</div>
                  <div className="text-xs text-ink-muted">
                    {s.ownerName} · /store/{s.slug}
                  </div>
                </div>
                <StatusChip
                  kind="custom"
                  code={s.status}
                  overrideLabel={s.status}
                  overrideTone={s.status === 'active' ? 'success' : 'danger'}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setQrStore(s)}>
                  <QrCode className="h-4 w-4" /> QR
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handleOpenImpersonate(s)}>
                  <Eye className="h-4 w-4" /> Inspect
                </Button>
                {s.status === 'active' ? (
                  <Button size="sm" variant="danger" onClick={() => setSuspendTarget(s)}>
                    Suspend
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => statusMutation.mutate({ id: s.id, status: 'active' })}
                  >
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          )}
        />
      )}

      {/* Onboarding Wizard Modal */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Store Onboarding Wizard"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWizardOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="onboard-store-form" isLoading={createMutation.isPending}>
              Create Store & Owner
            </Button>
          </>
        }
      >
        <form id="onboard-store-form" onSubmit={handleCreateSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Owner Name" error={formErrors.ownerName} required>
            <TextInput
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              hasError={Boolean(formErrors.ownerName)}
            />
          </FormField>
          <FormField label="Owner Email" error={formErrors.ownerEmail} required>
            <TextInput
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              hasError={Boolean(formErrors.ownerEmail)}
            />
          </FormField>
          <FormField label="Owner Phone" error={formErrors.ownerPhone} required>
            <PhoneInput
              value={form.ownerPhone}
              onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
              hasError={Boolean(formErrors.ownerPhone)}
            />
          </FormField>
          <FormField label="Temporary Password" error={formErrors.ownerPassword} required>
            <PasswordInput
              value={form.ownerPassword}
              onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
              hasError={Boolean(formErrors.ownerPassword)}
            />
          </FormField>
          <FormField label="Store Name" error={formErrors.storeName} required>
            <TextInput
              value={form.storeName}
              onChange={(e) => {
                const name = e.target.value;
                setForm({
                  ...form,
                  storeName: name,
                  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                });
              }}
              hasError={Boolean(formErrors.storeName)}
            />
          </FormField>
          <FormField label="Store Slug" error={formErrors.slug} required>
            <TextInput
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              hasError={Boolean(formErrors.slug)}
            />
          </FormField>
          <FormField label="Address" error={formErrors.address} required>
            <TextInput
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              hasError={Boolean(formErrors.address)}
            />
          </FormField>
          <FormField label="Plan">
            <Select value={form.planId || plans?.[0]?.id || ''} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              {(plans || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="GST Number (Optional)">
            <TextInput value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
          </FormField>
          <FormField label="FSSAI Number (Optional)">
            <TextInput value={form.fssaiNumber} onChange={(e) => setForm({ ...form, fssaiNumber: e.target.value })} />
          </FormField>
        </form>
      </Modal>

      {/* Suspend Confirmation */}
      <ConfirmDialog
        open={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.name || ''}?`}
        description="Customers will immediately see 'Store unavailable' and online checkout will be blocked until reactivated."
        confirmLabel="Suspend Store"
        reasonLabel="Suspension reason"
        isLoading={statusMutation.isPending}
        onConfirm={(reason) => {
          if (suspendTarget) {
            statusMutation.mutate({ id: suspendTarget.id, status: 'suspended', reason });
          }
        }}
      />

      {/* Store QR Modal */}
      <Modal open={Boolean(qrStore)} onClose={() => setQrStore(null)} title={`Store QR — ${qrStore?.name || ''}`} size="sm">
        {qrStore && (
          <div className="flex flex-col items-center gap-4 text-center">
            <QrDisplay src={null} alt={qrStore.name} caption={`/store/${qrStore.slug}`} />
            <div className="flex flex-wrap gap-2 justify-center">
              <a
                href={`/store/${qrStore.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" /> Open Storefront
              </a>
              <Button
                size="sm"
                variant="secondary"
                isLoading={regenQrMutation.isPending}
                onClick={() => regenQrMutation.mutate(qrStore.id)}
              >
                <RefreshCw className="h-4 w-4" /> Regenerate QR
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Read-only Impersonation Modal */}
      <Modal
        open={Boolean(impersonateData)}
        onClose={() => setImpersonateData(null)}
        title={`Read-only View — ${impersonateData?.storeName || ''}`}
      >
        {impersonateData && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-ink-muted">This read-only inspection has been recorded in the audit log.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border-default p-3">
                <div className="text-xs text-ink-secondary">Active Products</div>
                <div className="text-lg font-bold tabular-nums">{impersonateData.productsCount}</div>
              </div>
              <div className="rounded-lg border border-border-default p-3">
                <div className="text-xs text-ink-secondary">Today Sales</div>
                <div className="text-lg font-bold">
                  <PriceText amountPaise={impersonateData.snapshot.todaySalesPaise || 0} />
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
