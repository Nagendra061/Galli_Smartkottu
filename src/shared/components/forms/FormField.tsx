import React from 'react';

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-primary">
        {label}
        {required && <span className="text-status-danger-fg ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-status-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
