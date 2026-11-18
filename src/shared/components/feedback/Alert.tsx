import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import React from 'react';

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className = '',
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const styles =
    tone === 'success'
      ? 'bg-status-success-bg text-status-success-fg border-status-success-fg/20'
      : tone === 'warning'
        ? 'bg-status-warning-bg text-status-warning-fg border-status-warning-fg/20'
        : tone === 'danger'
          ? 'bg-status-danger-bg text-status-danger-fg border-status-danger-fg/20'
          : 'bg-status-info-bg text-status-info-fg border-status-info-fg/20';

  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'danger'
          ? XCircle
          : Info;

  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${styles} ${className}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
