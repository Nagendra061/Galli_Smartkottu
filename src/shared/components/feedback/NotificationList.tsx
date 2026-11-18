import { CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import type { NotificationItem } from '../../types';
import { DateTimeText } from '../data-display/DateTimeText';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { EmptyState, Skeleton } from './EmptyState';

export function NotificationList({
  onSelectNotification,
}: {
  onSelectNotification?: (item: NotificationItem) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { items, unreadCount, isLoading, markRead, markAllRead, remove } = useNotifications(filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          options={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread', count: unreadCount },
          ]}
          activeId={filter}
          onChange={(id) => setFilter(id === 'unread' ? 'unread' : 'all')}
        />
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllRead.mutate()}
            isLoading={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Updates about orders, payments, stock, and reminders appear here."
        />
      ) : (
        <div className="divide-y divide-border-default rounded-xl border border-border-default bg-surface-card overflow-hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 p-3.5 transition-colors ${
                item.readAt ? 'bg-surface-card' : 'bg-accent-soft/60'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (!item.readAt) markRead.mutate(item.id);
                  onSelectNotification?.(item);
                }}
                className="flex-1 text-left min-w-0 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-primary truncate">{item.title}</span>
                  <DateTimeText iso={item.createdAt} className="text-xs text-ink-muted shrink-0" />
                </div>
                <p className="text-xs text-ink-secondary mt-1">{item.body}</p>
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(item.id)}
                aria-label="Delete notification"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-ink-muted hover:text-status-danger-fg hover:bg-surface-subtle cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
