import { QrCode } from 'lucide-react';

export function QrDisplay({
  src,
  alt,
  caption,
  size = 'md',
}: {
  src: string | null | undefined;
  alt: string;
  caption?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'sm' ? 'h-32 w-32' : size === 'lg' ? 'h-56 w-56' : 'h-44 w-44';
  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-xl border border-border-default bg-surface-card p-3">
      {src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className={`${dim} object-contain rounded-lg bg-surface-card`}
        />
      ) : (
        <div
          className={`${dim} flex flex-col items-center justify-center rounded-lg bg-surface-subtle text-ink-muted`}
        >
          <QrCode className="h-10 w-10 mb-1" aria-hidden="true" />
          <span className="text-xs">No QR</span>
        </div>
      )}
      {caption && <span className="text-xs text-ink-secondary text-center">{caption}</span>}
    </div>
  );
}
