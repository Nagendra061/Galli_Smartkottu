import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useI18n } from '../../i18n/I18nContext';

export function OfflineBanner({ queuedCount = 0 }: { queuedCount?: number }) {
  const isOnline = useOnlineStatus();
  const { t } = useI18n();

  if (isOnline && queuedCount === 0) return null;

  return (
    <div
      role="status"
      className="w-full bg-status-warning-bg border-b border-status-warning-fg/20 px-4 py-2 text-xs font-medium text-status-warning-fg flex items-center justify-center gap-2"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {!isOnline
          ? t('offline.banner')
          : `${queuedCount} offline POS bill(s) waiting to sync.`}
      </span>
    </div>
  );
}
