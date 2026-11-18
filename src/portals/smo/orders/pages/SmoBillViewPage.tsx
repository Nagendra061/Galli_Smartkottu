import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, RotateCcw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { smoApi } from '../../services/smoApi';

export function SmoBillViewPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);

  const { data: order, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_ORDER(orderId),
    queryFn: () => smoApi.getOrder(orderId),
    enabled: Boolean(orderId),
  });

  const { data: homeData } = useQuery({
    queryKey: QUERY_KEYS.SMO_HOME,
    queryFn: smoApi.getHome,
  });

  const refundMutation = useMutation({
    mutationFn: () => smoApi.refundOrder(orderId, { reason: refundReason.trim(), restoreStock }),
    onSuccess: () => {
      setRefundOpen(false);
      setRefundReason('');
      showToast({ tone: 'success', message: 'Bill voided / refunded.' });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDER(orderId) });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDERS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Refund failed.' }),
  });

  const shareBill = async () => {
    if (!order) return;
    const text = `${homeData?.store.name || ''} Bill ${order.orderNumber}\nTotal: ${(order.totalPaise / 100).toFixed(2)}\nItems: ${order.items.length}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bill ${order.orderNumber}`, text });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    showToast({ tone: 'success', message: 'Bill summary copied to clipboard.' });
  };

  if (isLoading || !order) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.OWNER_ORDERS_ONLINE)}>
          <ArrowLeft className="h-4 w-4" /> Back to Orders
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void shareBill()}>
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          {user?.role === 'smo' && order.statusCode !== 'refunded' && order.statusCode !== 'cancelled' && (
            <Button variant="danger" size="sm" onClick={() => setRefundOpen(true)}>
              <RotateCcw className="h-4 w-4" /> Void / Refund
            </Button>
          )}
        </div>
      </div>

      <Card padding="lg" className="space-y-4">
        <div className="text-center border-b border-border-default pb-3">
          <h1 className="text-lg font-bold text-ink-primary">{homeData?.store.name}</h1>
          {homeData?.store.address && <p className="text-xs text-ink-secondary">{homeData.store.address}</p>}
          {homeData?.store.gstNumber && (
            <p className="text-xs font-mono text-ink-muted">GSTIN: {homeData.store.gstNumber}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <div className="font-mono font-bold text-sm text-ink-primary">{order.orderNumber}</div>
            <DateTimeText iso={order.createdAt} className="text-ink-muted" />
          </div>
          <div className="flex items-center gap-2">
            <StatusChip kind="order" code={order.statusCode} />
            <StatusChip kind="payment" code={order.paymentStatus} />
          </div>
        </div>

        <div className="text-xs text-ink-secondary">
          Customer: <span className="font-medium text-ink-primary">{order.customerName}</span>
          {order.customerPhone ? ` · ${order.customerPhone}` : ''}
        </div>

        <div className="border-t border-b border-border-default py-3 space-y-2 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-ink-primary truncate">{item.productName}</div>
                <div className="text-xs text-ink-muted font-mono">
                  {item.qty} {item.unitLabel} × <PriceText amountPaise={item.unitPricePaise} />
                </div>
              </div>
              <PriceText amountPaise={item.lineTotalPaise} className="font-medium shrink-0" />
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-ink-secondary">
            <span>Subtotal</span>
            <PriceText amountPaise={order.subtotalPaise} />
          </div>
          {order.discountPaise > 0 && (
            <div className="flex justify-between text-status-success-fg">
              <span>Discount</span>
              <PriceText amountPaise={-order.discountPaise} />
            </div>
          )}
          {order.deliveryFeePaise > 0 && (
            <div className="flex justify-between text-ink-secondary">
              <span>Delivery Fee</span>
              <PriceText amountPaise={order.deliveryFeePaise} />
            </div>
          )}
          <div className="flex justify-between text-xs text-ink-muted">
            <span>Included GST</span>
            <PriceText amountPaise={order.taxPaise} />
          </div>
          <div className="flex justify-between text-base font-bold text-ink-primary pt-2 border-t border-border-default">
            <span>Total</span>
            <PriceText amountPaise={order.totalPaise} />
          </div>
          <div className="flex justify-between text-xs text-ink-muted pt-1">
            <span>Payment Method</span>
            <span className="uppercase">{order.paymentMethod}</span>
          </div>
        </div>
      </Card>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Void / Refund Bill"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={refundReason.trim().length < 3}
              isLoading={refundMutation.isPending}
              onClick={() => refundMutation.mutate()}
            >
              Confirm Refund
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Reason" htmlFor="ref-reason" required>
            <TextInput
              id="ref-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Wrong item billed"
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-ink-primary cursor-pointer">
            <input
              type="checkbox"
              checked={restoreStock}
              onChange={(e) => setRestoreStock(e.target.checked)}
            />
            <span>Restore billed item quantities to inventory</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
