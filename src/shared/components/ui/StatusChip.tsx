import { AlertCircle, CheckCircle2, Clock, Info, XCircle } from 'lucide-react';
import { useBootstrapConfig } from '../../hooks/useBootstrapConfig';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-subtle text-ink-secondary border-border-default',
  info: 'bg-status-info-bg text-status-info-fg border-border-default',
  warning: 'bg-status-warning-bg text-status-warning-fg border-border-default',
  success: 'bg-status-success-bg text-status-success-fg border-border-default',
  danger: 'bg-status-danger-bg text-status-danger-fg border-border-default',
};

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (tone === 'warning') return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (tone === 'info') return <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  return <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

export function StatusChip({
  kind,
  code,
  overrideLabel,
  overrideTone,
}: {
  kind: 'order' | 'payment' | 'custom';
  code: string;
  overrideLabel?: string;
  overrideTone?: Tone;
}) {
  const { data: config } = useBootstrapConfig();

  let label = overrideLabel || code;
  let tone: Tone = overrideTone || 'neutral';

  if (kind === 'order' && config) {
    const found = config.orderStatuses.find((s) => s.code === code);
    if (found) {
      label = found.label;
      tone = found.tone;
    }
  } else if (kind === 'payment' && config) {
    const found = config.paymentStatuses.find((s) => s.code === code);
    if (found) {
      label = found.label;
      tone = found.tone;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${TONE_CLASSES[tone]}`}
    >
      <ToneIcon tone={tone} />
      <span>{label}</span>
    </span>
  );
}
