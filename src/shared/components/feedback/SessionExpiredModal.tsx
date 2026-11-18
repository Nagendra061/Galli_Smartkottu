import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES, STORAGE_KEYS } from '../../config/routes';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../i18n/I18nContext';
import { Button } from '../ui/Button';
import { Modal } from './Modal';

export function SessionExpiredModal() {
  const { sessionExpiredOpen, setSessionExpiredOpen, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const handleGoToLogin = () => {
    sessionStorage.setItem(STORAGE_KEYS.RETURN_TO_PATH, location.pathname + location.search);
    const role = user?.role;
    logout();
    setSessionExpiredOpen(false);
    if (role === 'super_admin' || location.pathname.startsWith('/admin')) {
      navigate(ROUTES.ADMIN_LOGIN);
    } else if (role === 'smo' || role === 'staff' || location.pathname.startsWith('/owner')) {
      navigate(ROUTES.OWNER_LOGIN);
    } else {
      navigate(ROUTES.HOME);
    }
  };

  return (
    <Modal
      open={sessionExpiredOpen}
      onClose={handleGoToLogin}
      title={t('auth.sessionExpiredTitle')}
      size="sm"
      footer={
        <Button fullWidth onClick={handleGoToLogin}>
          {t('action.signIn')}
        </Button>
      }
    >
      <p className="text-sm text-ink-secondary">{t('auth.sessionExpiredBody')}</p>
    </Modal>
  );
}
