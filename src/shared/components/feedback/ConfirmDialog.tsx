import { useState } from 'react';
import { TextInput } from '../forms/TextInput';
import { Button } from '../ui/Button';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'danger',
  isLoading = false,
  typeToConfirm,
  reasonLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  isLoading?: boolean;
  typeToConfirm?: string;
  reasonLabel?: string;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');

  const canConfirm =
    (!typeToConfirm || typed.trim() === typeToConfirm) && (!reasonLabel || reason.trim().length >= 3);

  return (
    <Modal
      open={open}
      onClose={() => {
        setTyped('');
        setReason('');
        onClose();
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setTyped('');
              setReason('');
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant={variant}
            isLoading={isLoading}
            disabled={!canConfirm}
            onClick={() => {
              onConfirm(reasonLabel ? reason.trim() : undefined);
              setTyped('');
              setReason('');
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-secondary">{description}</p>
        {reasonLabel && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink-primary">{reasonLabel}</label>
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason (required)"
            />
          </div>
        )}
        {typeToConfirm && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-ink-primary">
              Type <span className="font-mono font-bold">{typeToConfirm}</span> to confirm
            </label>
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typeToConfirm}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
