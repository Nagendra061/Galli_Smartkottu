export interface TabOption {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  options,
  activeId,
  onChange,
  className = '',
}: {
  options: TabOption[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 overflow-x-auto rounded-lg bg-surface-subtle p-1 border border-border-default ${className}`}
    >
      {options.map((opt) => {
        const active = opt.id === activeId;
        return (
          <button
            key={opt.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              active
                ? 'bg-[#0f716a] text-ink-inverse shadow-xs'
                : 'text-ink-secondary hover:text-[#0f716a] hover:bg-surface-card/70'
            }`}
          >
            {opt.label}
            {opt.count !== undefined ? ` (${opt.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}
