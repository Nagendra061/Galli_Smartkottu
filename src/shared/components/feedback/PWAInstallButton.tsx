import { Download } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Button } from '../ui/Button';
import { Modal } from './Modal';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => void install()}>
        <Download className="h-4 w-4" />
        <span>Install App</span>
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => setIosGuideOpen(true)}>
          <Download className="h-4 w-4" />
          <span>Install</span>
        </Button>
        <Modal
          open={iosGuideOpen}
          onClose={() => setIosGuideOpen(false)}
          title="Install on iPhone or iPad"
          size="sm"
          footer={
            <Button fullWidth variant="secondary" onClick={() => setIosGuideOpen(false)}>
              Close
            </Button>
          }
        >
          <ol className="space-y-2 text-sm text-ink-secondary list-decimal pl-5">
            <li>Tap the Share button in Safari.</li>
            <li>Scroll down and tap Add to Home Screen.</li>
          </ol>
        </Modal>
      </>
    );
  }

  return null;
}
