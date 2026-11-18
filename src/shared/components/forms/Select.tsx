import React, { forwardRef } from 'react';

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
>(function Select({ hasError, className = '', children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={`w-full min-h-[44px] rounded-lg border bg-surface-card px-3 py-2 text-sm text-ink-primary focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
        hasError ? 'border-status-danger-fg' : 'border-border-strong'
      } ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(function Textarea({ hasError, className = '', ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={`w-full rounded-lg border bg-surface-card px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
        hasError ? 'border-status-danger-fg' : 'border-border-strong'
      } ${className}`}
      {...rest}
    />
  );
});
