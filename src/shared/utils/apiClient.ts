import { ENV } from '../config/env';
import { STORAGE_KEYS } from '../config/routes';
import type { ApiErrorPayload } from '../types';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly fields?: Record<string, string>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.status = status;
    this.code = payload.code;
    this.fields = payload.fields;
  }
}

type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionExpired(cb: SessionListener): () => void {
  sessionListeners.add(cb);
  return () => {
    sessionListeners.delete(cb);
  };
}

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

export function setStoredAuth(token: string | null, user: unknown | null): void {
  if (token && user) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
  }
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string; skipSessionModal?: boolean } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  let res: Response;
  try {
    res = await fetch(`${ENV.API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiClientError(0, {
      code: 'NETWORK_ERROR',
      message: 'Network connection lost. Please check your internet and try again.',
    });
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const errPayload = (parsed as ApiErrorPayload | null) || {
      code: 'HTTP_ERROR',
      message: res.statusText || 'Request failed.',
    };
    if (res.status === 401 && token && !options.skipSessionModal) {
      for (const cb of sessionListeners) cb();
    }
    throw new ApiClientError(res.status, errPayload);
  }

  return parsed as T;
}
