import { CheckCircle2, Info, X, XCircle, AlertTriangle } from 'lucide-react';
import React, { createContext, useCallback, useContext, useState } from 'react';

export interface ToastOptions {
  tone?: 'success' | 'info' | 'warning' | 'error';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (opts: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = { ...opts, id, tone: opts.tone ?? 'info' };
      setToasts((prev) => [...prev.slice(-3), item]);
      const ms = opts.durationMs ?? (opts.actionLabel ? 5000 : 3500);
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto z-[var(--z-toast)] flex flex-col gap-2 md:w-96 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-[var(--shadow-overlay)] bg-surface-card ${
              t.tone === 'success'
                ? 'border-status-success-fg/30 text-ink-primary'
                : t.tone === 'error'
                  ? 'border-status-danger-fg/30 text-ink-primary'
                  : t.tone === 'warning'
                    ? 'border-status-warning-fg/30 text-ink-primary'
                    : 'border-border-strong text-ink-primary'
            }`}
          >
            {t.tone === 'success' && <CheckCircle2 className="h-4 w-4 text-status-success-fg shrink-0" />}
            {t.tone === 'error' && <XCircle className="h-4 w-4 text-status-danger-fg shrink-0" />}
            {t.tone === 'warning' && <AlertTriangle className="h-4 w-4 text-status-warning-fg shrink-0" />}
            {t.tone === 'info' && <Info className="h-4 w-4 text-status-info-fg shrink-0" />}
            <span className="text-sm flex-1 min-w-0">{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="text-xs font-semibold text-accent-primary hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-ink-muted hover:text-ink-primary p-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
