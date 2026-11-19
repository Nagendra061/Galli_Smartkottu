import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Printer,
  Send,
  Star,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DateTimeText } from '../../../../shared/components/data-display/DateTimeText';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { QrDisplay } from '../../../../shared/components/data-display/QrDisplay';
import { StatusTimeline } from '../../../../shared/components/data-display/StatusTimeline';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog';
import { Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { ImageUploader } from '../../../../shared/components/forms/ImageUploader';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { customerApi } from '../../services/customerApi';

export function CustomerOrderTrackPage() {
  const { slug = '', orderId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [referenceNo, setReferenceNo] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [feedback, setFeedback] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_ORDER(orderId),
    queryFn: () => customerApi.getOrder(orderId),
    enabled: Boolean(orderId && user?.role === 'customer'),
    refetchInterval: 8000,
  });

  const needsUpiPayment =
    order?.paymentMethod === 'upi' &&
    (order.paymentStatus === 'unpaid' || order.paymentStatus === 'rejected');

  const { data: upiIntent } = useQuery({
    queryKey: ['customer', 'upi-intent', orderId],
    queryFn: () => customerApi.getUpiIntent(orderId),
    enabled: Boolean(order && needsUpiPayment),
  });

  const refreshOrder = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ORDER(orderId) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ORDERS(slug) });
  };

  const submitUpiMutation = useMutation({
    mutationFn: () => customerApi.submitUpiReference(orderId, { referenceNo: referenceNo.trim(), proofUrl }),
    onSuccess: () => {
      setReferenceNo('');
      setProofUrl(null);
      showToast({ tone: 'success', message: 'UPI payment submitted for store verification.' });
      refreshOrder();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Submission failed.' }),
  });

  const switchCashMutation = useMutation({
    mutationFn: () => customerApi.switchToCash(orderId),
    onSuccess: () => {
      showToast({ tone: 'info', message: 'Switched payment to Cash.' });
      refreshOrder();
    },
  });

  const unavailableMutation = useMutation({
    mutationFn: (decision: 'approve' | 'cancel') => customerApi.respondUnavailable(orderId, decision),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Response sent to store.' });
      refreshOrder();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => customerApi.cancelOrder(orderId, reason),
    onSuccess: () => {
      setCancelConfirmOpen(false);
      showToast({ tone: 'info', message: 'Order cancelled.' });
      refreshOrder();
    },
  });

  const messageMutation = useMutation({
    mutationFn: () => customerApi.sendMessage(orderId, messageBody.trim()),
    onSuccess: () => {
      setMessageBody('');
      refreshOrder();
    },
  });

  const rateMutation = useMutation({
    mutationFn: () => customerApi.rateOrder(orderId, ratingVal, feedback.trim()),
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Thanks for rating!' });
      refreshOrder();
    },
  });

  if (isLoading || !order) {
    return <Skeleton className="h-64 w-full" />;
  }

  const latestPayment = order.payments[0];
  const hasPendingUnavailable = order.items.some((i) => i.availabilityStatus === 'unavailable_pending');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(ROUTES.STORE_ORDERS.replace(':slug', slug))}
        >
          <ArrowLeft className="h-4 w-4" /> My Orders
        </Button>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print Bill
        </Button>
      </div>

      {/* Header Summary */}
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold font-mono text-ink-primary">{order.orderNumber}</h1>
              <StatusChip kind="order" code={order.statusCode} />
              <StatusChip kind="payment" code={order.paymentStatus} />
            </div>
            <DateTimeText iso={order.createdAt} className="text-xs text-ink-muted" />
          </div>
          <PriceText amountPaise={order.totalPaise} className="text-xl font-bold text-ink-primary" />
        </div>

        {order.handoverCode && !['completed', 'cancelled', 'rejected'].includes(order.statusCode) && (
          <Alert tone="info" title="Delivery Handover PIN">
            Share PIN <span className="font-mono font-bold text-base">{order.handoverCode}</span> when your delivery arrives.
          </Alert>
        )}

        {hasPendingUnavailable && (
          <Alert tone="warning" title="Some items are unavailable">
            <p className="text-xs mb-2">
              The store marked one or more items unavailable. Approve the updated total or cancel your order.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => unavailableMutation.mutate('approve')}>
                Approve Updated Order
              </Button>
              <Button size="sm" variant="danger" onClick={() => unavailableMutation.mutate('cancel')}>
                Cancel Order
              </Button>
            </div>
          </Alert>
        )}
      </Card>

      {/* UPI Payment Screen */}
      {needsUpiPayment && (
        <Card padding="md" className="space-y-4">
          {order.paymentStatus === 'rejected' && latestPayment?.rejectReason && (
            <Alert tone="danger" title="UPI Payment Rejected">
              {latestPayment.rejectReason}. Resubmit a valid UPI reference or switch to Cash.
            </Alert>
          )}

          <div className="text-center space-y-3">
            <h2 className="text-base font-semibold text-ink-primary">Complete UPI Payment</h2>
            <div className="text-2xl font-bold text-ink-primary">
              <PriceText amountPaise={order.totalPaise} />
            </div>
            <QrDisplay
              src={upiIntent?.uploadedQrUrl || upiIntent?.generatedQrDataUrl}
              alt="Store UPI QR"
              caption={upiIntent?.upiId ? `UPI ID: ${upiIntent.upiId} (${upiIntent.payeeName || ''})` : undefined}
              size="lg"
            />
            {upiIntent?.upiUri && (
              <div>
                <a
                  href={upiIntent.upiUri}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-accent-primary text-ink-inverse text-sm font-medium"
                >
                  Open UPI App <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border-default pt-3">
            <FormField
              label="UPI Reference / UTR Number"
              htmlFor="upi-ref"
              required={upiIntent?.requireReference ?? true}
              hint="Enter the 12-digit UTR or transaction reference from your UPI app."
            >
              <TextInput
                id="upi-ref"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. 412345678901"
              />
            </FormField>

            <ImageUploader
              label="Upload payment screenshot (optional)"
              value={proofUrl}
              onChange={setProofUrl}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                fullWidth
                isLoading={submitUpiMutation.isPending}
                onClick={() => submitUpiMutation.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" /> I Have Paid
              </Button>
              {order.paymentStatus === 'rejected' && (
                <Button
                  fullWidth
                  variant="secondary"
                  isLoading={switchCashMutation.isPending}
                  onClick={() => switchCashMutation.mutate()}
                >
                  Switch to Cash / Pay at Store
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {order.paymentMethod === 'upi' && order.paymentStatus === 'verification_pending' && (
        <Alert tone="info" title="Payment Verification Pending">
          Store owner is verifying your UPI reference ({latestPayment?.referenceNo || 'submitted'}).
        </Alert>
      )}

      {/* Items List */}
      <Card padding="md" className="space-y-2.5">
        <h2 className="text-sm font-semibold text-ink-primary">Order Items</h2>
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 text-sm border-b border-border-default pb-2 last:border-0 last:pb-0">
            <div>
              <div className="font-medium text-ink-primary">
                {item.productName}{' '}
                <span className="text-xs font-mono text-ink-muted">
                  ×{item.qty} {item.unitLabel}
                </span>
              </div>
              {item.availabilityStatus !== 'available' && (
                <div className="text-xs text-status-warning-fg flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {item.availabilityStatus.replace(/_/g, ' ')}
                  {item.substituteName ? ` → ${item.substituteName}` : ''}
                </div>
              )}
            </div>
            <PriceText amountPaise={item.lineTotalPaise} className="font-semibold" />
          </div>
        ))}
        <div className="border-t border-border-default pt-2 space-y-1 text-xs">
          <div className="flex justify-between text-ink-secondary">
            <span>Subtotal</span>
            <PriceText amountPaise={order.subtotalPaise} />
          </div>
          {order.deliveryFeePaise > 0 && (
            <div className="flex justify-between text-ink-secondary">
              <span>Delivery Fee</span>
              <PriceText amountPaise={order.deliveryFeePaise} />
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-ink-primary pt-1">
            <span>Total</span>
            <PriceText amountPaise={order.totalPaise} />
          </div>
        </div>
      </Card>

      {/* Cancel Order before acceptance */}
      {order.statusCode === 'placed' && (
        <div className="flex justify-end print:hidden">
          <Button variant="danger" size="sm" onClick={() => setCancelConfirmOpen(true)}>
            Cancel Order
          </Button>
        </div>
      )}

      {/* Live Timeline */}
      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary">Order Timeline</h2>
        <StatusTimeline events={order.events} />
      </Card>

      {/* In-Order Chat */}
      <Card padding="md" className="space-y-3 print:hidden">
        <h2 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" /> Message Store
        </h2>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {order.messages.length === 0 ? (
            <p className="text-xs text-ink-muted">No messages yet.</p>
          ) : (
            order.messages.map((m) => (
              <div key={m.id} className="rounded-lg bg-surface-subtle px-3 py-2 text-xs">
                <span className="font-semibold text-ink-primary">{m.senderName}: </span>
                <span className="text-ink-secondary">{m.body}</span>
              </div>
            ))
          )}
        </div>
        {order.statusCode === 'completed' || order.statusCode === 'cancelled' || order.statusCode === 'rejected' ? (
          <div className="rounded-lg bg-surface-subtle p-3 text-center text-xs text-ink-muted">
            Chat is disabled because this order is {order.statusCode}.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!messageBody.trim()) return;
              messageMutation.mutate();
            }}
            className="flex gap-2"
          >
            <TextInput
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Ask about delivery or items..."
            />
            <Button type="submit" isLoading={messageMutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </Card>

      {/* Rating after completion */}
      {order.statusCode === 'completed' && !order.rating && (
        <Card padding="md" className="space-y-3 print:hidden">
          <h2 className="text-sm font-semibold text-ink-primary">Rate your order</h2>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatingVal(n)}
                className="p-1.5 cursor-pointer"
                aria-label={`Rate ${n} stars`}
              >
                <Star
                  className={`h-6 w-6 ${
                    n <= ratingVal ? 'fill-status-warning-fg text-status-warning-fg' : 'text-ink-muted'
                  }`}
                />
              </button>
            ))}
          </div>
          <TextInput
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Optional feedback..."
          />
          <Button size="sm" isLoading={rateMutation.isPending} onClick={() => rateMutation.mutate()}>
            Submit Rating
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        title="Cancel this order?"
        description="The store hasn't accepted it yet. Reserved items will be released."
        confirmLabel="Cancel Order"
        isLoading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate('Cancelled by customer')}
      />
    </div>
  );
}
