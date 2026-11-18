import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Crosshair, LogOut, MapPin, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog';
import { EmptyState } from '../../../../shared/components/feedback/EmptyState';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { PhoneInput } from '../../../../shared/components/forms/PhoneInput';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { calculateDistanceKm } from '../../../../shared/utils/geo';
import { customerApi } from '../../services/customerApi';

export function CustomerAccountPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user, setSession, logout } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [phoneChecked, setPhoneChecked] = useState<{ exists: boolean; hasPin: boolean; name: string | null } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrLine, setAddrLine] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addrLat, setAddrLat] = useState<number | null>(null);
  const [addrLng, setAddrLng] = useState<number | null>(null);
  const [checkingGeo, setCheckingGeo] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isCustomer = user?.role === 'customer';

  const { data: storeData } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const { data: addresses = [] } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES,
    queryFn: customerApi.listAddresses,
    enabled: isCustomer,
  });

  const { data: khata } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_KHATA(slug),
    queryFn: () => customerApi.getKhata(storeData!.store.id),
    enabled: Boolean(isCustomer && storeData?.store.id),
  });

  const addAddressMutation = useMutation({
    mutationFn: () =>
      customerApi.addAddress({
        label: addrLabel.trim(),
        addressLine: addrLine.trim(),
        landmark: landmark.trim(),
        latitude: addrLat,
        longitude: addrLng,
      }),
    onSuccess: () => {
      setAddrLine('');
      setLandmark('');
      setAddrLat(null);
      setAddrLng(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES });
      showToast({ tone: 'success', message: 'Address saved.' });
    },
  });

  const detectAddressLocation = async () => {
    if (!addrLine.trim()) {
      showToast({ tone: 'warning', message: 'Enter an address line first.' });
      return;
    }
    setCheckingGeo(true);
    try {
      const res = await customerApi.geocodeAddress(addrLine.trim());
      if (res.results.length > 0) {
        setAddrLat(res.results[0].lat);
        setAddrLng(res.results[0].lng);
        showToast({ tone: 'success', message: 'Address coordinates detected.' });
      } else {
        showToast({ tone: 'warning', message: 'Could not resolve address automatically. Try GPS.' });
      }
    } finally {
      setCheckingGeo(false);
    }
  };

  const captureCurrentGps = () => {
    if (!navigator.geolocation) {
      showToast({ tone: 'error', message: 'Geolocation is not supported in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAddrLat(Number(pos.coords.latitude.toFixed(6)));
        setAddrLng(Number(pos.coords.longitude.toFixed(6)));
        showToast({ tone: 'success', message: 'GPS location attached to address.' });
      },
      () => {
        showToast({ tone: 'warning', message: 'Location permission denied or unavailable.' });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!isCustomer) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <PageHeader title="Customer Sign In" subtitle="Access your saved addresses, orders, and store Khata." />
        <Card padding="md" className="space-y-3">
          {authError && <Alert tone="danger">{authError}</Alert>}
          <FormField label="10-Digit Mobile Number" htmlFor="acc-phone" required>
            <PhoneInput id="acc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </FormField>
          {!phoneChecked ? (
            <Button
              fullWidth
              onClick={async () => {
                try {
                  const res = await customerApi.identifyPhone(phone);
                  setAuthError(null);
                  setPhoneChecked(res);
                  if (res.name) setName(res.name);
                } catch (err) {
                  setAuthError(err instanceof Error ? err.message : 'Enter a valid phone number.');
                }
              }}
            >
              Continue
            </Button>
          ) : (
            <div className="space-y-3">
              {!phoneChecked.exists && (
                <FormField label="Full Name" htmlFor="acc-name" required>
                  <TextInput id="acc-name" value={name} onChange={(e) => setName(e.target.value)} />
                </FormField>
              )}
              <FormField
                label={phoneChecked.hasPin ? 'Enter PIN' : 'Set 4–6 digit PIN'}
                htmlFor="acc-pin"
                required
              >
                <TextInput
                  id="acc-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </FormField>
              <Button
                fullWidth
                disabled={pin.length < 4}
                onClick={async () => {
                  try {
                    const res = await customerApi.verifyPin(phone, pin, name.trim() || undefined);
                    setSession(res.token, res.user);
                    showToast({ tone: 'success', message: `Signed in as ${res.user.name}` });
                  } catch (err) {
                    setAuthError(err instanceof Error ? err.message : 'Invalid PIN.');
                  }
                }}
              >
                <ShieldCheck className="h-4 w-4" /> Sign In
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHeader
        title={user.name}
        subtitle={user.phone || undefined}
        actions={
          <Button variant="secondary" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        }
      />

      {khata?.account && (
        <Card padding="md" className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-accent-primary" /> Store Khata Balance
            </div>
            <div className="text-xs text-ink-secondary">
              Credit limit: <PriceText amountPaise={khata.account.creditLimitPaise} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PriceText amountPaise={khata.account.balancePaise} className="text-base font-bold" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(ROUTES.STORE_KHATA.replace(':slug', slug))}
            >
              Statement
            </Button>
          </div>
        </Card>
      )}

      <Card padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4" /> Saved Delivery Addresses
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <FormField label="Label" htmlFor="c-lbl">
            <TextInput id="c-lbl" value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Address Line" htmlFor="c-line">
              <TextInput
                id="c-line"
                value={addrLine}
                onChange={(e) => setAddrLine(e.target.value)}
                placeholder="House no, Street, Locality"
              />
            </FormField>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={addrLine.trim().length < 4}
            isLoading={addAddressMutation.isPending}
            onClick={() => addAddressMutation.mutate()}
          >
            <Plus className="h-4 w-4" /> Save Address
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isLoading={checkingGeo}
            onClick={() => void detectAddressLocation()}
          >
            <Search className="h-3.5 w-3.5" /> Lookup Coords
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={captureCurrentGps}>
            <Crosshair className="h-3.5 w-3.5" /> Attach GPS
          </Button>
          {addrLat != null && addrLng != null && (
            <span className="text-xs text-status-success-fg font-medium">
              Pin attached ({addrLat.toFixed(4)}, {addrLng.toFixed(4)})
            </span>
          )}
        </div>

        {addresses.length === 0 ? (
          <EmptyState title="No saved addresses" description="Add your address for faster delivery checkout." />
        ) : (
          <div className="space-y-2 pt-2">
            {addresses.map((a) => {
              const store = storeData?.store;
              const dist =
                store?.storeLat != null &&
                store?.storeLng != null &&
                a.latitude != null &&
                a.longitude != null
                  ? calculateDistanceKm(store.storeLat, store.storeLng, a.latitude, a.longitude)
                  : null;
              const outOfRange =
                dist != null && store && store.deliveryRadiusKm > 0 && dist > store.deliveryRadiusKm;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-default p-2.5 text-sm"
                >
                  <div>
                    <span className="font-semibold">{a.label}: </span>
                    <span className="text-ink-secondary">{a.addressLine}</span>
                    {dist !== null && (
                      <div
                        className={`text-xs mt-0.5 ${
                          outOfRange ? 'text-status-danger-fg' : 'text-status-success-fg'
                        }`}
                      >
                        {dist} km from store · {outOfRange ? 'Out of delivery range (Pickup only)' : 'Within delivery range'}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await customerApi.deleteAddress(a.id);
                      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-primary">My Privacy & Data</div>
          <p className="text-xs text-ink-secondary">Remove saved addresses and product favourites.</p>
        </div>
        <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
          Delete My Saved Data
        </Button>
      </Card>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete saved addresses and favourites?"
        description="Your order invoices required for store tax records remain intact."
        confirmLabel="Delete Saved Data"
        onConfirm={async () => {
          await customerApi.deleteMyData();
          setDeleteConfirm(false);
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_ADDRESSES });
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_FAVOURITES(slug) });
          showToast({ tone: 'info', message: 'Saved profile data cleared.' });
        }}
      />
    </div>
  );
}
