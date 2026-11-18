import { apiFetch } from '../../../shared/utils/apiClient';
import type { AuthUser, BootstrapConfig, StoreSummary } from '../../../shared/types';

export interface AdminDashboardData {
  totalStores: number;
  activeStores: number;
  ordersToday: number;
  gmvTodayPaise: number;
  totalQrScans: number;
  openTickets: number;
  topStores: (StoreSummary & {
    ownerName: string;
    orderCount: number;
    productCount: number;
    gmvPaise: number;
  })[];
  systemHealth: { api: string; database: string; automation: string };
}

export interface AdminStoreRow extends StoreSummary {
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  productCount: number;
  orderCount: number;
  gmvPaise: number;
}

export interface PlanItem {
  id: string;
  name: string;
  tagline: string;
  maxProducts: number;
  maxStaff: number;
  maxMonthlyOrders: number;
  pricePaise: number;
  billingCycle: 'monthly' | 'yearly';
  isActive: number;
}

export const adminApi = {
  login: (identifier: string, password: string) =>
    apiFetch<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, portal: 'admin' }),
      skipSessionModal: true,
    }),
  getDashboard: () => apiFetch<AdminDashboardData>('/admin/dashboard'),
  listStores: () => apiFetch<AdminStoreRow[]>('/admin/stores'),
  createStore: (payload: Record<string, unknown>) =>
    apiFetch<StoreSummary>('/admin/stores', { method: 'POST', body: JSON.stringify(payload) }),
  setStoreStatus: (id: string, payload: { status: 'active' | 'suspended'; reason?: string; supportContact?: string }) =>
    apiFetch<StoreSummary>(`/admin/stores/${id}/status`, { method: 'POST', body: JSON.stringify(payload) }),
  regenerateQr: (id: string) =>
    apiFetch<StoreSummary>(`/admin/stores/${id}/regenerate-qr`, { method: 'POST' }),
  impersonateStore: (id: string) =>
    apiFetch<{ store: StoreSummary; snapshot: Record<string, number>; productsCount: number; recentOrders: unknown[] }>(
      `/admin/stores/${id}/impersonate`
    ),
  assignPlan: (storeId: string, planId: string) =>
    apiFetch<StoreSummary>(`/admin/stores/${storeId}/plan`, { method: 'POST', body: JSON.stringify({ planId }) }),
  listPlans: () => apiFetch<PlanItem[]>('/admin/plans'),
  createPlan: (payload: Record<string, unknown>) =>
    apiFetch<PlanItem>('/admin/plans', { method: 'POST', body: JSON.stringify(payload) }),
  listMasterCatalogue: () => apiFetch<Record<string, unknown>[]>('/admin/master-catalogue'),
  createMasterProduct: (payload: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>[]>('/admin/master-catalogue', { method: 'POST', body: JSON.stringify(payload) }),
  updateAppSettings: (payload: Record<string, unknown>) =>
    apiFetch<BootstrapConfig>('/admin/config/app-settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  updateOrderStatus: (code: string, payload: { label: string; tone?: string }) =>
    apiFetch<BootstrapConfig>(`/admin/config/order-statuses/${code}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  upsertFaq: (payload: { id?: string; question: string; answer: string; category: string }) =>
    apiFetch<BootstrapConfig>('/admin/config/faqs', { method: 'POST', body: JSON.stringify(payload) }),
  deleteFaq: (id: string) => apiFetch<BootstrapConfig>(`/admin/config/faqs/${id}`, { method: 'DELETE' }),
  toggleFeatureFlag: (key: string, enabled: boolean) =>
    apiFetch<BootstrapConfig>(`/admin/config/feature-flags/${key}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  listTickets: () => apiFetch<Record<string, unknown>[]>('/admin/tickets'),
  replyTicket: (id: string, payload: { body?: string; status?: string; internalNotes?: string }) =>
    apiFetch<Record<string, unknown>[]>(`/admin/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify(payload) }),
  getAnalytics: () =>
    apiFetch<{ byDay: { day: string; orders: number; gmvPaise: number }[]; qrScans: number; onlineOrders: number }>(
      '/admin/analytics'
    ),
  listAuditLogs: () => apiFetch<Record<string, unknown>[]>('/admin/audit-logs'),
  listDeletions: () => apiFetch<Record<string, unknown>[]>('/admin/deletions'),
  processDeletion: (id: string, action: 'restore' | 'finalise') =>
    apiFetch<Record<string, unknown>[]>(`/admin/deletions/${id}/process`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  listAutomations: () => apiFetch<Record<string, unknown>[]>('/admin/automations'),
  runAutomation: (key: string) => apiFetch<Record<string, unknown>[]>(`/admin/automations/${key}/run`, { method: 'POST' }),
  toggleAutomation: (key: string, enabled: boolean) =>
    apiFetch<Record<string, unknown>[]>(`/admin/automations/${key}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  listAdminUsers: () => apiFetch<Record<string, unknown>[]>('/admin/users'),
  createAdminUser: (payload: { name: string; email: string; password: string }) =>
    apiFetch<Record<string, unknown>[]>('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
};
