import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CloudOff,
  CreditCard,
  Pause,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { QrDisplay } from '../../../../shared/components/data-display/QrDisplay';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { NumberStepper } from '../../../../shared/components/forms/NumberStepper';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES, STORAGE_KEYS } from '../../../../shared/config/routes';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { useOnlineStatus } from '../../../../shared/hooks/useOnlineStatus';
import { useI18n } from '../../../../shared/i18n/I18nContext';
import type { OrderRecord, Product } from '../../../../shared/types';
import { generateIdempotencyKey } from '../../../../shared/utils/apiClient';
import {
  enqueueOfflinePosBill,
  readOfflinePosQueue,
  removeOfflinePosBill,
  writeOfflinePosQueue,
  type QueuedPosBill,
} from '../../../../shared/utils/offlinePosQueue';
import { SmoHomeStrip } from '../../components/SmoHomeStrip';
import { smoApi } from '../../services/smoApi';

interface PosCartLine {
  lineId: string;
  productId: string | null;
  name: string;
  unitLabel: string;
  allowDecimal: boolean;
  qty: number;
  unitPricePaise: number;
  discountPaise: number;
  taxPercent: number;
  maxStock: number | null;
}

export function SmoPosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useI18n();
  const { data: config } = useBootstrapConfig();
  const isOnline = useOnlineStatus();

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [cart, setCart] = useState<PosCartLine[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.POS_CART_DRAFT);
      return saved ? (JSON.parse(saved) as PosCartLine[]) : [];
    } catch {
      return [];
    }
  });
  const [billDiscountPaise, setBillDiscountPaise] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'khata'>('cash');
  const [cashTenderedPaise, setCashTenderedPaise] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedKhataId, setSelectedKhataId] = useState('');
  const [notes, setNotes] = useState('');

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUnit, setCustomUnit] = useState('pcs');
  const [customPricePaise, setCustomPricePaise] = useState(0);
  const [customQty, setCustomQty] = useState(1);

  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdSaveModalOpen, setHoldSaveModalOpen] = useState(false);

  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [khataOverrideModal, setKhataOverrideModal] = useState<{
    limit: number;
    currentBalance: number;
    newBalance: number;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [completedBill, setCompletedBill] = useState<OrderRecord | null>(null);

  const [offlineQueue, setOfflineQueue] = useState<QueuedPosBill[]>(() => readOfflinePosQueue());
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.POS_CART_DRAFT, JSON.stringify(cart));
  }, [cart]);

  const { data: homeData } = useQuery({
    queryKey: QUERY_KEYS.SMO_HOME,
    queryFn: smoApi.getHome,
  });

  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.SMO_STORE_SETTINGS,
    queryFn: smoApi.getStoreSettings,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: QUERY_KEYS.SMO_PRODUCTS,
    queryFn: () => smoApi.listProducts(false),
  });

  const { data: categories = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_CATEGORIES,
    queryFn: smoApi.listCategories,
  });

  const { data: khataAccounts = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS,
    queryFn: smoApi.listKhataAccounts,
  });

  const { data: heldBills = [], refetch: refetchHeld } = useQuery({
    queryKey: QUERY_KEYS.SMO_HELD_BILLS,
    queryFn: smoApi.listHeldBills,
  });

  const store = homeData?.store;
  const unitsById = useMemo(
    () => new Map((config?.units || []).map((u) => [u.id, u])),
    [config?.units]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        (p.brandName && p.brandName.toLowerCase().includes(q))
      );
    });
  }, [products, search, selectedCategoryId]);

  const totals = useMemo(() => {
    let subtotalPaise = 0;
    let lineDiscountPaise = 0;
    let taxPaise = 0;
    for (const line of cart) {
      const raw = Math.round(line.unitPricePaise * line.qty);
      const disc = Math.min(raw, line.discountPaise);
      const net = raw - disc;
      const lineTax = Math.round((net * line.taxPercent) / (100 + line.taxPercent));
      subtotalPaise += raw;
      lineDiscountPaise += disc;
      taxPaise += lineTax;
    }
    const maxBillDisc = Math.max(0, subtotalPaise - lineDiscountPaise);
    const appliedBillDisc = Math.min(maxBillDisc, billDiscountPaise);
    const totalPaise = Math.max(0, subtotalPaise - lineDiscountPaise - appliedBillDisc);
    const changePaise =
      paymentMethod === 'cash' && cashTenderedPaise > totalPaise
        ? cashTenderedPaise - totalPaise
        : 0;
    return {
      subtotalPaise,
      discountPaise: lineDiscountPaise + appliedBillDisc,
      taxPaise,
      totalPaise,
      changePaise,
    };
  }, [cart, billDiscountPaise, paymentMethod, cashTenderedPaise]);

  const addProductToCart = (prod: Product) => {
    if (store && !store.allowZeroStockPos && prod.availableQty <= 0) {
      showToast({ tone: 'error', message: `${prod.name} is out of stock.` });
      return;
    }
    const unitMeta = unitsById.get(prod.unitId);
    const allowDecimal = unitMeta?.allowDecimal ?? false;
    const stepQty = allowDecimal ? 0.5 : 1;
    const price = prod.effectivePricePaise ?? prod.sellingPricePaise;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === prod.id);
      if (existing) {
        const nextQty = Number((existing.qty + (allowDecimal ? 0.5 : 1)).toFixed(2));
        if (store && !store.allowZeroStockPos && nextQty > prod.availableQty) {
          showToast({ tone: 'warning', message: `Only ${prod.availableQty} ${prod.unitLabel || ''} available.` });
          return prev;
        }
        return prev.map((l) => (l.lineId === existing.lineId ? { ...l, qty: nextQty } : l));
      }
      return [
        ...prev,
        {
          lineId: prod.id,
          productId: prod.id,
          name: prod.name,
          unitLabel: prod.unitLabel || unitMeta?.label || 'pcs',
          allowDecimal,
          qty: stepQty,
          unitPricePaise: price,
          discountPaise: 0,
          taxPercent: prod.taxRatePercent ?? 0,
          maxStock: prod.availableQty,
        },
      ];
    });
  };

  const addCustomItem = () => {
    if (!customName.trim() || customPricePaise <= 0) {
      showToast({ tone: 'error', message: 'Enter item name and price.' });
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        lineId: `custom_${Date.now()}`,
        productId: null,
        name: customName.trim(),
        unitLabel: customUnit.trim() || 'pcs',
        allowDecimal: true,
        qty: customQty > 0 ? customQty : 1,
        unitPricePaise: customPricePaise,
        discountPaise: 0,
        taxPercent: 0,
        maxStock: null,
      },
    ]);
    setCustomName('');
    setCustomPricePaise(0);
    setCustomQty(1);
    setCustomModalOpen(false);
  };

  const buildPayload = (overrideKhata = false, overrideNote?: string) => ({
    items: cart.map((l) => ({
      productId: l.productId,
      name: l.name,
      unitLabel: l.unitLabel,
      qty: l.qty,
      unitPricePaise: l.unitPricePaise,
      discountPaise: l.discountPaise,
      taxPercent: l.taxPercent,
    })),
    billDiscountPaise,
    paymentMethod,
    cashTenderedPaise: paymentMethod === 'cash' ? cashTenderedPaise || totals.totalPaise : undefined,
    khataAccountId: paymentMethod === 'khata' ? selectedKhataId : undefined,
    overrideKhataLimit: overrideKhata,
    overrideReason: overrideNote,
    customerName: customerName.trim() || undefined,
    customerPhone: customerPhone.trim() || undefined,
    notes: notes.trim() || undefined,
  });

  const resetCart = () => {
    setCart([]);
    setBillDiscountPaise(0);
    setCashTenderedPaise(0);
    setCustomerName('');
    setCustomerPhone('');
    setSelectedKhataId('');
    setNotes('');
    setOverrideReason('');
    localStorage.removeItem(STORAGE_KEYS.POS_CART_DRAFT);
  };

  const syncOfflineQueue = async () => {
    const queue = readOfflinePosQueue();
    if (!queue.length || !isOnline || isSyncingQueue) return;
    setIsSyncingQueue(true);
    let syncedCount = 0;
    const remaining: QueuedPosBill[] = [];

    for (const item of [...queue].reverse()) {
      try {
        await smoApi.createPosBill(item.payload, item.idempotencyKey);
        removeOfflinePosBill(item.idempotencyKey);
        syncedCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        remaining.push({ ...item, lastError: msg });
      }
    }

    writeOfflinePosQueue(remaining.reverse());
    setOfflineQueue(readOfflinePosQueue());
    setIsSyncingQueue(false);

    if (syncedCount > 0) {
      showToast({ tone: 'success', message: `${t('offline.posSynced')} (${syncedCount})` });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDERS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_PRODUCTS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS });
    }
  };

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      void syncOfflineQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const billMutation = useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: Record<string, unknown>; idempotencyKey: string }) =>
      smoApi.createPosBill(payload, idempotencyKey),
    onSuccess: (order) => {
      setUpiModalOpen(false);
      setKhataOverrideModal(null);
      setCompletedBill(order);
      resetCart();
      showToast({ tone: 'success', message: `Bill ${order.orderNumber} completed` });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_ORDERS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_PRODUCTS });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_KHATA_ACCOUNTS });
    },
    onError: (err: unknown, vars) => {
      const apiErr = err as { code?: string; message?: string; fields?: Record<string, string> };
      if (apiErr.code === 'KHATA_LIMIT_EXCEEDED' && apiErr.fields) {
        setKhataOverrideModal({
          limit: Number(apiErr.fields.limit || 0),
          currentBalance: Number(apiErr.fields.currentBalance || 0),
          newBalance: Number(apiErr.fields.newBalance || 0),
        });
        return;
      }
      if (!navigator.onLine || apiErr.message?.toLowerCase().includes('fetch')) {
        const queued: QueuedPosBill = {
          idempotencyKey: vars.idempotencyKey,
          queuedAt: new Date().toISOString(),
          payload: vars.payload,
          label: `${cart.length} item(s)`,
          totalPaise: totals.totalPaise,
        };
        setOfflineQueue(enqueueOfflinePosBill(queued));
        resetCart();
        setUpiModalOpen(false);
        showToast({ tone: 'warning', message: t('offline.posSaved') });
        return;
      }
      showToast({ tone: 'error', message: apiErr.message || 'Could not complete bill.' });
    },
  });

  const submitBill = (overrideKhata = false) => {
    if (!cart.length) {
      showToast({ tone: 'error', message: 'Add at least one item to the bill.' });
      return;
    }
    if (paymentMethod === 'khata' && !selectedKhataId) {
      showToast({ tone: 'error', message: 'Select a Khata customer.' });
      return;
    }
    const payload = buildPayload(overrideKhata, overrideReason.trim() || undefined);
    const idempotencyKey = generateIdempotencyKey();

    if (!isOnline) {
      const queued: QueuedPosBill = {
        idempotencyKey,
        queuedAt: new Date().toISOString(),
        payload,
        label: customerName.trim() || `${cart.length} item(s)`,
        totalPaise: totals.totalPaise,
      };
      setOfflineQueue(enqueueOfflinePosBill(queued));
      resetCart();
      setUpiModalOpen(false);
      showToast({ tone: 'warning', message: t('offline.posSaved') });
      return;
    }

    billMutation.mutate({ payload, idempotencyKey });
  };

  const holdCurrentBill = async () => {
    if (!cart.length) return;
    try {
      await smoApi.holdBill(holdLabel.trim() || customerName.trim() || `Bill ${new Date().toLocaleTimeString()}`, {
        cart,
        billDiscountPaise,
        customerName,
        customerPhone,
        notes,
      });
      await refetchHeld();
      resetCart();
      setHoldLabel('');
      setHoldSaveModalOpen(false);
      showToast({ tone: 'success', message: 'Bill placed on hold.' });
    } catch (err) {
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to hold bill.' });
    }
  };

  const resumeHeldBill = async (bill: { id: string; payload: Record<string, unknown> }) => {
    const p = bill.payload as {
      cart?: PosCartLine[];
      billDiscountPaise?: number;
      customerName?: string;
      customerPhone?: string;
      notes?: string;
    };
    setCart(p.cart || []);
    setBillDiscountPaise(p.billDiscountPaise || 0);
    setCustomerName(p.customerName || '');
    setCustomerPhone(p.customerPhone || '');
    setNotes(p.notes || '');
    await smoApi.deleteHeldBill(bill.id);
    await refetchHeld();
    setHeldModalOpen(false);
    showToast({ tone: 'info', message: 'Held bill resumed.' });
  };

  const storeUpi = store?.paymentMethods.find((m) => m.methodCode === 'upi');
  const activeKhataAccounts = khataAccounts.filter((k) => k.status === 'active');
  const selectedKhata = activeKhataAccounts.find((k) => k.id === selectedKhataId);

  return (
    <div className="space-y-4">
      <SmoHomeStrip />

      <PageHeader
        title="Counter POS"
        subtitle="Fast offline-capable billing for walk-in customers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.OWNER_ORDERS_ONLINE)}>
              <ShoppingBag className="h-4 w-4" />
              Online Orders {homeData?.snapshot.pendingOnline ? `(${homeData.snapshot.pendingOnline})` : ''}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setHeldModalOpen(true)}>
              <Pause className="h-4 w-4" />
              Held ({heldBills.length})
            </Button>
          </div>
        }
      />

      {offlineQueue.length > 0 && (
        <Alert tone="warning" title={`${offlineQueue.length} offline bill(s) waiting to sync`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            <span className="text-xs">
              Saved locally with idempotency protection. {isOnline ? 'Ready to sync.' : 'Waiting for connection.'}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!isOnline}
              isLoading={isSyncingQueue}
              onClick={() => void syncOfflineQueue()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync now
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Catalogue Picker */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px]">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search item or scan barcode..."
              />
            </div>
            <Button variant="secondary" onClick={() => setCustomModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Custom item
            </Button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                selectedCategoryId === 'all'
                  ? 'bg-[#0f716a] text-ink-inverse border-[#0f716a]'
                  : 'bg-surface-card text-ink-secondary border-border-default hover:text-[#0f716a]'
              }`}
            >
              All ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#0f716a] text-ink-inverse border-[#0f716a]'
                    : 'bg-surface-card text-ink-secondary border-border-default hover:text-[#0f716a]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {loadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="No products in POS"
              description={
                products.length === 0
                  ? 'Add products in Inventory first, or use Custom item to bill immediately.'
                  : 'No products match your search or category filter.'
              }
              action={
                products.length === 0 ? (
                  <Button onClick={() => navigate(ROUTES.OWNER_INVENTORY)}>Go to Inventory</Button>
                ) : (
                  <Button variant="secondary" onClick={() => setCustomModalOpen(true)}>
                    Add custom item
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredProducts.map((p) => {
                const price = p.effectivePricePaise ?? p.sellingPricePaise;
                const out = !store?.allowZeroStockPos && p.availableQty <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={out}
                    onClick={() => addProductToCart(p)}
                    className={`text-left rounded-xl border p-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      out
                        ? 'bg-surface-subtle border-border-default'
                        : 'bg-surface-card border-border-default hover:border-accent-primary'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold text-ink-primary line-clamp-2">{p.name}</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <PriceText amountPaise={price} className="text-sm font-bold text-ink-primary" />
                      <span className="text-[11px] font-mono tabular-nums text-ink-muted">
                        {p.availableQty} {p.unitLabel || ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Active Bill Cart & Checkout */}
        <Card padding="md" className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-border-default pb-2.5">
            <h2 className="text-base font-semibold text-ink-primary">Current Bill ({cart.length})</h2>
            {cart.length > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setHoldSaveModalOpen(true)}>
                  <Pause className="h-3.5 w-3.5" /> Hold
                </Button>
                <Button size="sm" variant="ghost" onClick={resetCart}>
                  Clear
                </Button>
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-sm text-ink-muted py-6 text-center">
              Tap products on the left or add a custom item to start billing.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {cart.map((line) => {
                const raw = Math.round(line.unitPricePaise * line.qty);
                const net = Math.max(0, raw - line.discountPaise);
                return (
                  <div
                    key={line.lineId}
                    className="rounded-lg border border-border-default bg-surface-subtle/50 p-2.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink-primary truncate">{line.name}</div>
                        <div className="text-xs text-ink-muted">
                          <PriceText amountPaise={line.unitPricePaise} /> / {line.unitLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCart((prev) => prev.filter((l) => l.lineId !== line.lineId))}
                        aria-label={`Remove ${line.name}`}
                        className="p-1.5 text-ink-muted hover:text-status-danger-fg cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <NumberStepper
                        value={line.qty}
                        min={line.allowDecimal ? 0.1 : 1}
                        max={store?.allowZeroStockPos ? undefined : line.maxStock ?? undefined}
                        step={line.allowDecimal ? 0.25 : 1}
                        allowDecimal={line.allowDecimal}
                        onChange={(qty) =>
                          setCart((prev) =>
                            prev.map((l) => (l.lineId === line.lineId ? { ...l, qty } : l))
                          )
                        }
                      />
                      <PriceText amountPaise={net} className="text-sm font-bold text-ink-primary" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discount & Customer */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border-default">
            <FormField label="Bill Discount" htmlFor="pos-disc">
              <MoneyInput
                id="pos-disc"
                valuePaise={billDiscountPaise}
                onChangePaise={setBillDiscountPaise}
              />
            </FormField>
            <FormField label="Customer Phone" htmlFor="pos-phone">
              <TextInput
                id="pos-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Optional 10-digit"
              />
            </FormField>
          </div>

          <div className="space-y-1 text-sm border-t border-border-default pt-3">
            <div className="flex justify-between text-ink-secondary">
              <span>Subtotal</span>
              <PriceText amountPaise={totals.subtotalPaise} />
            </div>
            {totals.discountPaise > 0 && (
              <div className="flex justify-between text-status-success-fg">
                <span>Discount</span>
                <PriceText amountPaise={-totals.discountPaise} />
              </div>
            )}
            <div className="flex justify-between text-xs text-ink-muted">
              <span>Included GST</span>
              <PriceText amountPaise={totals.taxPaise} />
            </div>
            <div className="flex justify-between text-base font-bold text-ink-primary pt-1 border-t border-border-default">
              <span>Grand Total</span>
              <PriceText amountPaise={totals.totalPaise} />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Payment Method
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'cash', label: 'Cash', icon: <Receipt className="h-4 w-4" /> },
                  { id: 'upi', label: 'UPI QR', icon: <QrCode className="h-4 w-4" /> },
                  { id: 'card', label: 'Card', icon: <CreditCard className="h-4 w-4" /> },
                  { id: 'khata', label: 'Khata', icon: <UserCheck className="h-4 w-4" /> },
                ] as const
              ).map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPaymentMethod(pm.id)}
                  className={`min-h-[44px] px-2 py-2 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    paymentMethod === pm.id
                      ? 'bg-accent-soft text-accent-primary border-accent-primary'
                      : 'bg-surface-card text-ink-secondary border-border-default'
                  }`}
                >
                  {pm.icon}
                  <span>{pm.label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && (
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <FormField label="Cash Tendered" htmlFor="pos-cash">
                  <MoneyInput
                    id="pos-cash"
                    valuePaise={cashTenderedPaise}
                    onChangePaise={setCashTenderedPaise}
                  />
                </FormField>
                <div className="rounded-lg bg-surface-subtle px-3 py-2 text-xs">
                  <div className="text-ink-muted">Change Return</div>
                  <div className="text-sm font-bold text-ink-primary">
                    <PriceText amountPaise={totals.changePaise} />
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'khata' && (
              <FormField label="Select Khata Customer" htmlFor="pos-khata" required>
                <Select
                  id="pos-khata"
                  value={selectedKhataId}
                  onChange={(e) => setSelectedKhataId(e.target.value)}
                >
                  <option value="">Choose customer...</option>
                  {activeKhataAccounts.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.customerName} ({k.phone})
                    </option>
                  ))}
                </Select>
                {selectedKhata && (
                  <p className="text-xs text-ink-secondary mt-1">
                    Current due: <PriceText amountPaise={selectedKhata.balancePaise} /> · Limit:{' '}
                    <PriceText amountPaise={selectedKhata.creditLimitPaise} />
                  </p>
                )}
              </FormField>
            )}
          </div>

          <Button
            fullWidth
            size="lg"
            disabled={!cart.length}
            isLoading={billMutation.isPending}
            onClick={() => {
              if (paymentMethod === 'upi') {
                setUpiModalOpen(true);
              } else {
                submitBill(false);
              }
            }}
          >
            {!isOnline && <CloudOff className="h-4 w-4" />}
            {paymentMethod === 'upi'
              ? 'Show Store UPI QR'
              : paymentMethod === 'khata'
              ? 'Charge to Khata'
              : isOnline
              ? 'Complete Bill'
              : 'Save Bill Offline'}
          </Button>
        </Card>
      </div>

      {/* Custom Item Modal */}
      <Modal
        open={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title="Add Quick Custom Item"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addCustomItem}>Add to Bill</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Item Name" htmlFor="cust-name" required>
            <TextInput
              id="cust-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Loose Sugar"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Unit Price" htmlFor="cust-price" required>
              <MoneyInput
                id="cust-price"
                valuePaise={customPricePaise}
                onChangePaise={setCustomPricePaise}
              />
            </FormField>
            <FormField label="Quantity" htmlFor="cust-qty">
              <TextInput
                id="cust-qty"
                type="number"
                step="0.1"
                value={String(customQty)}
                onChange={(e) => setCustomQty(Number.parseFloat(e.target.value) || 1)}
              />
            </FormField>
          </div>
          <FormField label="Unit Label" htmlFor="cust-unit">
            <TextInput
              id="cust-unit"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      {/* Hold Bill Name Modal */}
      <Modal
        open={holdSaveModalOpen}
        onClose={() => setHoldSaveModalOpen(false)}
        title="Hold Current Bill"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHoldSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void holdCurrentBill()}>Save Hold</Button>
          </>
        }
      >
        <FormField label="Label / Customer Name" htmlFor="hold-label">
          <TextInput
            id="hold-label"
            value={holdLabel}
            onChange={(e) => setHoldLabel(e.target.value)}
            placeholder="e.g. Counter 2 customer"
          />
        </FormField>
      </Modal>

      {/* Held Bills Drawer Modal */}
      <Modal
        open={heldModalOpen}
        onClose={() => setHeldModalOpen(false)}
        title="Held Bills"
      >
        {heldBills.length === 0 ? (
          <EmptyState title="No held bills" description="Bills put on hold will appear here." />
        ) : (
          <div className="space-y-2.5">
            {heldBills.map((hb) => (
              <div
                key={hb.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-default p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-primary truncate">{hb.label}</div>
                  <div className="text-xs text-ink-muted">
                    {new Date(hb.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" onClick={() => void resumeHeldBill(hb)}>
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await smoApi.deleteHeldBill(hb.id);
                      await refetchHeld();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* UPI Counter Payment Modal */}
      <Modal
        open={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        title="Collect Counter UPI Payment"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUpiModalOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={billMutation.isPending} onClick={() => submitBill(false)}>
              Payment Received
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-xl font-bold text-ink-primary">
            <PriceText amountPaise={totals.totalPaise} />
          </div>
          <QrDisplay
            src={storeUpi?.upiQrUrl || settingsData?.qrDataUrl}
            alt="Store UPI QR"
            caption={storeUpi?.upiId || 'Configure UPI QR in Account > Payments'}
            size="lg"
          />
          <p className="text-xs text-ink-secondary">
            Ask customer to scan & pay. Confirm once payment arrives in your UPI app.
          </p>
        </div>
      </Modal>

      {/* Khata Limit Override Modal */}
      <Modal
        open={Boolean(khataOverrideModal)}
        onClose={() => setKhataOverrideModal(null)}
        title="Khata Credit Limit Exceeded"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setKhataOverrideModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={overrideReason.trim().length < 3}
              isLoading={billMutation.isPending}
              onClick={() => submitBill(true)}
            >
              Override & Charge
            </Button>
          </>
        }
      >
        {khataOverrideModal && (
          <div className="space-y-3">
            <Alert tone="warning" title="Over credit limit">
              Limit: <PriceText amountPaise={khataOverrideModal.limit} /> · New Balance:{' '}
              <PriceText amountPaise={khataOverrideModal.newBalance} />
            </Alert>
            <FormField label="Override Reason" htmlFor="override-reason" required>
              <TextInput
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for extending extra credit"
              />
            </FormField>
          </div>
        )}
      </Modal>

      {/* Completed Bill Modal */}
      <Modal
        open={Boolean(completedBill)}
        onClose={() => setCompletedBill(null)}
        title={completedBill ? `Bill ${completedBill.orderNumber}` : 'Bill'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompletedBill(null)}>
              New Bill
            </Button>
            {completedBill && (
              <Button
                onClick={() => {
                  const id = completedBill.id;
                  setCompletedBill(null);
                  navigate(ROUTES.OWNER_BILL_VIEW.replace(':orderId', id));
                }}
              >
                Print / Share Bill
              </Button>
            )}
          </>
        }
      >
        {completedBill && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-secondary">Total Paid</span>
              <PriceText amountPaise={completedBill.totalPaise} className="font-bold text-base" />
            </div>
            <div className="flex justify-between">
              <span className="text-ink-secondary">Method</span>
              <span className="uppercase font-medium">{completedBill.paymentMethod}</span>
            </div>
            {completedBill.changeReturnedPaise !== null && completedBill.changeReturnedPaise > 0 && (
              <div className="flex justify-between">
                <span className="text-ink-secondary">Change Returned</span>
                <PriceText amountPaise={completedBill.changeReturnedPaise} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
