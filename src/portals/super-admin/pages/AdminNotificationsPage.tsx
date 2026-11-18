import { useNavigate } from 'react-router-dom';
import { NotificationList } from '../../../shared/components/feedback/NotificationList';
import { PageHeader } from '../../../shared/components/layout/PageHeader';
import { ROUTES } from '../../../shared/config/routes';

export function AdminNotificationsPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" subtitle="Platform alerts, SLA notices, and ticket activity." />
      <NotificationList
        onSelectNotification={(item) => {
          if (item.entityType === 'ticket') navigate(ROUTES.ADMIN_SUPPORT);
          else if (item.entityType === 'store') navigate(ROUTES.ADMIN_STORES);
        }}
      />
    </div>
  );
}
