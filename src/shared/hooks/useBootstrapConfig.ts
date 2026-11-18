import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '../config/queryKeys';
import type { BootstrapConfig } from '../types';
import { apiFetch } from '../utils/apiClient';

export function useBootstrapConfig() {
  return useQuery<BootstrapConfig>({
    queryKey: QUERY_KEYS.BOOTSTRAP,
    queryFn: () => apiFetch<BootstrapConfig>('/public/bootstrap', { skipSessionModal: true }),
    staleTime: 60_000,
  });
}
