export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2.5 min-h-[44px] max-w-full text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-accent-primary' : 'bg-surface-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface-card transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
      <span className="text-sm font-medium text-ink-primary leading-snug break-words">{label}</span>
    </button>
  );
}
