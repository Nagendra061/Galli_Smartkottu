import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { OfflineBanner } from '../feedback/OfflineBanner';

export interface NavDestination {
  id: string;
  label: string;
  to: string;
  icon: React.ReactNode;
  matchPrefix?: string;
}

export function AppShell({
  brandTitle,
  brandLink,
  brandLogo,
  navItems,
  topRight,
  offlineQueueCount = 0,
  banner,
  floatingAction,
  accentStyle,
  children,
}: {
  brandTitle: string;
  brandLink: string;
  brandLogo?: React.ReactNode;
  navItems: NavDestination[];
  topRight?: React.ReactNode;
  offlineQueueCount?: number;
  banner?: React.ReactNode;
  floatingAction?: React.ReactNode;
  accentStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const location = useLocation();

  const isActive = (item: NavDestination) => {
    if (item.matchPrefix) {
      return location.pathname === item.to || location.pathname.startsWith(item.matchPrefix);
    }
    return location.pathname === item.to;
  };

  return (
    <div style={accentStyle} className="min-h-screen flex flex-col bg-surface-canvas text-ink-primary">
      <OfflineBanner queuedCount={offlineQueueCount} />
      {banner}

      <div className="flex-1 flex min-w-0">
        {/* Desktop / Tablet Sidebar */}
        {navItems.length > 0 && (
          <aside className="hidden md:flex md:w-60 md:flex-col md:shrink-0 border-r border-border-default bg-surface-card sticky top-0 h-screen">
            <div className="h-14 px-4 flex items-center border-b border-border-default">
              <Link
                to={brandLink}
                className="flex items-center min-w-0"
                aria-label={brandTitle}
              >
                {brandLogo ? (
                  brandLogo
                ) : (
                  <span className="font-display text-base font-bold tracking-tight text-ink-primary truncate">
                    {brandTitle}
                  </span>
                )}
              </Link>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Primary navigation">
              {navItems.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent-primary'
                        : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-[var(--z-sticky)] h-14 bg-surface-card/95 backdrop-blur-sm border-b border-border-default px-4 flex items-center justify-between gap-4">
            <Link
              to={brandLink}
              className="md:hidden flex items-center min-w-0"
              aria-label={brandTitle}
            >
              {brandLogo ? (
                brandLogo
              ) : (
                <span className="font-display text-base font-bold tracking-tight text-ink-primary truncate">
                  {brandTitle}
                </span>
              )}
            </Link>
            <div className="hidden md:block text-sm font-medium text-ink-secondary truncate">
              {navItems.find((i) => isActive(i))?.label || brandTitle}
            </div>
            <div className="flex items-center gap-2 shrink-0">{topRight}</div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-4 pb-6 md:pb-8 min-w-0">
            {children}
          </main>
        </div>
      </div>

      {floatingAction && (
        <div className="fixed right-4 bottom-24 md:bottom-6 z-[var(--z-nav)]">{floatingAction}</div>
      )}

      {/* Mobile Sticky Floating Navigation */}
      {navItems.length > 0 && (
        <div className="md:hidden sticky bottom-3 z-[var(--z-nav)] px-3 pb-[env(safe-area-inset-bottom)] pointer-events-none">
          <nav
            aria-label="Mobile navigation"
            className="pointer-events-auto mx-auto max-w-lg rounded-[15px] bg-surface-card/95 backdrop-blur-md border border-border-default/90 shadow-[0_8px_28px_-4px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.06)] px-1.5 py-1"
          >
            <div
              className="grid items-center h-14"
              style={{ gridTemplateColumns: `repeat(${Math.min(5, navItems.length)}, minmax(0, 1fr))` }}
            >
              {navItems.slice(0, 5).map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`flex flex-col items-center justify-center min-h-[44px] px-1 rounded-[10px] text-[11px] font-medium transition-colors ${
                      active
                        ? 'text-accent-primary bg-accent-soft/60'
                        : 'text-ink-muted hover:text-ink-primary hover:bg-surface-subtle/60'
                    }`}
                  >
                    <span className="h-5 w-5 flex items-center justify-center">{item.icon}</span>
                    <span className="mt-0.5 truncate max-w-full">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
