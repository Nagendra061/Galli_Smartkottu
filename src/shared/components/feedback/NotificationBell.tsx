import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { useBootstrapConfig } from '../../hooks/useBootstrapConfig';
import { useNotifications } from '../../hooks/useNotifications';

export function NotificationBell({ onClick }: { onClick: () => void }) {
  const { unreadCount } = useNotifications('all');
  const { data: config } = useBootstrapConfig();
  const appName = config?.appSettings.appName || '';

  useEffect(() => {
    if (!appName) return;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${appName}` : appName;
  }, [unreadCount, appName]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Notifications (${unreadCount} unread)`}
      className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary transition-colors cursor-pointer"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-status-danger-fg text-ink-inverse text-[10px] font-mono font-bold flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
