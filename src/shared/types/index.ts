export type UserRole = 'super_admin' | 'smo' | 'staff' | 'customer';

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  phone: string | null;
  email: string | null;
  storeId: string | null;
  storeSlug: string | null;
  staffPermissions?: string[];
}

export interface OrderStatusConfig {
  id: string;
  code: string;
  label: string;
  appliesTo: 'online' | 'pos' | 'all';
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  sortOrder: number;
  allowedNext: string[];
  requiresReason?: boolean;
}

export interface UnitConfig {
  id: string;
  code: string;
  label: string;
  allowDecimal: boolean;
}

export interface TaxRateConfig {
  id: string;
  name: string;
  ratePercent: number;
  hsnDefault: string | null;
}

export interface PaymentMethodTypeConfig {
  code: string;
  label: string;
  enabledByDefault: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

export interface NotificationTypeConfig {
  code: string;
  label: string;
  isCritical: boolean;
}

export interface NotificationChannelConfig {
  code: string;
  label: string;
  enabled: boolean;
  visibleInUi: boolean;
}

export interface AppSettingsConfig {
  appName: string;
  appSlogan: string;
  currencyCode: string;
  currencySymbol: string;
  defaultLanguage: string;
  appVersion: string;
  changelog: string;
  forceUpdate: boolean;
  defaultLowStockThreshold: number;
  defaultExpiryWindowDays: number;
  defaultPaymentTimeoutMinutes: number;
  maxUpiResubmissions: number;
  notificationRetentionDays: number;
}

export interface BootstrapConfig {
  appSettings: AppSettingsConfig;
  orderStatuses: OrderStatusConfig[];
  paymentStatuses: { code: string; label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }[];
  units: UnitConfig[];
  taxRates: TaxRateConfig[];
  paymentMethodTypes: PaymentMethodTypeConfig[];
  notificationTypes: NotificationTypeConfig[];
  notificationChannels: NotificationChannelConfig[];
  faqs: FaqItem[];
  featureFlags: Record<string, boolean>;
  i18nStrings: Record<string, string>;
  seededStoreSlug: string | null;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export interface StoreSummary {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  suspensionReason: string | null;
  supportContact: string | null;
  isOpen: boolean;
  closedReason: string | null;
  address: string;
  phone: string;
  timings: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  brandColor: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeePaise: number;
  minOrderPaise: number;
  deliveryEtaText: string;
  deliveryRadiusKm: number;
  storeLat: number | null;
  storeLng: number | null;
  pickupSlots: string[];
  planId: string;
  planName?: string;
  gstNumber?: string | null;
  fssaiNumber?: string | null;
  docsVerified?: boolean;
  requirePaymentReference: boolean;
  allowZeroStockPos: boolean;
  khataLimitBehavior: 'warn' | 'block';
  lowStockThreshold: number;
  invoicePrefix: string;
  nextInvoiceNo: number;
  soundAlertsEnabled: boolean;
  staffCanVerifyPayment: boolean;
  paymentMethods: StorePaymentMethod[];
}

export interface StorePaymentMethod {
  id: string;
  storeId: string;
  methodCode: string;
  enabled: boolean;
  upiId: string | null;
  payeeName: string | null;
  upiQrUrl: string | null;
  requireReference: boolean;
}

export interface Category {
  id: string;
  storeId: string | null;
  name: string;
  parentId: string | null;
  archivedAt: string | null;
}

export interface Brand {
  id: string;
  storeId: string | null;
  name: string;
  archivedAt: string | null;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string | null;
  categoryName?: string | null;
  brandId: string | null;
  brandName?: string | null;
  unitId: string;
  unitCode?: string;
  unitLabel?: string;
  taxRateId: string;
  taxRatePercent?: number;
  name: string;
  description: string;
  barcode: string | null;
  imageUrl: string | null;
  mrpPaise: number;
  sellingPricePaise: number;
  costPricePaise: number;
  stockQty: number;
  reservedQty: number;
  availableQty: number;
  reorderLevel: number;
  expiryDate: string | null;
  batchNo: string | null;
  damagedQty: number;
  damageNote: string;
  onlineVisible: boolean;
  isFavourite: boolean;
  isAvailable: boolean;
  archivedAt: string | null;
  updatedAt?: string;
  activeOffer?: Offer | null;
  effectivePricePaise?: number;
}

export interface InventoryPredictions {
  monthLabel: string;
  generatedAt: string;
  summary: {
    lowStockCount: number;
    highDemandCount: number;
    deadStockCount: number;
    damagedRiskCount: number;
  };
  lowStock: {
    productId: string;
    name: string;
    categoryName: string | null;
    brandName: string | null;
    unitLabel: string;
    stockQty: number;
    availableQty: number;
    reorderLevel: number;
    monthlyUnitsSold: number;
    daysOfCover: number | null;
    suggestedRestockQty: number;
    severity: 'critical' | 'warning';
    reason: string;
  }[];
  highDemandThisMonth: {
    productId: string;
    name: string;
    categoryName: string | null;
    brandName: string | null;
    unitLabel: string;
    monthlyUnitsSold: number;
    posUnits: number;
    onlineUnits: number;
    monthlyRevenuePaise: number;
    availableQty: number;
    daysOfCover: number | null;
    reason: string;
  }[];
  deadStock: {
    productId: string;
    name: string;
    categoryName: string | null;
    brandName: string | null;
    unitLabel: string;
    stockQty: number;
    idleValuePaise: number;
    daysIdle: number;
    reason: string;
  }[];
  damagedRisks: {
    productId: string;
    name: string;
    categoryName: string | null;
    brandName: string | null;
    unitLabel: string;
    damagedQty: number;
    damageNote: string;
    estimatedLossPaise: number;
    availableQty: number;
    updatedAt: string;
  }[];
}

export interface Offer {
  id: string;
  storeId: string;
  title: string;
  offerType: 'percent' | 'flat' | 'combo' | 'bogo';
  discountValue: number;
  minQty: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  productIds: string[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  unitLabel: string;
  qty: number;
  unitPricePaise: number;
  costPricePaise: number;
  taxPercent: number;
  discountPaise: number;
  lineTotalPaise: number;
  availabilityStatus: 'available' | 'unavailable_pending' | 'unavailable_approved' | 'substituted';
  substituteName: string | null;
  substitutionPref: 'call_me' | 'replace' | 'remove';
  packed: boolean;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string;
  actorRole: string;
  reason: string | null;
  createdAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  storeId: string;
  methodCode: string;
  amountPaise: number;
  status: string;
  referenceNo: string | null;
  proofUrl: string | null;
  submittedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  resubmissionCount: number;
  isDuplicateRef?: boolean;
}

export interface OrderRecord {
  id: string;
  storeId: string;
  orderNumber: string;
  channel: 'pos' | 'online';
  fulfilment: 'counter' | 'pickup' | 'delivery';
  pickupSlot: string | null;
  deliveryAddress: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryDistanceKm?: number | null;
  statusCode: string;
  paymentStatus: string;
  paymentMethod: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  cashTenderedPaise: number | null;
  changeReturnedPaise: number | null;
  handoverCode: string | null;
  assignedStaffName: string | null;
  rating: number | null;
  feedback: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  events: OrderEvent[];
  payments: PaymentRecord[];
  messages: OrderMessage[];
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  storeId: string | null;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface KhataAccount {
  id: string;
  storeId: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  address: string;
  creditLimitPaise: number;
  billingCycleDay: number;
  balancePaise: number;
  status: 'active' | 'frozen' | 'closed';
  notes: string;
  lastEntryAt: string | null;
  overdueDays: number;
}

export interface KhataEntry {
  id: string;
  accountId: string;
  orderId: string | null;
  orderNumber?: string | null;
  entryType: 'debit' | 'credit' | 'write_off';
  amountPaise: number;
  balanceAfterPaise: number;
  paymentMethod: string | null;
  referenceNo: string | null;
  note: string;
  createdAt: string;
}
