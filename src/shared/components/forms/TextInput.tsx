import React, { forwardRef } from 'react';

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function TextInput({ hasError, className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`w-full min-h-[44px] rounded-lg border bg-surface-card px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-primary disabled:opacity-50 ${
        hasError ? 'border-status-danger-fg' : 'border-border-strong'
      } ${className}`}
      {...rest}
    />
  );
});
