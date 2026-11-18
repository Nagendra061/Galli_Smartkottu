import { ShieldAlert, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../config/routes';
import { useI18n } from '../../i18n/I18nContext';
import { Button } from '../ui/Button';

export function NoAccessPage({ homeRoute = ROUTES.HOME }: { homeRoute?: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-border-default bg-surface-card p-6 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-status-danger-bg text-status-danger-fg flex items-center justify-center">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink-primary">{t('auth.noAccessTitle')}</h1>
        <p className="text-sm text-ink-secondary">{t('auth.noAccessBody')}</p>
        <div className="pt-2">
          <Button fullWidth onClick={() => navigate(homeRoute)}>
            {t('action.goHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage({ homeRoute = ROUTES.HOME }: { homeRoute?: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-border-default bg-surface-card p-6 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-surface-subtle text-ink-muted flex items-center justify-center">
          <Compass className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink-primary">{t('error.notFoundTitle')}</h1>
        <p className="text-sm text-ink-secondary">{t('error.notFoundBody')}</p>
        <div className="pt-2">
          <Button fullWidth onClick={() => navigate(homeRoute)}>
            {t('action.goHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
