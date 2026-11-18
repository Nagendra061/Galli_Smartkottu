import { useBootstrapConfig } from '../../hooks/useBootstrapConfig';

export function MoneyInput({
  valuePaise,
  onChangePaise,
  id,
  placeholder = '0.00',
  disabled = false,
  hasError = false,
}: {
  valuePaise: number;
  onChangePaise: (paise: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const { data } = useBootstrapConfig();
  const symbol = data?.appSettings.currencySymbol || '';
  const displayValue = valuePaise === 0 ? '' : String(valuePaise / 100);

  return (
    <div className="relative">
      {symbol && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-ink-muted">
          {symbol}
        </span>
      )}
      <input
        id={id}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value);
          onChangePaise(Number.isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100));
        }}
        className={`w-full min-h-[44px] rounded-lg border bg-surface-card ${
          symbol ? 'pl-8' : 'pl-3'
        } pr-3 py-2 text-sm font-mono tabular-nums text-ink-primary placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ${
          hasError ? 'border-status-danger-fg' : 'border-border-strong'
        }`}
      />
    </div>
  );
}
