import { Minus, Plus } from 'lucide-react';

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  size = 'md',
  allowDecimal: _allowDecimal,
}: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
  allowDecimal?: boolean;
}) {
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div className="inline-flex items-center rounded-lg border border-border-strong bg-surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={`${dim} flex items-center justify-center text-ink-primary hover:bg-surface-subtle disabled:opacity-40 cursor-pointer`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[2.5rem] text-center text-sm font-mono tabular-nums font-semibold text-ink-primary px-1">
        {Number.isInteger(value) ? value : value.toFixed(2)}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={`${dim} flex items-center justify-center text-ink-primary hover:bg-surface-subtle disabled:opacity-40 cursor-pointer`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
