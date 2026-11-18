import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { Select, Textarea } from '../../../shared/components/forms/Select';
import { TextInput } from '../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { Switch } from '../../../shared/components/ui/Switch';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { useBootstrapConfig } from '../../../shared/hooks/useBootstrapConfig';
import { adminApi } from '../services/adminApi';

export function AdminConfigPage() {
  const { data: config, isLoading } = useBootstrapConfig();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [appName, setAppName] = useState('');
  const [appSlogan, setAppSlogan] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [statusEdits, setStatusEdits] = useState<Record<string, string>>({});

  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [faqForm, setFaqForm] = useState({ id: '', question: '', answer: '', category: 'General' });

  useEffect(() => {
    if (!config) return;
    setAppName(config.appSettings.appName);
    setAppSlogan(config.appSettings.appSlogan);
    setCurrencySymbol(config.appSettings.currencySymbol);
    setAppVersion(config.appSettings.appVersion);
    setChangelog(config.appSettings.changelog);
    const map: Record<string, string> = {};
    for (const s of config.orderStatuses) map[s.code] = s.label;
    setStatusEdits(map);
  }, [config]);

  const saveSettings = useMutation({
    mutationFn: () =>
      adminApi.updateAppSettings({
        app_name: appName,
        app_slogan: appSlogan,
        currency_symbol: currencySymbol,
        app_version: appVersion,
        changelog,
      }),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Platform settings saved' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
    },
  });

  const saveStatus = useMutation({
    mutationFn: ({ code, label }: { code: string; label: string }) =>
      adminApi.updateOrderStatus(code, { label }),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Order status label updated' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
    },
  });

  const saveFaq = useMutation({
    mutationFn: () => adminApi.upsertFaq({ ...faqForm, id: faqForm.id || undefined }),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'FAQ saved' });
      setFaqModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
    },
  });

  if (isLoading || !config) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Configuration"
        subtitle="Changes here update SMO and Customer portals immediately without redeployment."
      />

      {/* App Identity & Currency */}
      <Card padding="lg" className="space-y-4">
        <h2 className="font-display text-base font-semibold text-ink-primary">Brand & Version</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="App Name">
            <TextInput value={appName} onChange={(e) => setAppName(e.target.value)} />
          </FormField>
          <FormField label="Currency Symbol">
            <TextInput value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
          </FormField>
          <FormField label="App Slogan">
            <TextInput value={appSlogan} onChange={(e) => setAppSlogan(e.target.value)} />
          </FormField>
          <FormField label="App Version">
            <TextInput value={appVersion} onChange={(e) => setAppVersion(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Release Changelog">
          <Textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} />
        </FormField>
        <div className="flex justify-end">
          <Button isLoading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            Save Platform Settings
          </Button>
        </div>
      </Card>

      {/* Order Statuses (Editable without redeploy - Appendix A11) */}
      <Card padding="lg" className="space-y-4">
        <h2 className="font-display text-base font-semibold text-ink-primary">Order Status Labels</h2>
        <div className="space-y-2.5">
          {config.orderStatuses.map((st) => (
            <div key={st.code} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="w-40 font-mono text-xs text-ink-secondary">{st.code}</span>
              <TextInput
                value={statusEdits[st.code] ?? st.label}
                onChange={(e) => setStatusEdits({ ...statusEdits, [st.code]: e.target.value })}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => saveStatus.mutate({ code: st.code, label: statusEdits[st.code] ?? st.label })}
              >
                Update
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Feature Flags & Notification Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg" className="space-y-3">
          <h2 className="font-display text-base font-semibold text-ink-primary">Feature Flags</h2>
          {Object.entries(config.featureFlags).map(([key, enabled]) => (
            <div key={key} className="flex items-center justify-between">
              <Switch
                label={key.replace(/_/g, ' ')}
                checked={enabled}
                onChange={(next) => {
                  void adminApi.toggleFeatureFlag(key, next).then(() => {
                    showToast({ tone: 'success', message: 'Flag updated' });
                    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
                  });
                }}
              />
            </div>
          ))}
        </Card>

        <Card padding="lg" className="space-y-3">
          <h2 className="font-display text-base font-semibold text-ink-primary">Notification Channels</h2>
          <div className="space-y-2 text-sm">
            {config.notificationChannels.map((ch) => (
              <div key={ch.code} className="flex items-center justify-between py-1 border-b border-border-default last:border-0">
                <span>{ch.label}</span>
                <span className="text-xs font-mono text-ink-muted">{ch.enabled ? 'Enabled' : 'Reserved (v2)'}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* FAQs Management */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink-primary">FAQs</h2>
          <Button
            size="sm"
            onClick={() => {
              setFaqForm({ id: '', question: '', answer: '', category: 'General' });
              setFaqModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add FAQ
          </Button>
        </div>

        <div className="divide-y divide-border-default">
          {config.faqs.map((faq) => (
            <div key={faq.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-accent-primary">{faq.category}</div>
                <div className="font-semibold text-sm text-ink-primary">{faq.question}</div>
                <p className="text-xs text-ink-secondary mt-1">{faq.answer}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFaqForm({ id: faq.id, question: faq.question, answer: faq.answer, category: faq.category });
                    setFaqModalOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void adminApi.deleteFaq(faq.id).then(() => {
                      showToast({ tone: 'success', message: 'FAQ deleted' });
                      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-status-danger-fg" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={faqModalOpen}
        onClose={() => setFaqModalOpen(false)}
        title={faqForm.id ? 'Edit FAQ' : 'Add FAQ'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFaqModalOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={saveFaq.isPending} onClick={() => saveFaq.mutate()}>
              Save FAQ
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Category">
            <Select value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}>
              <option value="General">General</option>
              <option value="Payments">Payments</option>
              <option value="POS & Offline">POS & Offline</option>
              <option value="Khata Book">Khata Book</option>
            </Select>
          </FormField>
          <FormField label="Question" required>
            <TextInput value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} />
          </FormField>
          <FormField label="Answer" required>
            <Textarea value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
