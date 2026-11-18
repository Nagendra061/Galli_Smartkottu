import { Eye, EyeOff } from 'lucide-react';
import React, { forwardRef, useState } from 'react';

export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }
>(function PasswordInput({ hasError, className = '', ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={`w-full min-h-[44px] rounded-lg border bg-surface-card pl-3 pr-11 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
          hasError ? 'border-status-danger-fg' : 'border-border-strong'
        } ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide secret' : 'Show secret'}
        className="absolute right-0 top-0 h-[44px] w-[44px] flex items-center justify-center text-ink-muted hover:text-ink-primary cursor-pointer"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
