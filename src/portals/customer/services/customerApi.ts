import { apiFetch, generateIdempotencyKey } from '../../../shared/utils/apiClient';
import type {
  AuthUser,
  Brand,
  Category,
  KhataAccount,
  KhataEntry,
  Offer,
  OrderRecord,
  Product,
  StoreSummary,
} from '../../../shared/types';

export interface PublicStoreResponse {
  store: StoreSummary;
  categories: Category[];
  brands: Brand[];
  products: Product[];
  offers: Offer[];
  qrDataUrl: string;
}

export interface CartQuoteResponse {
  items: {
    productId: string;
    productName: string;
    unitLabel: string;
    qty: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }[];
  subtotalPaise: number;
  savingsPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  minOrderPaise: number;
  meetsMinOrder: boolean;
  deliveryRadiusKm?: number;
  deliveryDistanceKm?: number | null;
  isWithinDeliveryRange?: boolean | null;
  conflicts: {
    productId: string;
    productName: string;
    issue: 'out_of_stock' | 'insufficient_stock' | 'price_changed' | 'unavailable';
    availableQty: number;
    newPricePaise: number;
  }[];
}

export const customerApi = {
  getPublicStore: (slug: string) => apiFetch<PublicStoreResponse>(`/public/stores/${slug}`),
  trackQrScan: (slug: string, params: { utmSource?: string; utmMedium?: string; utmCampaign?: string }) =>
    apiFetch('/public/qr-scan', {
      method: 'POST',
      body: JSON.stringify({ slug, ...params }),
    }),

  identifyPhone: (phone: string) =>
    apiFetch<{ exists: boolean; hasPin: boolean; name: string | null }>('/auth/customer/identify', {
      method: 'POST',
      body: JSON.stringify({ phone }),
      skipSessionModal: true,
    }),

  verifyPin: (phone: string, pin: string, name?: string) =>
    apiFetch<{ token: string; user: AuthUser }>('/auth/customer/pin', {
      method: 'POST',
      body: JSON.stringify({ phone, pin, name }),
      skipSessionModal: true,
    }),

  geocodeAddress: (q: string) =>
    apiFetch<{ results: { displayName: string; lat: number; lng: number }[]; unavailable?: boolean }>(
      `/public/geocode?q=${encodeURIComponent(q)}`
    ),

  quoteCart: (payload: {
    storeId: string;
    fulfilment: 'pickup' | 'delivery';
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    deliveryDistanceKm?: number | null;
    items: { productId: string; qty: number; expectedPricePaise?: number }[];
  }) =>
    apiFetch<CartQuoteResponse>('/customer/checkout/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createOrder: (
    payload: {
      storeId: string;
      fulfilment: 'pickup' | 'delivery';
      pickupSlot?: string | null;
      deliveryAddress?: string | null;
      deliveryLat?: number | null;
      deliveryLng?: number | null;
      deliveryDistanceKm?: number | null;
      paymentMethod: 'upi' | 'pay_at_pickup' | 'cash' | 'khata';
      items: { productId: string; qty: number; substitutionPref?: 'call_me' | 'replace' | 'remove' }[];
      notes?: string;
    },
    idempotencyKey?: string
  ) =>
    apiFetch<OrderRecord>('/customer/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: idempotencyKey || generateIdempotencyKey(),
    }),

  listOrders: (storeId?: string) =>
    apiFetch<OrderRecord[]>(`/customer/orders${storeId ? `?storeId=${storeId}` : ''}`),
  getOrder: (orderId: string) => apiFetch<OrderRecord>(`/customer/orders/${orderId}`),
  getUpiIntent: (orderId: string) =>
    apiFetch<{
      upiUri: string | null;
      generatedQrDataUrl: string | null;
      uploadedQrUrl: string | null;
      upiId: string | null;
      payeeName: string | null;
      requireReference: boolean;
    }>(`/customer/orders/${orderId}/upi-intent`),

  submitUpiReference: (orderId: string, payload: { referenceNo: string; proofUrl?: string | null }) =>
    apiFetch<{ paymentId: string; status: string }>(`/customer/orders/${orderId}/payment-reference`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  switchToCash: (orderId: string) =>
    apiFetch<OrderRecord>(`/customer/orders/${orderId}/switch-cash`, { method: 'POST' }),

  cancelOrder: (orderId: string, reason?: string) =>
    apiFetch<OrderRecord>(`/customer/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  respondUnavailable: (orderId: string, decision: 'approve' | 'cancel') =>
    apiFetch<OrderRecord>(`/customer/orders/${orderId}/unavailable-response`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  sendMessage: (orderId: string, body: string) =>
    apiFetch<OrderRecord>(`/customer/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  rateOrder: (orderId: string, rating: number, feedback: string) =>
    apiFetch<OrderRecord>(`/customer/orders/${orderId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    }),

  listAddresses: () =>
    apiFetch<
      {
        id: string;
        label: string;
        addressLine: string;
        landmark: string;
        latitude: number | null;
        longitude: number | null;
        isDefault: number;
      }[]
    >('/customer/addresses'),
  addAddress: (payload: {
    label: string;
    addressLine: string;
    landmark?: string;
    latitude?: number | null;
    longitude?: number | null;
  }) =>
    apiFetch<
      {
        id: string;
        label: string;
        addressLine: string;
        landmark: string;
        latitude: number | null;
        longitude: number | null;
        isDefault: number;
      }[]
    >('/customer/addresses', { method: 'POST', body: JSON.stringify(payload) }),
  deleteAddress: (id: string) => apiFetch(`/customer/addresses/${id}`, { method: 'DELETE' }),

  listFavourites: (storeId: string) => apiFetch<string[]>(`/customer/favourites?storeId=${storeId}`),
  toggleFavourite: (storeId: string, productId: string) =>
    apiFetch<string[]>('/customer/favourites/toggle', {
      method: 'POST',
      body: JSON.stringify({ storeId, productId }),
    }),

  getKhata: (storeId: string) =>
    apiFetch<{ account: KhataAccount; entries: KhataEntry[] } | null>(`/customer/khata/${storeId}`),

  deleteMyData: () => apiFetch('/customer/my-data', { method: 'DELETE' }),
};
