import React from 'react';
import { Inbox } from 'lucide-react';
import { Button } from '../ui/Button';

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-card px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-ink-muted">
        {icon || <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-secondary">{description}</p>
      {action ? (
        <div className="mt-4">{action}</div>
      ) : actionLabel && onAction ? (
        <div className="mt-4">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message = 'Something went wrong while fetching this view.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-status-danger-fg/25 bg-status-danger-bg px-6 py-8 text-center">
      <h3 className="text-base font-semibold text-status-danger-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-secondary">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} aria-hidden="true" />;
}
