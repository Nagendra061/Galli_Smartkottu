import { Upload, X } from 'lucide-react';
import React, { useState } from 'react';
import { apiFetch } from '../../utils/apiClient';

export function ImageUploader({
  value,
  onChange,
  label = 'Upload image',
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPG, and WebP images are supported.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be 2 MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ url: string }>('/uploads/image', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      onChange(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-flex items-center gap-3 rounded-lg border border-border-default bg-surface-subtle p-2">
          <img
            src={value}
            alt={label}
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-md object-cover bg-surface-card"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-[40px] px-2.5 text-xs font-medium text-status-danger-fg hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-dashed border-border-strong bg-surface-card text-sm font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-subtle cursor-pointer">
          <Upload className="h-4 w-4" />
          <span>{uploading ? 'Uploading...' : label}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void handleFile(e)}
            disabled={uploading}
            className="sr-only"
          />
        </label>
      )}
      {error && <p className="text-xs font-medium text-status-danger-fg">{error}</p>}
    </div>
  );
}
