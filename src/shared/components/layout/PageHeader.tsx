import { ArrowLeft } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function PageHeader({
  title,
  subtitle,
  backTo,
  actions,
}: {
  title: string;
  subtitle?: string;
  backTo?: string | number;
  actions?: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5 min-w-0">
        {backTo !== undefined && (
          <button
            type="button"
            onClick={() => (typeof backTo === 'number' ? navigate(backTo) : navigate(backTo))}
            aria-label="Go back"
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink-primary truncate">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
