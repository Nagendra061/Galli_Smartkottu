import { STORAGE_KEYS } from '../config/routes';

export interface QueuedPosBill {
  idempotencyKey: string;
  queuedAt: string;
  payload: Record<string, unknown>;
  label: string;
  totalPaise: number;
  lastError?: string;
}

export function readOfflinePosQueue(): QueuedPosBill[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_POS_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedPosBill[];
  } catch {
    return [];
  }
}

export function writeOfflinePosQueue(items: QueuedPosBill[]): void {
  localStorage.setItem(STORAGE_KEYS.OFFLINE_POS_QUEUE, JSON.stringify(items));
}

export function enqueueOfflinePosBill(item: QueuedPosBill): QueuedPosBill[] {
  const current = readOfflinePosQueue();
  if (current.some((q) => q.idempotencyKey === item.idempotencyKey)) {
    return current;
  }
  const next = [item, ...current];
  writeOfflinePosQueue(next);
  return next;
}

export function removeOfflinePosBill(idempotencyKey: string): QueuedPosBill[] {
  const next = readOfflinePosQueue().filter((q) => q.idempotencyKey !== idempotencyKey);
  writeOfflinePosQueue(next);
  return next;
}
