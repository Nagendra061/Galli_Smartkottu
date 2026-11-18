import { apiFetch, generateIdempotencyKey } from '../../../shared/utils/apiClient';
import type {
  AuthUser,
  Brand,
  Category,
  InventoryPredictions,
  KhataAccount,
  KhataEntry,
  Offer,
  OrderRecord,
  Product,
  StoreSummary,
} from '../../../shared/types';

export interface SmoHomeSnapshot {
  todaySalesPaise: number;
  todayOrderCount: number;
  cashTodayPaise: number;
  upiTodayPaise: number;
  pendingOnline: number;
  awaitingVerification: number;
  lowStockCount: number;
  nearExpiryCount: number;
  khataDuesCount: number;
}

export const smoApi = {
  login: (identifier: string, password: string) =>
    apiFetch<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, portal: 'owner' }),
      skipSessionModal: true,
    }),

  getHome: () => apiFetch<{ store: StoreSummary; snapshot: SmoHomeSnapshot }>('/owner/home'),

  // Orders & POS
  listOrders: (channel?: 'pos' | 'online') =>
    apiFetch<OrderRecord[]>(`/owner/orders${channel ? `?channel=${channel}` : ''}`),
  getOrder: (id: string) => apiFetch<OrderRecord>(`/owner/orders/${id}`),
  createPosBill: (payload: Record<string, unknown>, idempotencyKey?: string) =>
    apiFetch<OrderRecord>('/owner/pos/bills', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: idempotencyKey || generateIdempotencyKey(),
    }),
  listHeldBills: () =>
    apiFetch<{ id: string; label: string; payload: Record<string, unknown>; createdAt: string }[]>(
      '/owner/pos/held'
    ),
  holdBill: (label: string, payload: unknown) =>
    apiFetch('/owner/pos/held', { method: 'POST', body: JSON.stringify({ label, payload }) }),
  deleteHeldBill: (id: string) => apiFetch(`/owner/pos/held/${id}`, { method: 'DELETE' }),
  transitionOrder: (
    orderId: string,
    payload: { toStatus: string; reason?: string; handoverCode?: string; overrideUnpaid?: boolean }
  ) =>
    apiFetch<OrderRecord>(`/owner/orders/${orderId}/transition`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  packOrderItem: (
    orderId: string,
    itemId: string,
    payload: { action: 'toggle_pack' | 'mark_unavailable' | 'substitute'; packed?: boolean; substituteName?: string }
  ) =>
    apiFetch<OrderRecord>(`/owner/orders/${orderId}/items/${itemId}/pack`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendOrderMessage: (orderId: string, body: string) =>
    apiFetch<OrderRecord>(`/owner/orders/${orderId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  refundOrder: (orderId: string, payload: { reason: string; restoreStock: boolean }) =>
    apiFetch<OrderRecord>(`/owner/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmPayment: (paymentId: string) =>
    apiFetch(`/owner/payments/${paymentId}/confirm`, { method: 'POST' }),
  rejectPayment: (paymentId: string, reason: string) =>
    apiFetch(`/owner/payments/${paymentId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Inventory
  listProducts: (includeArchived = false) =>
    apiFetch<Product[]>(`/owner/products?includeArchived=${includeArchived}`),
  listMasterProducts: () =>
    apiFetch<
      {
        id: string;
        name: string;
        categoryName: string;
        brandName: string;
        unitCode: string;
        taxRatePercent: number;
        barcode: string | null;
        mrpPaise: number;
      }[]
    >('/owner/master-products'),
  createProduct: (payload: Record<string, unknown>) =>
    apiFetch<Product>('/owner/products', { method: 'POST', body: JSON.stringify(payload) }),
  importProductsBulk: (rows: Record<string, unknown>[]) =>
    apiFetch<{ importedCount: number; skippedCount: number; errors: string[] }>('/owner/products/import', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  getInventoryPredictions: () => apiFetch<InventoryPredictions>('/owner/inventory/predictions'),
  updateProduct: (id: string, payload: Record<string, unknown>) =>
    apiFetch<Product>(`/owner/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  archiveProduct: (id: string, archive: boolean) =>
    apiFetch(`/owner/products/${id}/archive`, { method: 'POST', body: JSON.stringify({ archive }) }),
  listCategories: () => apiFetch<Category[]>('/owner/categories'),
  createCategory: (name: string) =>
    apiFetch<Category>('/owner/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, name: string) =>
    apiFetch<Category>(`/owner/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  listBrands: () => apiFetch<Brand[]>('/owner/brands'),
  createBrand: (name: string) =>
    apiFetch<Brand>('/owner/brands', { method: 'POST', body: JSON.stringify({ name }) }),
  updateBrand: (id: string, name: string) =>
    apiFetch<Brand>(`/owner/brands/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  listOffers: () => apiFetch<Offer[]>('/owner/offers'),
  createOffer: (payload: {
    title: string;
    offerType: 'percent' | 'flat' | 'combo' | 'bogo';
    discountValue: number;
    minQty?: number;
    productIds: string[];
  }) => apiFetch<Offer>('/owner/offers', { method: 'POST', body: JSON.stringify(payload) }),
  toggleOffer: (id: string, isActive: boolean) =>
    apiFetch(`/owner/offers/${id}/toggle`, { method: 'POST', body: JSON.stringify({ isActive }) }),
  listMovements: () =>
    apiFetch<
      {
        id: string;
        productId: string;
        productName: string;
        movementType: string;
        qtyDelta: number;
        qtyAfter: number;
        reason: string;
        actorName: string;
        createdAt: string;
      }[]
    >('/owner/stock/movements'),
  adjustStock: (payload: {
    productId: string;
    movementType: 'stock_in' | 'adjustment' | 'stock_take' | 'damaged';
    qtyDelta?: number;
    countedQty?: number;
    reason: string;
    supplierId?: string;
    invoiceNo?: string;
    totalCostPaise?: number;
  }) => apiFetch('/owner/stock/adjust', { method: 'POST', body: JSON.stringify(payload) }),
  listSuppliers: () =>
    apiFetch<{ id: string; name: string; phone: string; gstNo: string | null; payablePaise: number }[]>(
      '/owner/suppliers'
    ),
  createSupplier: (payload: { name: string; phone?: string; gstNo?: string }) =>
    apiFetch('/owner/suppliers', { method: 'POST', body: JSON.stringify(payload) }),

  // Finance
  getFinanceSummary: (from?: string, to?: string) =>
    apiFetch<{
      range: { fromDate: string; toDate: string };
      orderCount: number;
      revenuePaise: number;
      cogsPaise: number;
      grossProfitPaise: number;
      expensesPaise: number;
      netProfitPaise: number;
      taxCollectedPaise: number;
      taxBySlab: { ratePercent: number; taxPaise: number; salesPaise: number }[];
      categoryMargins: { category: string; revenuePaise: number; costPaise: number; marginPercent: number }[];
      khataReceivablePaise: number;
      supplierPayablePaise: number;
      expectedCash30dPaise: number;
    }>(`/owner/finance/summary${from && to ? `?from=${from}&to=${to}` : ''}`),
  getClosings: (date?: string) =>
    apiFetch<{
      closingDate: string;
      cashSalesPaise: number;
      upiVerifiedPaise: number;
      cardSalesPaise: number;
      khataGivenPaise: number;
      expensesPaise: number;
      history: {
        id: string;
        closingDate: string;
        openingCashPaise: number;
        cashSalesPaise: number;
        upiVerifiedPaise: number;
        expensesPaise: number;
        expectedCashPaise: number;
        actualCashPaise: number;
        differencePaise: number;
        note: string;
        createdAt: string;
      }[];
    }>(`/owner/finance/closings${date ? `?date=${date}` : ''}`),
  submitClosing: (payload: {
    closingDate: string;
    openingCashPaise: number;
    actualCashPaise: number;
    note?: string;
  }) => apiFetch('/owner/finance/closings', { method: 'POST', body: JSON.stringify(payload) }),
  listExpenses: () =>
    apiFetch<
      {
        id: string;
        category: string;
        title: string;
        amountPaise: number;
        expenseDate: string;
        isRecurring: number;
        notes: string;
      }[]
    >('/owner/finance/expenses'),
  createExpense: (payload: {
    category: string;
    title: string;
    amountPaise: number;
    expenseDate: string;
    isRecurring?: boolean;
    notes?: string;
  }) => apiFetch('/owner/finance/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  deleteExpense: (id: string) => apiFetch(`/owner/finance/expenses/${id}`, { method: 'DELETE' }),
  listUpiReconciliation: () =>
    apiFetch<
      {
        id: string;
        orderId: string;
        orderNumber: string;
        customerName: string;
        amountPaise: number;
        status: string;
        referenceNo: string | null;
        submittedAt: string | null;
        rejectReason: string | null;
        isDuplicate: boolean;
      }[]
    >('/owner/finance/upi-payments'),
  getPredictions: () =>
    apiFetch<
      {
        id: string;
        category: string;
        severity: 'high' | 'medium' | 'low';
        title: string;
        reasoning: string;
        estimatedImpactPaise: number;
        productId?: string;
      }[]
    >('/owner/finance/predictions'),
  getAdvisor: () =>
    apiFetch<{
      healthScore: number;
      marginPercent: number;
      mistakes: string[];
      actions: {
        actionKey: string;
        title: string;
        reasoning: string;
        estimatedImpactPaise: number;
        actionType: string;
        ctaLabel: string;
        productId: string | null;
        status: 'open' | 'done' | 'dismissed';
      }[];
    }>('/owner/finance/advisor'),
  setAdvisorAction: (actionKey: string, status: 'done' | 'dismissed') =>
    apiFetch('/owner/finance/advisor/action', { method: 'POST', body: JSON.stringify({ actionKey, status }) }),

  // Khata
  listKhataAccounts: () => apiFetch<KhataAccount[]>('/owner/khata/accounts'),
  getKhataDetail: (id: string) =>
    apiFetch<{ account: KhataAccount; entries: KhataEntry[] }>(`/owner/khata/accounts/${id}`),
  createKhataAccount: (payload: Record<string, unknown>) =>
    apiFetch('/owner/khata/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  addKhataEntry: (payload: Record<string, unknown>) =>
    apiFetch('/owner/khata/entries', { method: 'POST', body: JSON.stringify(payload) }),
  updateKhataControl: (id: string, payload: { status?: 'active' | 'frozen' | 'closed'; creditLimitPaise?: number }) =>
    apiFetch(`/owner/khata/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Account & Store Settings
  getStoreSettings: () =>
    apiFetch<{
      store: StoreSummary;
      qrDataUrl: string;
      plan: { name: string; max_products: number; max_staff: number; max_monthly_orders: number };
      usage: { productsCount: number; staffCount: number };
    }>('/owner/store/settings'),
  updateStoreSettings: (payload: Record<string, unknown>) =>
    apiFetch<StoreSummary>('/owner/store/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  geocodeAddress: (q: string) =>
    apiFetch<{ results: { displayName: string; lat: number; lng: number }[]; unavailable?: boolean }>(
      `/public/geocode?q=${encodeURIComponent(q)}`
    ),
  updatePaymentMethod: (payload: {
    methodCode: string;
    enabled: boolean;
    upiId?: string | null;
    payeeName?: string | null;
    upiQrUrl?: string | null;
    requireReference?: boolean;
  }) => apiFetch<StoreSummary>('/owner/store/payment-methods', { method: 'PUT', body: JSON.stringify(payload) }),
  listStaff: () =>
    apiFetch<
      { id: string; name: string; phone: string | null; staffRole: string; isActive: boolean; createdAt: string }[]
    >('/owner/staff'),
  createStaff: (payload: { name: string; phone: string; password: string; staffRole: 'cashier' | 'packer' | 'manager' }) =>
    apiFetch('/owner/staff', { method: 'POST', body: JSON.stringify(payload) }),
  toggleStaff: (id: string, isActive: boolean) =>
    apiFetch(`/owner/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  listTickets: () => apiFetch<Record<string, unknown>[]>('/owner/tickets'),
  createTicket: (payload: { subject: string; body: string; priority?: 'low' | 'normal' | 'high'; attachmentUrl?: string | null }) =>
    apiFetch('/owner/tickets', { method: 'POST', body: JSON.stringify(payload) }),
  replyTicket: (id: string, body: string) =>
    apiFetch(`/owner/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ body }) }),
  requestAccountDeletion: (reason: string) =>
    apiFetch('/owner/account/delete-request', { method: 'POST', body: JSON.stringify({ reason }) }),
};
