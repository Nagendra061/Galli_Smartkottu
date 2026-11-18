export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'default',
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const barColor =
    tone === 'success'
      ? 'bg-status-success-fg'
      : tone === 'warning'
      ? 'bg-status-warning-fg'
      : tone === 'danger'
      ? 'bg-status-danger-fg'
      : 'bg-accent-primary';
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-xs text-ink-secondary">
          <span>{label}</span>
          <span className="font-mono">
            {value} / {max}
          </span>
        </div>
      )}
      <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden">
        <div className={`h-full ${barColor} transition-all duration-200`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
