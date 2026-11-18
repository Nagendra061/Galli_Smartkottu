export function DateTimeText({
  iso,
  mode = 'datetime',
  className = '',
}: {
  iso: string | null | undefined;
  mode?: 'date' | 'time' | 'datetime';
  className?: string;
}) {
  if (!iso) return <span className={`text-ink-muted ${className}`}>-</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className={className}>{iso}</span>;

  const text =
    mode === 'date'
      ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : mode === 'time'
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });

  return <time dateTime={iso} className={`tabular-nums ${className}`}>{text}</time>;
}
