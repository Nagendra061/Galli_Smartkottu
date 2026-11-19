import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ENV } from '../config/env';
import { QUERY_KEYS } from '../config/queryKeys';
import { useAuth } from './useAuth';

interface RealtimePayload {
  type: string;
  storeId?: string | null;
  storeSlug?: string | null;
  recipientId?: string | null;
  entityId?: string | null;
}

export function useRealtimeSync(onOrderNew?: (payload: RealtimePayload) => void): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByUnmount = false;
    let attempt = 0;

    const connect = () => {
      if (closedByUnmount) return;

      let wsUrl = '';
      if (ENV.WS_URL) {
        wsUrl = ENV.WS_URL;
      } else if (ENV.API_BASE_URL.startsWith('http')) {
        try {
          const parsed = new URL(ENV.API_BASE_URL);
          const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${proto}//${parsed.host}/ws`;
        } catch {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${proto}//${window.location.host}/ws`;
        }
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${window.location.host}/ws`;
      }

      try {
        socket = new WebSocket(wsUrl);
      } catch {
        return;
      }

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as RealtimePayload;
          if (msg.type === 'config.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.BOOTSTRAP });
          } else if (msg.type === 'store.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_STORE_SETTINGS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STORES });
            if (msg.storeSlug) {
              void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PUBLIC_STORE(msg.storeSlug) });
            } else {
              void queryClient.invalidateQueries({ queryKey: ['public', 'store'] });
            }
          } else if (msg.type === 'catalog.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_PRODUCTS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_OFFERS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_CATEGORIES });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_MOVEMENTS });
            void queryClient.invalidateQueries({ queryKey: ['public', 'store'] });
          } else if (msg.type === 'order.created' || msg.type === 'order.updated' || msg.type === 'payment.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDERS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_SUMMARY });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_FINANCE_UPI });
            void queryClient.invalidateQueries({ queryKey: ['smo', 'order'] });
            void queryClient.invalidateQueries({ queryKey: ['customer', 'orders'] });
            void queryClient.invalidateQueries({ queryKey: ['customer', 'order'] });
            if (msg.type === 'order.created' && onOrderNew) {
              onOrderNew(msg);
            }
          } else if (msg.type === 'khata.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS });
            void queryClient.invalidateQueries({ queryKey: ['smo', 'khata'] });
            void queryClient.invalidateQueries({ queryKey: ['customer', 'khata'] });
          } else if (msg.type === 'ticket.updated') {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_TICKETS });
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_TICKETS });
          } else if (msg.type === 'notification.created') {
            if (!msg.recipientId || msg.recipientId === user?.id) {
              void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS });
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (closedByUnmount) return;
        attempt += 1;
        // If connection fails repeatedly (e.g. backend not running or no WebSocket endpoint), stop aggressive reconnect
        if (attempt > 3) {
          // Retry every 30 seconds quietly instead of rapid spamming
          reconnectTimer = window.setTimeout(connect, 30000);
          return;
        }
        const delay = Math.min(10000, 1000 * Math.pow(2, attempt));
        reconnectTimer = window.setTimeout(connect, delay);
      };
      socket.onerror = () => {
        // Suppress unhandled exceptions to avoid cluttering the console
      };
    };

    connect();

    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      closedByUnmount = true;
      window.removeEventListener('focus', onFocus);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient, user?.id, onOrderNew]);
}
