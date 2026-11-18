import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  MessageSquare,
  Package,
  Printer,
  Receipt,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { StatusTimeline } from '../../../../shared/components/data-display/StatusTimeline';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { Tabs } from '../../../../shared/components/ui/Tabs';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import type { OrderItem, OrderRecord } from '../../../../shared/types';
import { smoApi } from '../../services/smoApi';

function playOrderBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // Audio playback may require user interaction
  }
}

export function SmoOnlineOrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { data: config } = useBootstrapConfig();

  const [tab, setTab] = useState<'active' | 'history' | 'pos_history'>('active');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  const [rejectOrderPrompt, setRejectOrderPrompt] = useState<{ orderId: string; toStatus: string } | null>(null);
  const [handoverModal, setHandoverModal] = useState<OrderRecord | null>(null);
  const [handoverCodeInput, setHandoverCodeInput] = useState('');
  const [overrideUnpaid, setOverrideUnpaid] = useState(false);
  const [substituteModal, setSubstituteModal] = useState<{ orderId: string; item: OrderItem } | null>(null);
  const [substituteName, setSubstituteName] = useState('');
  const [messageText, setMessageText] = useState('');

  const { data: homeData } = useQuery({
    queryKey: QUERY_KEYS.SMO_HOME,
    queryFn: smoApi.getHome,
  });

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_ORDERS,
    queryFn: () => smoApi.listOrders(),
  });

  // Optional audio alert when new online order arrives
  const prevOnlineCount = useRef<number | null>(null);
  useEffect(() => {
    const placedCount = allOrders.filter((o) => o.channel === 'online' && o.statusCode === 'placed').length;
    if (
      prevOnlineCount.current !== null &&
      placedCount > prevOnlineCount.current &&
      homeData?.store.soundAlertsEnabled
    ) {
      playOrderBeep();
    }
    prevOnlineCount.current = placedCount;
  }, [allOrders, homeData?.store.soundAlertsEnabled]);

  const statusMetaMap = useMemo(
    () => new Map((config?.orderStatuses || []).map((s) => [s.code, s])),
    [config?.orderStatuses]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allOrders.filter((o) => {
      if (tab === 'active') {
        if (o.channel !== 'online') return false;
        if (['completed', 'cancelled', 'rejected', 'refunded'].includes(o.statusCode)) return false;
      } else if (tab === 'history') {
        if (o.channel !== 'online') return false;
        if (!['completed', 'cancelled', 'rejected', 'refunded'].includes(o.statusCode)) return false;
      } else if (tab === 'pos_history') {
        if (o.channel !== 'pos') return false;
      }
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone && o.customerPhone.includes(q))
      );
    });
  }, [allOrders, tab, search]);

  const selectedOrder = useMemo(
    () => allOrders.find((o) => o.id === selectedOrderId) || null,
    [allOrders, selectedOrderId]
  );

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDERS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_PRODUCTS });
  };

  const transitionMutation = useMutation({
    mutationFn: ({
      orderId,
      toStatus,
      reason,
      handoverCode,
      override,
    }: {
      orderId: string;
      toStatus: string;
      reason?: string;
      handoverCode?: string;
      override?: boolean;
    }) =>
      smoApi.transitionOrder(orderId, {
        toStatus,
        reason,
        handoverCode,
        overrideUnpaid: override,
      }),
    onSuccess: (updated) => {
      setRejectOrderPrompt(null);
      setHandoverModal(null);
      setHandoverCodeInput('');
      setOverrideUnpaid(false);
      showToast({ tone: 'success', message: `Order ${updated.orderNumber} updated.` });
      invalidateAll();
    },
    onError: (err: unknown) => {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Status update failed.' });
    },
  });

  const confirmPayMutation = useMutation({
    mutationFn: (paymentId: string) => smoApi.confirmPayment(paymentId),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'UPI payment confirmed.' });
      invalidateAll();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to confirm payment.' }),
  });

  const rejectPayMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      smoApi.rejectPayment(paymentId, reason),
    onSuccess: () => {
      setRejectPaymentId(null);
      showToast({ tone: 'info', message: 'UPI payment rejected. Customer notified.' });
      invalidateAll();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to reject payment.' }),
  });

  const packMutation = useMutation({
    mutationFn: ({
      orderId,
      itemId,
      action,
      packed,
      substituteName: sub,
    }: {
      orderId: string;
      itemId: string;
      action: 'toggle_pack' | 'mark_unavailable' | 'substitute';
      packed?: boolean;
      substituteName?: string;
    }) => smoApi.packOrderItem(orderId, itemId, { action, packed, substituteName: sub }),
    onSuccess: () => {
      setSubstituteModal(null);
      setSubstituteName('');
      invalidateAll();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Packing update failed.' }),
  });

  const messageMutation = useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: string }) => smoApi.sendOrderMessage(orderId, body),
    onSuccess: () => {
      setMessageText('');
      invalidateAll();
    },
  });

  const exportCsv = () => {
    const header = ['Order Number', 'Channel', 'Customer', 'Status', 'Payment Status', 'Method', 'Total', 'Date'];
    const rows = filteredOrders.map((o) => [
      o.orderNumber,
      o.channel,
      `"${o.customerName.replace(/"/g, '""')}"`,
      o.statusCode,
      o.paymentStatus,
      o.paymentMethod,
      (o.totalPaise / 100).toFixed(2),
      o.createdAt,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTransitionClick = (order: OrderRecord, toStatus: string) => {
    const meta = statusMetaMap.get(toStatus);
    if (meta?.requiresReason) {
      setRejectOrderPrompt({ orderId: order.id, toStatus });
      return;
    }
    if (toStatus === 'completed' && (order.fulfilment === 'delivery' || (order.paymentMethod === 'upi' && order.paymentStatus !== 'paid'))) {
      setHandoverModal(order);
      return;
    }
    transitionMutation.mutate({ orderId: order.id, toStatus });
  };

  const canVerifyPayment = user?.role === 'smo' || Boolean(homeData?.store.staffCanVerifyPayment);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders & Fulfilment"
        subtitle="Verify UPI payments, pack online orders, and review POS bills."
        backTo={ROUTES.OWNER_ORDERS_POS}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={() => navigate(ROUTES.OWNER_ORDERS_POS)}>
              <Receipt className="h-4 w-4" />
              Counter POS (Offline)
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          activeId={tab}
          onChange={(id) => setTab(id as 'active' | 'history' | 'pos_history')}
          options={[
            {
              id: 'active',
              label: 'Online Active',
              count: allOrders.filter(
                (o) => o.channel === 'online' && !['completed', 'cancelled', 'rejected', 'refunded'].includes(o.statusCode)
              ).length,
            },
            { id: 'history', label: 'Online History' },
            { id: 'pos_history', label: 'POS Bills' },
          ]}
        />
        <div className="w-full sm:w-64">
          <SearchBar value={search} onChange={setSearch} placeholder="Order #, customer, phone..." />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No orders here"
          description={
            tab === 'active'
              ? 'New online orders from your store QR will appear here automatically.'
              : 'No matching orders found.'
          }
          action={
            tab === 'active' ? (
              <Button variant="secondary" onClick={() => playOrderBeep()}>
                <Volume2 className="h-4 w-4" /> Test alert sound
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const meta = statusMetaMap.get(order.statusCode);
            const nextStatuses = meta?.allowedNext || [];
            const latestPayment = order.payments[0];
            const needsUpiCheck =
              order.paymentMethod === 'upi' && order.paymentStatus === 'verification_pending' && latestPayment;

            return (
              <Card key={order.id} padding="md" className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-ink-primary">{order.orderNumber}</span>
                      <StatusChip kind="order" code={order.statusCode} />
                      <StatusChip kind="payment" code={order.paymentStatus} />
                    </div>
                    <div className="text-xs text-ink-secondary mt-1">
                      {order.customerName}
                      {order.customerPhone ? ` · ${order.customerPhone}` : ''} ·{' '}
                      <span className="capitalize">{order.fulfilment}</span>
                      {order.pickupSlot ? ` (${order.pickupSlot})` : ''}
                    </div>
                    {order.deliveryAddress && (
                      <div className="text-xs text-ink-muted mt-0.5">{order.deliveryAddress}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-ink-primary">
                      <PriceText amountPaise={order.totalPaise} />
                    </div>
                    <DateTimeText iso={order.createdAt} className="text-xs text-ink-muted" />
                  </div>
                </div>

                {/* Inline UPI Verification Box */}
                {needsUpiCheck && latestPayment && (
                  <div className="rounded-lg border border-border-default bg-status-warning-bg/50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-ink-primary">UPI Ref: </span>
                        <span className="font-mono font-bold text-ink-primary">
                          {latestPayment.referenceNo || 'No ref provided'}
                        </span>
                        {latestPayment.isDuplicateRef && (
                          <span className="ml-2 inline-flex items-center gap-1 text-status-danger-fg font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> Duplicate reference!
                          </span>
                        )}
                      </div>
                      {latestPayment.proofUrl && (
                        <a
                          href={latestPayment.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-primary underline inline-flex items-center gap-1"
                        >
                          View proof <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {canVerifyPayment ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          isLoading={confirmPayMutation.isPending}
                          onClick={() => confirmPayMutation.mutate(latestPayment.id)}
                        >
                          <Check className="h-3.5 w-3.5" /> Confirm Payment
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setRejectPaymentId(latestPayment.id)}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted">Owner approval required to verify UPI payments.</p>
                    )}
                  </div>
                )}

                {/* Quick Items Summary & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-default">
                  <div className="text-xs text-ink-secondary">
                    {order.items.length} item(s):{' '}
                    {order.items
                      .slice(0, 3)
                      .map((i) => `${i.productName} ×${i.qty}`)
                      .join(', ')}
                    {order.items.length > 3 ? ` +${order.items.length - 3} more` : ''}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <Package className="h-3.5 w-3.5" />
                      Details / Pack
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(ROUTES.OWNER_BILL_VIEW.replace(':orderId', order.id))}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Bill
                    </Button>
                    {nextStatuses.map((nextCode) => {
                      const nextMeta = statusMetaMap.get(nextCode);
                      const isDanger = nextCode === 'rejected' || nextCode === 'cancelled';
                      return (
                        <Button
                          key={nextCode}
                          size="sm"
                          variant={isDanger ? 'danger' : 'primary'}
                          isLoading={transitionMutation.isPending}
                          onClick={() => handleTransitionClick(order, nextCode)}
                        >
                          {nextMeta?.label || nextCode}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Order Detail & Packing Drawer Modal */}
      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrderId(null)}
        title={selectedOrder ? `Order ${selectedOrder.orderNumber}` : 'Order'}
        size="lg"
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip kind="order" code={selectedOrder.statusCode} />
                <StatusChip kind="payment" code={selectedOrder.paymentStatus} />
                <span className="text-xs text-ink-muted uppercase">{selectedOrder.paymentMethod}</span>
              </div>
              <PriceText amountPaise={selectedOrder.totalPaise} className="text-lg font-bold" />
            </div>

            {selectedOrder.handoverCode && (
              <Alert tone="info" title="Delivery Handover PIN">
                Ask customer for their 4-digit PIN when completing delivery.
              </Alert>
            )}

            {/* Packing Checklist */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-ink-primary">Items & Packing</h3>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border-default p-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-primary">
                        {item.productName}{' '}
                        <span className="font-mono text-xs text-ink-muted">
                          ×{item.qty} {item.unitLabel}
                        </span>
                      </div>
                      <div className="text-xs text-ink-muted">
                        Pref: {item.substitutionPref.replace(/_/g, ' ')} · Status:{' '}
                        <span className="font-medium text-ink-secondary">
                          {item.availabilityStatus.replace(/_/g, ' ')}
                        </span>
                        {item.substituteName ? ` (${item.substituteName})` : ''}
                      </div>
                    </div>

                    {selectedOrder.channel === 'online' &&
                      !['completed', 'cancelled', 'rejected', 'refunded'].includes(selectedOrder.statusCode) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={item.packed ? 'primary' : 'secondary'}
                            onClick={() =>
                              packMutation.mutate({
                                orderId: selectedOrder.id,
                                itemId: item.id,
                                action: 'toggle_pack',
                                packed: !item.packed,
                              })
                            }
                          >
                            {item.packed ? 'Packed' : 'Mark Packed'}
                          </Button>
                          {item.availabilityStatus === 'available' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  packMutation.mutate({
                                    orderId: selectedOrder.id,
                                    itemId: item.id,
                                    action: 'mark_unavailable',
                                  })
                                }
                              >
                                Unavailable
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSubstituteModal({ orderId: selectedOrder.id, item })}
                              >
                                Substitute
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>

            {/* In-Order Messages */}
            <div className="space-y-2 border-t border-border-default pt-3">
              <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" /> Customer Chat
              </h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedOrder.messages.length === 0 ? (
                  <p className="text-xs text-ink-muted">No messages yet.</p>
                ) : (
                  selectedOrder.messages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-surface-subtle px-3 py-2 text-xs">
                      <span className="font-semibold text-ink-primary">{m.senderName}: </span>
                      <span className="text-ink-secondary">{m.body}</span>
                    </div>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!messageText.trim()) return;
                  messageMutation.mutate({ orderId: selectedOrder.id, body: messageText.trim() });
                }}
                className="flex gap-2"
              >
                <TextInput
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Send message to customer..."
                />
                <Button type="submit" isLoading={messageMutation.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* Timeline */}
            <div className="border-t border-border-default pt-3">
              <h3 className="text-sm font-semibold text-ink-primary mb-2">Timeline</h3>
              <StatusTimeline events={selectedOrder.events} />
            </div>
          </div>
        )}
      </Modal>

      {/* Reject UPI Reason Dialog */}
      <ConfirmDialog
        open={Boolean(rejectPaymentId)}
        onClose={() => setRejectPaymentId(null)}
        title="Reject UPI Payment"
        description="Customer will see this reason and can resubmit their reference or switch to Cash on Delivery."
        confirmLabel="Reject Payment"
        reasonLabel="Rejection Reason"
        isLoading={rejectPayMutation.isPending}
        onConfirm={(reason) => {
          if (rejectPaymentId && reason) {
            rejectPayMutation.mutate({ paymentId: rejectPaymentId, reason });
          }
        }}
      />

      {/* Reject / Cancel Order Reason Dialog */}
      <ConfirmDialog
        open={Boolean(rejectOrderPrompt)}
        onClose={() => setRejectOrderPrompt(null)}
        title="Update Order Status"
        description="Provide a clear reason for the customer. Reserved stock will be released automatically."
        confirmLabel="Confirm"
        reasonLabel="Reason"
        isLoading={transitionMutation.isPending}
        onConfirm={(reason) => {
          if (rejectOrderPrompt && reason) {
            transitionMutation.mutate({
              orderId: rejectOrderPrompt.orderId,
              toStatus: rejectOrderPrompt.toStatus,
              reason,
            });
          }
        }}
      />

      {/* Handover / Unpaid Override Modal */}
      <Modal
        open={Boolean(handoverModal)}
        onClose={() => setHandoverModal(null)}
        title="Complete Order Handover"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHandoverModal(null)}>
              Cancel
            </Button>
            <Button
              isLoading={transitionMutation.isPending}
              onClick={() => {
                if (!handoverModal) return;
                transitionMutation.mutate({
                  orderId: handoverModal.id,
                  toStatus: 'completed',
                  handoverCode: handoverCodeInput.trim() || undefined,
                  override: overrideUnpaid,
                });
              }}
            >
              Mark Completed
            </Button>
          </>
        }
      >
        {handoverModal && (
          <div className="space-y-3">
            {handoverModal.fulfilment === 'delivery' && (
              <FormField label="Customer 4-Digit Handover PIN" htmlFor="handover-pin" required>
                <TextInput
                  id="handover-pin"
                  value={handoverCodeInput}
                  onChange={(e) => setHandoverCodeInput(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                />
              </FormField>
            )}
            {handoverModal.paymentMethod === 'upi' && handoverModal.paymentStatus !== 'paid' && (
              <div className="rounded-lg border border-border-default bg-status-warning-bg p-3 text-xs space-y-2">
                <p className="font-medium text-status-warning-fg">
                  UPI payment is not marked paid yet.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideUnpaid}
                    onChange={(e) => setOverrideUnpaid(e.target.checked)}
                  />
                  <span>Override unpaid check & complete anyway</span>
                </label>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Substitute Item Modal */}
      <Modal
        open={Boolean(substituteModal)}
        onClose={() => setSubstituteModal(null)}
        title="Suggest / Mark Substitute"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubstituteModal(null)}>
              Cancel
            </Button>
            <Button
              disabled={!substituteName.trim()}
              onClick={() => {
                if (!substituteModal) return;
                packMutation.mutate({
                  orderId: substituteModal.orderId,
                  itemId: substituteModal.item.id,
                  action: 'substitute',
                  substituteName: substituteName.trim(),
                });
              }}
            >
              Save Substitute
            </Button>
          </>
        }
      >
        <FormField label="Substitute Item Name" htmlFor="sub-name" required>
          <TextInput
            id="sub-name"
            value={substituteName}
            onChange={(e) => setSubstituteName(e.target.value)}
            placeholder="e.g. Heritage Toned Milk 500ml"
          />
        </FormField>
      </Modal>
    </div>
  );
}
