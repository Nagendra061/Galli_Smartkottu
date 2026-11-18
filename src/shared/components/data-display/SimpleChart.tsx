export function SimpleChart({
  data,
}: {
  data: { label: string; value: number; formatted?: string }[];
}) {
  if (!data.length) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = Math.max(2, Math.round((d.value / maxVal) * 100));
        return (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-secondary truncate">{d.label}</span>
              <span className="font-mono tabular-nums font-medium text-ink-primary">
                {d.formatted ?? d.value}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-subtle overflow-hidden">
              <div className="h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
