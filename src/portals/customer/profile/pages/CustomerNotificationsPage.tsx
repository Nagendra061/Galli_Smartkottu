import { NotificationList } from '../../../../shared/components/feedback/NotificationList';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';

export function CustomerNotificationsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Order updates, payment confirmations, and Khata alerts."
      />
      <NotificationList />
    </div>
  );
}
