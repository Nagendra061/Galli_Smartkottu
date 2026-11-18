import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Crosshair, MapPin, Search, ShieldCheck, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { PhoneInput } from '../../../../shared/components/forms/PhoneInput';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { generateIdempotencyKey } from '../../../../shared/utils/apiClient';
import { calculateDistanceKm } from '../../../../shared/utils/geo';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi, type CartQuoteResponse } from '../../services/customerApi';

export function CustomerCheckoutPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user, setSession } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const cart = useCustomerCart(slug);

  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>('pickup');
  const [pickupSlot, setPickupSlot] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [newAddressLine, setNewAddressLine] = useState('');
  const [newAddressLabel, setNewAddressLabel] = useState('Home');
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [manualDistanceKm, setManualDistanceKm] = useState('');
  const [showManualRangeInput, setShowManualRangeInput] = useState(false);
  const [checkingRange, setCheckingRange] = useState(false);
  const [rangeCheckNote, setRangeCheckNote] = useState<string | null>(null);

  // Phone + PIN step
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [pin, setPin] = useState('');
  const [phoneChecked, setPhoneChecked] = useState<{ exists: boolean; hasPin: boolean; name: string | null } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'pay_at_pickup' | 'cash' | 'khata'>('upi');
  const [notes, setNotes] = useState('');
  const [conflictDialog, setConflictDialog] = useState<CartQuoteResponse | null>(null);

  const { data: storeData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = storeData?.store;
  const isCustomerSignedIn = user?.role === 'customer';

  const { data: addresses = [] } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES,
    queryFn: customerApi.listAddresses,
    enabled: isCustomerSignedIn,
  });

  const { data: khataDetail } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_KHATA(slug),
    queryFn: () => customerApi.getKhata(store!.id),
    enabled: Boolean(store?.id && isCustomerSignedIn),
  });

  useEffect(() => {
    if (!store) return;
    if (store.pickupEnabled && store.pickupSlots.length && !pickupSlot) {
      setPickupSlot(store.pickupSlots[0]);
    }
    if (!store.pickupEnabled && store.deliveryEnabled) {
      setFulfilment('delivery');
    }
    const enabledUpi = store.paymentMethods.find((m) => m.methodCode === 'upi' && m.enabled);
    if (!enabledUpi) {
      setPaymentMethod(fulfilment === 'pickup' ? 'pay_at_pickup' : 'cash');
    }
  }, [store, pickupSlot, fulfilment]);

  useEffect(() => {
    if (addresses.length > 0 && !deliveryAddress) {
      setDeliveryAddress(addresses[0].addressLine);
      if (addresses[0].latitude != null && addresses[0].longitude != null) {
        setCustomerLat(addresses[0].latitude);
        setCustomerLng(addresses[0].longitude);
      }
    }
  }, [addresses, deliveryAddress]);

  const resolvedDistanceKm = useMemo(() => {
    if (
      customerLat != null &&
      customerLng != null &&
      store?.storeLat != null &&
      store?.storeLng != null
    ) {
      return calculateDistanceKm(store.storeLat, store.storeLng, customerLat, customerLng);
    }
    if (manualDistanceKm.trim() !== '') {
      const parsed = Number(manualDistanceKm);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return Math.round(parsed * 100) / 100;
      }
    }
    return null;
  }, [customerLat, customerLng, store?.storeLat, store?.storeLng, manualDistanceKm]);

  const deliveryRadiusKm = store?.deliveryRadiusKm ?? 0;
  const isOutOfRange =
    fulfilment === 'delivery' &&
    deliveryRadiusKm > 0 &&
    resolvedDistanceKm !== null &&
    resolvedDistanceKm > deliveryRadiusKm;
  const isWithinRange =
    fulfilment === 'delivery' &&
    deliveryRadiusKm > 0 &&
    resolvedDistanceKm !== null &&
    resolvedDistanceKm <= deliveryRadiusKm;

  const notifyRangeResult = (lat: number, lng: number) => {
    if (!store || store.storeLat == null || store.storeLng == null || store.deliveryRadiusKm <= 0) return;
    const dist = calculateDistanceKm(store.storeLat, store.storeLng, lat, lng);
    if (dist > store.deliveryRadiusKm) {
      showToast({
        tone: 'error',
        message: `Sorry, you are out of range (${dist} km away) and unable to deliver. You can choose Store Pickup instead.`,
      });
    } else {
      showToast({
        tone: 'success',
        message: `Location is ${dist} km away — within the ${store.deliveryRadiusKm} km delivery range.`,
      });
    }
  };

  const handleCheckAddressDistance = async () => {
    const query = (deliveryAddress.trim() || newAddressLine.trim());
    if (!query) {
      showToast({ tone: 'warning', message: 'Enter or select a delivery address first.' });
      return;
    }
    setCheckingRange(true);
    setRangeCheckNote(null);
    try {
      const res = await customerApi.geocodeAddress(query);
      if (res.results.length > 0) {
        const hit = res.results[0];
        setCustomerLat(hit.lat);
        setCustomerLng(hit.lng);
        setManualDistanceKm('');
        notifyRangeResult(hit.lat, hit.lng);
      } else {
        setShowManualRangeInput(true);
        setRangeCheckNote(
          'Could not automatically locate that address. Use Current GPS or enter your coordinates / distance below.'
        );
        showToast({
          tone: 'warning',
          message: 'Address not matched automatically. Try Use Current GPS or enter distance/coordinates.',
        });
      }
    } finally {
      setCheckingRange(false);
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      setShowManualRangeInput(true);
      showToast({ tone: 'error', message: 'Geolocation is not supported in this browser.' });
      return;
    }
    setCheckingRange(true);
    setRangeCheckNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCustomerLat(lat);
        setCustomerLng(lng);
        setManualDistanceKm('');
        setCheckingRange(false);
        notifyRangeResult(lat, lng);
      },
      () => {
        setCheckingRange(false);
        setShowManualRangeInput(true);
        setRangeCheckNote(
          'Location access is blocked or unavailable in this browser. Enter your distance or coordinates below.'
        );
        showToast({
          tone: 'warning',
          message: 'Location access blocked. Enter distance or coordinates manually.',
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const identifyMutation = useMutation({
    mutationFn: () => customerApi.identifyPhone(phone),
    onSuccess: (res) => {
      setAuthError(null);
      setPhoneChecked(res);
      if (res.name) setName(res.name);
    },
    onError: (err: unknown) => {
      setAuthError(err instanceof Error ? err.message : 'Enter a valid 10-digit phone number.');
    },
  });

  const verifyPinMutation = useMutation({
    mutationFn: () => customerApi.verifyPin(phone, pin, name.trim() || undefined),
    onSuccess: (res) => {
      setAuthError(null);
      setSession(res.token, res.user);
      showToast({ tone: 'success', message: `Signed in as ${res.user.name}` });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES });
      if (store) void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_KHATA(slug) });
    },
    onError: (err: unknown) => {
      setAuthError(err instanceof Error ? err.message : 'Invalid PIN.');
    },
  });

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!store) throw new Error('Store missing');

      const finalAddr =
        fulfilment === 'delivery'
          ? deliveryAddress.trim() || newAddressLine.trim()
          : null;

      if (fulfilment === 'delivery' && !finalAddr) {
        throw new Error('Enter a delivery address.');
      }

      let orderLat = customerLat;
      let orderLng = customerLng;
      let orderDist = resolvedDistanceKm;

      if (fulfilment === 'delivery' && store.deliveryRadiusKm > 0 && orderDist === null && finalAddr) {
        const geo = await customerApi.geocodeAddress(finalAddr);
        if (geo.results.length > 0) {
          orderLat = geo.results[0].lat;
          orderLng = geo.results[0].lng;
          setCustomerLat(orderLat);
          setCustomerLng(orderLng);
          if (store.storeLat != null && store.storeLng != null) {
            orderDist = calculateDistanceKm(store.storeLat, store.storeLng, orderLat, orderLng);
          }
        } else {
          setShowManualRangeInput(true);
          throw new Error(
            `Please verify your location (Check Address, Use GPS, or enter distance) to confirm you are within ${store.deliveryRadiusKm} km.`
          );
        }
      }

      if (
        fulfilment === 'delivery' &&
        store.deliveryRadiusKm > 0 &&
        orderDist !== null &&
        orderDist > store.deliveryRadiusKm
      ) {
        throw new Error(
          'Sorry, you are out of range and unable to deliver. You can choose the pickup option to come to the store and get your things.'
        );
      }

      // Always run server quote re-validation before placing order (PRD 9.3)
      const quote = await customerApi.quoteCart({
        storeId: store.id,
        fulfilment,
        deliveryLat: fulfilment === 'delivery' ? orderLat : null,
        deliveryLng: fulfilment === 'delivery' ? orderLng : null,
        deliveryDistanceKm: fulfilment === 'delivery' ? orderDist : null,
        items: cart.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          expectedPricePaise: i.unitPricePaise,
        })),
      });

      if (quote.conflicts.length > 0) {
        setConflictDialog(quote);
        throw new Error('CART_CONFLICTS');
      }

      if (fulfilment === 'delivery' && newAddressLine.trim() && !deliveryAddress.trim()) {
        await customerApi.addAddress({
          label: newAddressLabel.trim() || 'Home',
          addressLine: newAddressLine.trim(),
          latitude: orderLat,
          longitude: orderLng,
        });
      }

      return customerApi.createOrder(
        {
          storeId: store.id,
          fulfilment,
          pickupSlot: fulfilment === 'pickup' ? pickupSlot : null,
          deliveryAddress: finalAddr,
          deliveryLat: fulfilment === 'delivery' ? orderLat : null,
          deliveryLng: fulfilment === 'delivery' ? orderLng : null,
          deliveryDistanceKm: fulfilment === 'delivery' ? orderDist : null,
          paymentMethod,
          items: cart.items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            substitutionPref: i.substitutionPref,
          })),
          notes: notes.trim() || undefined,
        },
        generateIdempotencyKey()
      );
    },
    onSuccess: (order) => {
      cart.clearCart();
      showToast({ tone: 'success', message: `Order ${order.orderNumber} placed!` });
      navigate(
        ROUTES.STORE_ORDER_TRACK.replace(':slug', slug).replace(':orderId', order.id)
      );
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'CART_CONFLICTS') return;
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Checkout failed.' });
    },
  });

  const acceptQuoteChanges = () => {
    if (!conflictDialog) return;
    const updatedMap = new Map(conflictDialog.items.map((i) => [i.productId, i]));
    const conflictMap = new Map(conflictDialog.conflicts.map((c) => [c.productId, c]));
    const nextCart = cart.items
      .map((item) => {
        const conflict = conflictMap.get(item.productId);
        const qItem = updatedMap.get(item.productId);
        if (conflict?.issue === 'out_of_stock' || conflict?.issue === 'unavailable') {
          return null;
        }
        const nextQty = conflict?.issue === 'insufficient_stock' ? conflict.availableQty : item.qty;
        const nextPrice = qItem?.unitPricePaise ?? conflict?.newPricePaise ?? item.unitPricePaise;
        return { ...item, qty: nextQty, unitPricePaise: nextPrice };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.qty > 0);

    cart.replaceCart(nextCart);
    setConflictDialog(null);
    showToast({ tone: 'info', message: 'Cart updated to latest store prices & stock.' });
  };

  if (isLoading || !store) return <Skeleton className="h-64 w-full" />;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Nothing to checkout"
        description="Your cart is empty."
        action={
          <Button onClick={() => navigate(ROUTES.STORE_HOME.replace(':slug', slug))}>
            Browse {store.name}
          </Button>
        }
      />
    );
  }

  const deliveryFee = fulfilment === 'delivery' ? store.deliveryFeePaise : 0;
  const estimatedTotal = cart.subtotalPaise + deliveryFee;

  const isMethodEnabled = (code: string) =>
    Boolean(store.paymentMethods.find((m) => m.methodCode === code && m.enabled));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(ROUTES.STORE_CART.replace(':slug', slug))}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Cart
      </Button>

      <PageHeader title="Checkout" subtitle={`Ordering from ${store.name}`} />

      {/* Step 1: Fulfilment */}
      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary">1. Fulfilment Method</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {store.pickupEnabled && (
            <button
              type="button"
              onClick={() => {
                setFulfilment('pickup');
                if (paymentMethod === 'cash') setPaymentMethod('pay_at_pickup');
              }}
              className={`min-h-[48px] p-3 rounded-xl border text-left cursor-pointer ${
                fulfilment === 'pickup'
                  ? 'bg-accent-soft border-accent-primary text-accent-primary'
                  : 'bg-surface-card border-border-default text-ink-secondary'
              }`}
            >
              <div className="font-semibold text-sm inline-flex items-center gap-1.5">
                <Store className="h-4 w-4" /> Store Pickup
              </div>
              <div className="text-xs opacity-80 mt-0.5">Free · Ready at counter</div>
            </button>
          )}
          {store.deliveryEnabled && (
            <button
              type="button"
              onClick={() => {
                setFulfilment('delivery');
                if (paymentMethod === 'pay_at_pickup') setPaymentMethod('cash');
              }}
              className={`min-h-[48px] p-3 rounded-xl border text-left cursor-pointer ${
                fulfilment === 'delivery'
                  ? 'bg-accent-soft border-accent-primary text-accent-primary'
                  : 'bg-surface-card border-border-default text-ink-secondary'
              }`}
            >
              <div className="font-semibold text-sm inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Home Delivery
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                {store.deliveryFeePaise > 0 ? <PriceText amountPaise={store.deliveryFeePaise} /> : 'Free'} ·{' '}
                {store.deliveryEtaText}
                {store.deliveryRadiusKm > 0 ? ` · Within ${store.deliveryRadiusKm} km` : ''}
              </div>
            </button>
          )}
        </div>

        {fulfilment === 'pickup' && store.pickupSlots.length > 0 && (
          <FormField label="Preferred Pickup Slot" htmlFor="chk-slot">
            <Select id="chk-slot" value={pickupSlot} onChange={(e) => setPickupSlot(e.target.value)}>
              {store.pickupSlots.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {fulfilment === 'delivery' && (
          <div className="space-y-3">
            {addresses.length > 0 && (
              <FormField label="Saved Address" htmlFor="chk-addr">
                <Select
                  id="chk-addr"
                  value={deliveryAddress}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDeliveryAddress(val);
                    setManualDistanceKm('');
                    setRangeCheckNote(null);
                    const matched = addresses.find((a) => a.addressLine === val);
                    if (matched && matched.latitude != null && matched.longitude != null) {
                      setCustomerLat(matched.latitude);
                      setCustomerLng(matched.longitude);
                      notifyRangeResult(matched.latitude, matched.longitude);
                    } else {
                      setCustomerLat(null);
                      setCustomerLng(null);
                    }
                  }}
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.addressLine}>
                      {a.label}: {a.addressLine}
                    </option>
                  ))}
                  <option value="">+ Enter a new address</option>
                </Select>
              </FormField>
            )}
            {(!addresses.length || !deliveryAddress) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <FormField label="Label" htmlFor="new-lbl">
                  <TextInput
                    id="new-lbl"
                    value={newAddressLabel}
                    onChange={(e) => setNewAddressLabel(e.target.value)}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Full Address" htmlFor="new-addr" required>
                    <TextInput
                      id="new-addr"
                      value={newAddressLine}
                      onChange={(e) => {
                        setNewAddressLine(e.target.value);
                        setCustomerLat(null);
                        setCustomerLng(null);
                      }}
                      placeholder="House/Flat no, Street, Area"
                    />
                  </FormField>
                </div>
              </div>
            )}

            {deliveryRadiusKm > 0 && (
              <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-primary">
                    Store delivers within <strong>{deliveryRadiusKm} km</strong> of {store.address || store.name}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      isLoading={checkingRange}
                      onClick={() => void handleCheckAddressDistance()}
                    >
                      <Search className="h-3.5 w-3.5" /> Check Address
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      isLoading={checkingRange}
                      onClick={handleUseCurrentGps}
                    >
                      <Crosshair className="h-3.5 w-3.5" /> Use Current GPS
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowManualRangeInput((v) => !v)}
                    >
                      {showManualRangeInput ? 'Hide Distance Input' : 'Enter Distance / Coords'}
                    </Button>
                  </div>
                </div>

                {showManualRangeInput && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <FormField label="Distance from Store (km)" htmlFor="chk-dist">
                      <TextInput
                        id="chk-dist"
                        type="number"
                        min="0"
                        step="0.1"
                        value={manualDistanceKm}
                        onChange={(e) => {
                          setManualDistanceKm(e.target.value);
                          setCustomerLat(null);
                          setCustomerLng(null);
                        }}
                        placeholder="e.g. 3.5"
                      />
                    </FormField>
                    <FormField label="Your Latitude" htmlFor="chk-lat">
                      <TextInput
                        id="chk-lat"
                        type="number"
                        step="0.000001"
                        value={customerLat ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setCustomerLat(v === '' ? null : Number(v));
                          setManualDistanceKm('');
                        }}
                        placeholder="12.9784"
                      />
                    </FormField>
                    <FormField label="Your Longitude" htmlFor="chk-lng">
                      <TextInput
                        id="chk-lng"
                        type="number"
                        step="0.000001"
                        value={customerLng ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setCustomerLng(v === '' ? null : Number(v));
                          setManualDistanceKm('');
                        }}
                        placeholder="77.6408"
                      />
                    </FormField>
                  </div>
                )}

                {rangeCheckNote && !isOutOfRange && !isWithinRange && (
                  <p className="text-xs text-status-warning-fg">{rangeCheckNote}</p>
                )}

                {isOutOfRange && (
                  <Alert
                    tone="danger"
                    title={`Out of delivery range (${resolvedDistanceKm} km away · limit ${deliveryRadiusKm} km)`}
                  >
                    <div className="space-y-2">
                      <p>
                        Sorry, you are out of range and unable to deliver to your location, and you can choose the pickup option to come to the store and have the things.
                      </p>
                      {store.pickupEnabled && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setFulfilment('pickup');
                            if (paymentMethod === 'cash') setPaymentMethod('pay_at_pickup');
                          }}
                        >
                          <Store className="h-3.5 w-3.5" /> Switch to Store Pickup
                        </Button>
                      )}
                    </div>
                  </Alert>
                )}

                {isWithinRange && (
                  <Alert tone="success">
                    Within delivery range ({resolvedDistanceKm} km from store · limit {deliveryRadiusKm} km). Delivery available!
                  </Alert>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Step 2: Confirm Identity (Phone + PIN) */}
      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-accent-primary" /> 2. Your Phone & PIN
        </h2>
        {isCustomerSignedIn ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-status-success-bg/50 px-3 py-2.5 text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-ink-primary">
              <CheckCircle2 className="h-4 w-4 text-status-success-fg" />
              Signed in as {user.name} ({user.phone})
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {authError && <Alert tone="danger">{authError}</Alert>}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <FormField label="10-Digit Mobile Number" htmlFor="chk-phone" required>
                  <PhoneInput id="chk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </FormField>
              </div>
              <Button
                variant="secondary"
                isLoading={identifyMutation.isPending}
                onClick={() => identifyMutation.mutate()}
              >
                Continue
              </Button>
            </div>

            {phoneChecked && (
              <div className="space-y-3 pt-2 border-t border-border-default">
                {!phoneChecked.exists && (
                  <FormField label="Your Name" htmlFor="chk-name" required>
                    <TextInput
                      id="chk-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                    />
                  </FormField>
                )}
                <FormField
                  label={phoneChecked.hasPin ? 'Enter your 4–6 digit PIN' : 'Create a 4–6 digit PIN'}
                  htmlFor="chk-pin"
                  hint={
                    phoneChecked.hasPin
                      ? `Welcome back${phoneChecked.name ? `, ${phoneChecked.name}` : ''}!`
                      : 'Used to protect your orders and saved addresses.'
                  }
                  required
                >
                  <TextInput
                    id="chk-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="4-6 digits"
                  />
                </FormField>
                <Button
                  isLoading={verifyPinMutation.isPending}
                  disabled={pin.length < 4 || (!phoneChecked.exists && !name.trim())}
                  onClick={() => verifyPinMutation.mutate()}
                >
                  Verify & Continue
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Step 3: Payment */}
      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary">3. Payment Method</h2>
        <div className="space-y-2">
          {isMethodEnabled('upi') && (
            <label className="flex items-center justify-between rounded-xl border border-border-default p-3 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="pm"
                  checked={paymentMethod === 'upi'}
                  onChange={() => setPaymentMethod('upi')}
                />
                <div>
                  <div className="text-sm font-medium text-ink-primary">Pay by UPI</div>
                  <div className="text-xs text-ink-secondary">Scan store QR or open UPI app on next screen</div>
                </div>
              </div>
            </label>
          )}
          {fulfilment === 'pickup' && isMethodEnabled('pay_at_pickup') && (
            <label className="flex items-center gap-2.5 rounded-xl border border-border-default p-3 cursor-pointer">
              <input
                type="radio"
                name="pm"
                checked={paymentMethod === 'pay_at_pickup'}
                onChange={() => setPaymentMethod('pay_at_pickup')}
              />
              <div>
                <div className="text-sm font-medium text-ink-primary">Pay at Store Pickup</div>
                <div className="text-xs text-ink-secondary">Pay cash or UPI when collecting your order</div>
              </div>
            </label>
          )}
          {fulfilment === 'delivery' && isMethodEnabled('cash') && (
            <label className="flex items-center gap-2.5 rounded-xl border border-border-default p-3 cursor-pointer">
              <input
                type="radio"
                name="pm"
                checked={paymentMethod === 'cash'}
                onChange={() => setPaymentMethod('cash')}
              />
              <div>
                <div className="text-sm font-medium text-ink-primary">Cash on Delivery</div>
                <div className="text-xs text-ink-secondary">Pay when your order arrives</div>
              </div>
            </label>
          )}
          {isMethodEnabled('khata') && khataDetail?.account && khataDetail.account.status === 'active' && (
            <label className="flex items-center justify-between rounded-xl border border-border-default p-3 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="pm"
                  checked={paymentMethod === 'khata'}
                  onChange={() => setPaymentMethod('khata')}
                />
                <div>
                  <div className="text-sm font-medium text-ink-primary">Store Khata Credit</div>
                  <div className="text-xs text-ink-secondary">
                    Available credit:{' '}
                    <PriceText
                      amountPaise={Math.max(
                        0,
                        khataDetail.account.creditLimitPaise - khataDetail.account.balancePaise
                      )}
                    />
                  </div>
                </div>
              </div>
            </label>
          )}
        </div>

        <FormField label="Order Note (optional)" htmlFor="chk-note">
          <TextInput
            id="chk-note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions or preferences..."
          />
        </FormField>

        <div className="border-t border-border-default pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-ink-secondary">
            <span>Items Subtotal</span>
            <PriceText amountPaise={cart.subtotalPaise} />
          </div>
          {deliveryFee > 0 && (
            <div className="flex justify-between text-ink-secondary">
              <span>Delivery Fee</span>
              <PriceText amountPaise={deliveryFee} />
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-ink-primary pt-1">
            <span>Total Payable</span>
            <PriceText amountPaise={estimatedTotal} />
          </div>
        </div>

        <Button
          fullWidth
          size="lg"
          disabled={!isCustomerSignedIn || isOutOfRange || placeOrderMutation.isPending}
          isLoading={placeOrderMutation.isPending}
          onClick={() => placeOrderMutation.mutate()}
        >
          {!isCustomerSignedIn
            ? 'Sign in with Phone & PIN above to Place Order'
            : isOutOfRange
            ? 'Out of delivery range — Switch to Store Pickup'
            : 'Place Order'}
        </Button>
      </Card>

      {/* Cart Conflict Re-validation Dialog */}
      <Modal
        open={Boolean(conflictDialog)}
        onClose={() => setConflictDialog(null)}
        title="Some items in your cart changed"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflictDialog(null)}>
              Review Cart
            </Button>
            <Button onClick={acceptQuoteChanges}>Update Cart & Continue</Button>
          </>
        }
      >
        {conflictDialog && (
          <div className="space-y-2.5">
            {conflictDialog.conflicts.map((c) => (
              <Alert key={c.productId} tone="warning" title={c.productName}>
                {c.issue === 'out_of_stock' && 'This item just went out of stock and will be removed.'}
                {c.issue === 'unavailable' && 'This item is no longer available.'}
                {c.issue === 'insufficient_stock' && `Only ${c.availableQty} unit(s) remain in stock.`}
                {c.issue === 'price_changed' && (
                  <span>
                    Price updated to <PriceText amountPaise={c.newPricePaise} />.
                  </span>
                )}
              </Alert>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
