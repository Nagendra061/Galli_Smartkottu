import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DateTimeText } from '../../../shared/components/data-display/DateTimeText';
import { EmptyState, Skeleton } from '../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../shared/components/feedback/Modal';
import { useToast } from '../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../shared/components/forms/FormField';
import { Select, Textarea } from '../../../shared/components/forms/Select';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { StatusChip } from '../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../shared/config/queryKeys';
import { adminApi } from '../services/adminApi';

interface TicketRow {
  id: string;
  storeName: string;
  creatorName: string;
  subject: string;
  status: string;
  priority: string;
  internalNotes: string;
  slaDueAt: string;
  updatedAt: string;
  messages: { id: string; senderRole: string; senderName: string; body: string; createdAt: string }[];
}

export function AdminSupportPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [internalNotes, setInternalNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN_TICKETS,
    queryFn: adminApi.listTickets,
  });

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No ticket selected');
      return adminApi.replyTicket(selected.id, { body: replyBody, status, internalNotes });
    },
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Ticket updated' });
      setReplyBody('');
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_TICKETS });
    },
  });

  const tickets = (data || []) as unknown as TicketRow[];

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Support Desk" subtitle="Tickets raised by store owners with SLA tracking and replies." />

      {tickets.length === 0 ? (
        <EmptyState title="No support tickets" description="Store owner tickets will appear here when submitted." />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-primary">{t.subject}</span>
                  <StatusChip
                    kind="custom"
                    code={t.status}
                    overrideLabel={t.status.replace('_', ' ')}
                    overrideTone={t.status === 'resolved' || t.status === 'closed' ? 'success' : 'warning'}
                  />
                </div>
                <div className="text-xs text-ink-secondary">
                  {t.storeName} · {t.creatorName} · SLA due <DateTimeText iso={t.slaDueAt} />
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelected(t);
                  setStatus(t.status);
                  setInternalNotes(t.internalNotes || '');
                }}
              >
                Open Thread ({t.messages.length})
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || 'Ticket'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button isLoading={replyMutation.isPending} onClick={() => replyMutation.mutate()}>
              Send Reply & Save
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg bg-surface-subtle p-3">
              {selected.messages.map((m) => (
                <div key={m.id} className="rounded-lg bg-surface-card border border-border-default p-2.5 text-xs">
                  <div className="flex justify-between font-semibold text-ink-primary">
                    <span>
                      {m.senderName} ({m.senderRole})
                    </span>
                    <DateTimeText iso={m.createdAt} className="text-ink-muted font-normal" />
                  </div>
                  <p className="text-ink-secondary mt-1">{m.body}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Ticket Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </Select>
              </FormField>
              <FormField label="Internal Notes (Admin only)">
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Reply to Store Owner">
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a helpful reply..."
              />
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
