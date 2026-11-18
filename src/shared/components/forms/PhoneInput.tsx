import React, { forwardRef } from 'react';

export const PhoneInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function PhoneInput({ hasError, className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="numeric"
      maxLength={10}
      className={`w-full min-h-[44px] rounded-lg border bg-surface-card px-3 py-2 text-sm font-mono tabular-nums text-ink-primary placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
        hasError ? 'border-status-danger-fg' : 'border-border-strong'
      } ${className}`}
      {...rest}
    />
  );
});
