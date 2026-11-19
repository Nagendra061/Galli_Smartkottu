import { useNavigate, useParams } from 'react-router-dom';
import { NotificationList } from '../../../../shared/components/feedback/NotificationList';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { ROUTES } from '../../../../shared/config/routes';

export function CustomerNotificationsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Order updates and key milestones."
      />
      <NotificationList
        onSelectNotification={(item) => {
          if (item.entityType === 'order' && item.entityId && slug) {
            navigate(
              ROUTES.STORE_ORDER_TRACK.replace(':slug', slug).replace(':orderId', item.entityId)
            );
          }
        }}
      />
    </div>
  );
}
