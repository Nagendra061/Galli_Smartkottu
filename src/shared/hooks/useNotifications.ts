import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../config/queryKeys';
import type { NotificationItem } from '../types';
import { apiFetch } from '../utils/apiClient';
import { useAuth } from './useAuth';

export function useNotifications(filter: 'all' | 'unread' = 'all') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<{ unreadCount: number; items: NotificationItem[] }>({
    queryKey: [...QUERY_KEYS.NOTIFICATIONS, filter],
    queryFn: () => apiFetch(`/notifications?filter=${filter}`),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch(`/notifications/read-all`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS }),
  });

  return {
    unreadCount: query.data?.unreadCount ?? 0,
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    markRead,
    markAllRead,
    remove,
  };
}
