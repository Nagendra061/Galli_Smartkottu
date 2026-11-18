import React from 'react';
import { Card } from '../ui/Card';

export function StatCard({
  label,
  value,
  subtext,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const valueTone =
    tone === 'success'
      ? 'text-status-success-fg'
      : tone === 'warning'
        ? 'text-status-warning-fg'
        : tone === 'danger'
          ? 'text-status-danger-fg'
          : 'text-ink-primary';

  return (
    <Card padding="md" className="flex flex-col justify-between gap-1.5">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <div className={`text-xl font-bold tracking-tight tabular-nums ${valueTone}`}>{value}</div>
      {subtext && <div className="text-xs text-ink-muted">{subtext}</div>}
    </Card>
  );
}
