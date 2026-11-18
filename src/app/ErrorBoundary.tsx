import React from 'react';
import { Button } from '../shared/components/ui/Button';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; homePath?: string },
  State
> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || 'Unexpected rendering error.' };
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-border-default bg-surface-card p-6 text-center space-y-3">
            <h2 className="font-display text-lg font-bold text-ink-primary">Something went wrong</h2>
            <p className="text-sm text-ink-secondary">{this.state.message}</p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button fullWidth onClick={() => this.setState({ hasError: false, message: '' })}>
                Retry
              </Button>
              <Button
                fullWidth
                variant="secondary"
                onClick={() => {
                  window.location.href = this.props.homePath || '/';
                }}
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
