export function QuantityText({
  qty,
  unitLabel,
  className = '',
}: {
  qty: number;
  unitLabel?: string | null;
  className?: string;
}) {
  const clean = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, '');
  return (
    <span className={`tabular-nums ${className}`}>
      {clean}
      {unitLabel ? ` ${unitLabel}` : ''}
    </span>
  );
}
