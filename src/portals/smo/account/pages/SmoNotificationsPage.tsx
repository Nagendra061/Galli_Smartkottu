import { NotificationList } from '../../../../shared/components/feedback/NotificationList';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';

export function SmoNotificationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Store Notifications"
        subtitle="New online orders, UPI submissions, low stock warnings, and Khata alerts."
      />
      <NotificationList />
    </div>
  );
}
