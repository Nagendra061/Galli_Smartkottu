import { useBootstrapConfig } from '../../hooks/useBootstrapConfig';

export function PriceText({
  amountPaise,
  className = '',
  showSign = false,
}: {
  amountPaise: number;
  className?: string;
  showSign?: boolean;
}) {
  const { data } = useBootstrapConfig();
  const symbol = data?.appSettings.currencySymbol || '';
  const absVal = Math.abs(amountPaise) / 100;
  const formatted = absVal.toLocaleString('en-IN', {
    minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const sign = amountPaise < 0 ? '-' : showSign && amountPaise > 0 ? '+' : '';

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {sign}
      {symbol}
      {formatted}
    </span>
  );
}
