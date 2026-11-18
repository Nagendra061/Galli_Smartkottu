import { ArrowRight, QrCode, ShieldCheck, Store } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PWAInstallButton } from '../shared/components/feedback/PWAInstallButton';
import { Skeleton } from '../shared/components/feedback/EmptyState';
import { TextInput } from '../shared/components/forms/TextInput';
import { Button } from '../shared/components/ui/Button';
import { Card } from '../shared/components/ui/Card';
import { ENV } from '../shared/config/env';
import { ROUTES } from '../shared/config/routes';
import { useBootstrapConfig } from '../shared/hooks/useBootstrapConfig';

export function PortalHubPage() {
  const { data: config, isLoading } = useBootstrapConfig();
  const navigate = useNavigate();
  const [slugInput, setSlugInput] = useState('');

  const appName = config?.appSettings.appName || ENV.APP_NAME_FALLBACK || '';
  const appSlogan = config?.appSettings.appSlogan || '';
  const defaultSlug = config?.seededStoreSlug || '';

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col">
      <header className="border-b border-border-default bg-surface-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <span className="font-display text-lg font-bold tracking-tight text-ink-primary whitespace-nowrap shrink-0">
            {isLoading ? '...' : appName}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.OWNER_LOGIN)}>
              Owner Sign in
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 md:py-14 space-y-10">
        <section className="max-w-2xl space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-5 w-full max-w-lg" />
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-ink-primary">
                {appName}
              </h1>
              <p className="text-base text-ink-secondary leading-relaxed">{appSlogan}</p>
            </>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Customer Storefront */}
          <Card padding="lg" className="flex flex-col justify-between gap-5">
            <div className="space-y-2.5">
              <div className="h-10 w-10 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <QrCode className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-ink-primary">Customer Storefront</h2>
              <p className="text-sm text-ink-secondary">
                Browse products, view offers, pay by UPI QR, track live order status, and check Khata balance.
              </p>
            </div>
            <div className="space-y-2.5">
              {defaultSlug && (
                <Button fullWidth onClick={() => navigate(`/store/${defaultSlug}`)}>
                  <span>Open Store</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = slugInput.trim().toLowerCase();
                  if (clean) navigate(`/store/${clean}`);
                }}
                className="flex gap-2"
              >
                <TextInput
                  placeholder="Enter store slug..."
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                />
                <Button type="submit" variant="secondary" disabled={!slugInput.trim()}>
                  Go
                </Button>
              </form>
            </div>
          </Card>

          {/* SMO Portal */}
          <Card padding="lg" className="flex flex-col justify-between gap-5">
            <div className="space-y-2.5">
              <div className="h-10 w-10 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <Store className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-ink-primary">
                Super Market Owner
              </h2>
              <p className="text-sm text-ink-secondary">
                Fast offline POS billing, live online orders with UPI verification, inventory, Khata ledger, and financial advisor.
              </p>
            </div>
            <Button fullWidth variant="secondary" onClick={() => navigate(ROUTES.OWNER_LOGIN)}>
              <span>Open Owner Portal</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>

          {/* Super Admin Portal */}
          <Card padding="lg" className="flex flex-col justify-between gap-5">
            <div className="space-y-2.5">
              <div className="h-10 w-10 rounded-lg bg-accent-soft text-accent-primary flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg font-semibold text-ink-primary">Super Admin</h2>
              <p className="text-sm text-ink-secondary">
                Onboard stores, configure statuses, plans and FAQs, review support tickets, audit logs, and automations.
              </p>
            </div>
            <Button fullWidth variant="secondary" onClick={() => navigate(ROUTES.ADMIN_LOGIN)}>
              <span>Open Admin Portal</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        </section>
      </main>
    </div>
  );
}
