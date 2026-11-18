import { CheckCircle2 } from 'lucide-react';
import { useBootstrapConfig } from '../../hooks/useBootstrapConfig';
import type { OrderEvent } from '../../types';
import { DateTimeText } from './DateTimeText';

export function StatusTimeline({ events }: { events: OrderEvent[] }) {
  const { data: config } = useBootstrapConfig();

  const resolveLabel = (code: string) => {
    const found = config?.orderStatuses.find((s) => s.code === code);
    return found ? found.label : code.replace(/_/g, ' ');
  };

  return (
    <ol className="space-y-3">
      {events.map((ev, idx) => (
        <li key={ev.id} className="flex items-start gap-3">
          <div className="mt-0.5 flex flex-col items-center">
            <CheckCircle2
              className={`h-4 w-4 ${idx === events.length - 1 ? 'text-accent-primary' : 'text-ink-muted'}`}
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">{resolveLabel(ev.toStatus)}</span>
              <DateTimeText iso={ev.createdAt} className="text-xs text-ink-muted" />
            </div>
            {ev.reason && <p className="text-xs text-ink-secondary mt-0.5">{ev.reason}</p>}
            <p className="text-xs text-ink-muted mt-0.5">{ev.actorName}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
