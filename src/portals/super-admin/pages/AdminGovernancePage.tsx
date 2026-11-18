import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { DateTimeText } from '../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../shared/components/data-display/PriceText';
import { SimpleChart } from '../../../shared/components/data-display/SimpleChart';
import { EmptyState, Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { PasswordInput } from '../../../shared/components/forms/PasswordInput';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { ResponsiveTable } from '../../../shared/components/layout/ResponsiveTable';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { Switch } from '../../../shared/components/ui/Switch';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { adminApi } from '../services/adminApi';

export function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.ADMIN_ANALYTICS, queryFn: adminApi.getAnalytics });
  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const exportCsv = () => {
    if (!data) return;
    const csv = ['Day,Orders,GMV_Paise', ...data.byDay.map((d) => `${d.day},${d.orders},${d.gmvPaise}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'platform-analytics.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Network Analytics"
        subtitle="Revenue trend and QR scan-to-order conversion across stores."
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg" className="space-y-3">
          <h2 className="font-display text-base font-semibold">QR Funnel</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Total QR Scans</span>
            <span className="font-mono font-bold tabular-nums">{data?.qrScans ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Online Orders Placed</span>
            <span className="font-mono font-bold tabular-nums">{data?.onlineOrders ?? 0}</span>
          </div>
        </Card>
        <Card padding="lg" className="space-y-3">
          <h2 className="font-display text-base font-semibold">Daily GMV</h2>
          {data?.byDay.length ? (
            <SimpleChart
              data={data.byDay.map((d) => ({
                label: d.day,
                value: d.gmvPaise,
                formatted: `${d.orders} orders`,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-muted">No completed orders yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function AdminCompliancePage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_AUDIT,
    queryFn: adminApi.listAuditLogs,
  });
  const { data: deletions } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_DELETIONS,
    queryFn: adminApi.listDeletions,
  });

  const processMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'restore' | 'finalise' }) =>
      adminApi.processDeletion(id, action),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Deletion request processed' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_DELETIONS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
    },
  });

  const auditRows = (logs || []) as {
    id: string;
    actorName: string;
    actorRole: string;
    action: string;
    entityType: string;
    createdAt: string;
  }[];
  const delRows = (deletions || []) as {
    id: string;
    store_name: string;
    owner_name: string;
    reason: string;
    status: string;
    grace_ends_at: string;
  }[];

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance & Audit" subtitle="30-day account deletion grace queue and immutable audit trail." />

      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold">Account Deletion Queue</h2>
        {delRows.length === 0 ? (
          <EmptyState title="No deletion requests" description="Store owner account deletion requests enter a 30-day grace queue here." />
        ) : (
          <div className="space-y-2.5">
            {delRows.map((d) => (
              <Card key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">{d.store_name} ({d.owner_name})</div>
                  <div className="text-xs text-ink-secondary">
                    Reason: {d.reason} · Status: {d.status} · Grace ends <DateTimeText iso={d.grace_ends_at} mode="date" />
                  </div>
                </div>
                {d.status === 'pending_grace' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => processMutation.mutate({ id: d.id, action: 'restore' })}>
                      Restore
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => processMutation.mutate({ id: d.id, action: 'finalise' })}>
                      Finalise Anonymisation
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold">Immutable Audit Log</h2>
        {logsLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveTable
            rows={auditRows}
            getKey={(r) => r.id}
            columns={[
              { key: 'time', header: 'Time', render: (r) => <DateTimeText iso={r.createdAt} className="text-xs" /> },
              { key: 'actor', header: 'Actor', render: (r) => `${r.actorName} (${r.actorRole})` },
              { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
              { key: 'entity', header: 'Entity', render: (r) => r.entityType },
            ]}
            renderMobileCard={(r) => (
              <div className="text-xs space-y-1">
                <div className="font-mono font-semibold text-ink-primary">{r.action}</div>
                <div className="text-ink-secondary">
                  {r.actorName} ({r.actorRole}) · <DateTimeText iso={r.createdAt} />
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

export function AdminAutomationPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.ADMIN_AUTOMATIONS, queryFn: adminApi.listAutomations });

  const runMutation = useMutation({
    mutationFn: adminApi.runAutomation,
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Workflow executed' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_AUTOMATIONS });
    },
  });

  const jobs = (data || []) as {
    key: string;
    name: string;
    triggerDesc: string;
    actionDesc: string;
    enabled: number;
    lastRunAt: string | null;
    lastStatus: string;
    lastMessage: string;
  }[];

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Automation Console" subtitle="n8n workflow definitions, schedules, and on-demand triggers." />
      <div className="space-y-3">
        {jobs.map((j) => (
          <Card key={j.key} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-sm text-ink-primary">
                {j.name} <span className="text-xs font-mono text-ink-muted">({j.triggerDesc})</span>
              </div>
              <p className="text-xs text-ink-secondary">{j.actionDesc}</p>
              <p className="text-xs text-ink-muted">
                Last run: {j.lastRunAt ? <DateTimeText iso={j.lastRunAt} /> : 'Never'} · {j.lastMessage}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Switch
                label="Enabled"
                checked={j.enabled === 1}
                onChange={(en) => {
                  void adminApi.toggleAutomation(j.key, en).then(() => {
                    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_AUTOMATIONS });
                  });
                }}
              />
              <Button size="sm" variant="secondary" isLoading={runMutation.isPending} onClick={() => runMutation.mutate(j.key)}>
                <Play className="h-3.5 w-3.5" /> Run Now
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const { data } = useQuery({ queryKey: QUERY_KEYS.ADMIN_USERS, queryFn: adminApi.listAdminUsers });
  const createMutation = useMutation({
    mutationFn: () => adminApi.createAdminUser(form),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Admin user created' });
      setOpen(false);
      setForm({ name: '', email: '', password: '' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_USERS });
    },
  });

  const users = (data || []) as { id: string; name: string; email: string; lastLoginAt: string | null }[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin Team & Access"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Admin
          </Button>
        }
      />
      <ResponsiveTable
        rows={users}
        getKey={(u) => u.id}
        columns={[
          { key: 'name', header: 'Name', render: (u) => <span className="font-medium">{u.name}</span> },
          { key: 'email', header: 'Email', render: (u) => u.email },
          { key: 'last', header: 'Last Login', render: (u) => <DateTimeText iso={u.lastLoginAt} /> },
        ]}
        renderMobileCard={(u) => (
          <div>
            <div className="font-semibold text-sm">{u.name}</div>
            <div className="text-xs text-ink-secondary">{u.email}</div>
          </div>
        )}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Super Admin User"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Create User
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name">
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Password">
            <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
