import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  CreditCard,
  Crosshair,
  Download,
  ExternalLink,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Printer,
  QrCode,
  Search,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  Users,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QrDisplay } from '../../../../shared/components/data-display/QrDisplay';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { FormField } from '../../../../shared/components/forms/FormField';
import { ImageUploader } from '../../../../shared/components/forms/ImageUploader';
import { MoneyInput } from '../../../../shared/components/forms/MoneyInput';
import { PhoneInput } from '../../../../shared/components/forms/PhoneInput';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { Select } from '../../../../shared/components/forms/Select';
import { TextInput } from '../../../../shared/components/forms/TextInput';
import { PageHeader } from '../../../../shared/components/layout/PageHeader';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { ProgressBar } from '../../../../shared/components/ui/ProgressBar';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { Switch } from '../../../../shared/components/ui/Switch';
import { Tabs } from '../../../../shared/components/ui/Tabs';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { smoApi } from '../../services/smoApi';

export function SmoAccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const routeTab = location.pathname.includes('/staff')
    ? 'staff'
    : location.pathname.includes('/support') || location.pathname.includes('/faqs')
    ? 'support'
    : location.pathname.includes('/subscription')
    ? 'subscription'
    : location.pathname.includes('/delete')
    ? 'delete'
    : location.pathname.includes('/settings')
    ? 'settings'
    : 'qr';

  const [tab, setTab] = useState<'qr' | 'settings' | 'payments' | 'staff' | 'support' | 'subscription' | 'delete'>(
    routeTab
  );
  useEffect(() => {
    setTab(routeTab);
  }, [routeTab]);

  const { data: settingsData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.SMO_STORE_SETTINGS,
    queryFn: smoApi.getStoreSettings,
  });

  const { data: staffList = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_STAFF,
    queryFn: smoApi.listStaff,
    enabled: user?.role === 'smo',
  });

  const { data: tickets = [] } = useQuery({
    queryKey: QUERY_KEYS.SMO_TICKETS,
    queryFn: smoApi.listTickets,
    enabled: user?.role === 'smo',
  });

  // Store Settings state
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [timings, setTimings] = useState('');
  const [brandColor, setBrandColor] = useState('#0F766E');
  const [isOpen, setIsOpen] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryFeePaise, setDeliveryFeePaise] = useState(0);
  const [minOrderPaise, setMinOrderPaise] = useState(0);
  const [deliveryEtaText, setDeliveryEtaText] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('5');
  const [storeLat, setStoreLat] = useState('');
  const [storeLng, setStoreLng] = useState('');
  const [geocodingStore, setGeocodingStore] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [allowZeroStockPos, setAllowZeroStockPos] = useState(false);
  const [staffCanVerifyPayment, setStaffCanVerifyPayment] = useState(true);

  // Payments tab state
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [upiId, setUpiId] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [upiQrUrl, setUpiQrUrl] = useState<string | null>(null);
  const [requireReference, setRequireReference] = useState(true);
  const [payPickupEnabled, setPayPickupEnabled] = useState(true);
  const [cashEnabled, setCashEnabled] = useState(true);
  const [khataEnabled, setKhataEnabled] = useState(true);

  // Staff state
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'cashier' | 'packer' | 'manager'>('cashier');

  // Support & FAQ state
  const [faqSearch, setFaqSearch] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketBody, setTicketBody] = useState('');
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Delete account & QR share modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [sharingPoster, setSharingPoster] = useState(false);

  useEffect(() => {
    if (!settingsData?.store) return;
    const s = settingsData.store;
    setStoreName(s.name);
    setAddress(s.address);
    setPhone(s.phone);
    setTimings(s.timings);
    setBrandColor(s.brandColor || '#0F766E');
    setIsOpen(s.isOpen);
    setDeliveryEnabled(s.deliveryEnabled);
    setPickupEnabled(s.pickupEnabled);
    setDeliveryFeePaise(s.deliveryFeePaise);
    setMinOrderPaise(s.minOrderPaise);
    setDeliveryEtaText(s.deliveryEtaText);
    setDeliveryRadiusKm(String(s.deliveryRadiusKm ?? 5));
    setStoreLat(s.storeLat != null ? String(s.storeLat) : '');
    setStoreLng(s.storeLng != null ? String(s.storeLng) : '');
    setSoundAlertsEnabled(s.soundAlertsEnabled);
    setAllowZeroStockPos(s.allowZeroStockPos);
    setStaffCanVerifyPayment(s.staffCanVerifyPayment);

    const upi = s.paymentMethods.find((m) => m.methodCode === 'upi');
    if (upi) {
      setUpiEnabled(upi.enabled);
      setUpiId(upi.upiId || '');
      setPayeeName(upi.payeeName || '');
      setUpiQrUrl(upi.upiQrUrl || null);
      setRequireReference(upi.requireReference);
    }
    setPayPickupEnabled(Boolean(s.paymentMethods.find((m) => m.methodCode === 'pay_at_pickup')?.enabled));
    setCashEnabled(Boolean(s.paymentMethods.find((m) => m.methodCode === 'cash')?.enabled));
    setKhataEnabled(Boolean(s.paymentMethods.find((m) => m.methodCode === 'khata')?.enabled));
  }, [settingsData]);

  const invalidateSettings = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_STORE_SETTINGS });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_HOME });
  };

  const saveSettingsMutation = useMutation({
    mutationFn: () => {
      const parsedRadius = deliveryRadiusKm.trim() === '' ? 0 : Number(deliveryRadiusKm);
      const parsedLat = storeLat.trim() === '' ? null : Number(storeLat);
      const parsedLng = storeLng.trim() === '' ? null : Number(storeLng);
      if (Number.isNaN(parsedRadius) || parsedRadius < 0) {
        throw new Error('Delivery range must be 0 km or greater.');
      }
      if ((parsedLat !== null && Number.isNaN(parsedLat)) || (parsedLng !== null && Number.isNaN(parsedLng))) {
        throw new Error('Enter valid numeric latitude and longitude coordinates.');
      }
      return smoApi.updateStoreSettings({
        name: storeName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        timings: timings.trim(),
        brandColor,
        isOpen,
        deliveryEnabled,
        pickupEnabled,
        deliveryFeePaise,
        minOrderPaise,
        deliveryEtaText: deliveryEtaText.trim(),
        deliveryRadiusKm: parsedRadius,
        storeLat: parsedLat,
        storeLng: parsedLng,
        soundAlertsEnabled,
        allowZeroStockPos,
        staffCanVerifyPayment,
      });
    },
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Store settings saved.' });
      invalidateSettings();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Save failed.' }),
  });

  const handleFindStoreCoordinates = async () => {
    if (!address.trim()) {
      showToast({ tone: 'warning', message: 'Enter a store address first.' });
      return;
    }
    setGeocodingStore(true);
    try {
      const res = await smoApi.geocodeAddress(address.trim());
      if (res.results.length > 0) {
        setStoreLat(String(Number(res.results[0].lat.toFixed(6))));
        setStoreLng(String(Number(res.results[0].lng.toFixed(6))));
        showToast({ tone: 'success', message: `Location matched: ${res.results[0].displayName}` });
      } else {
        showToast({
          tone: 'warning',
          message: 'Address could not be matched automatically. Use GPS or enter coordinates manually.',
        });
      }
    } finally {
      setGeocodingStore(false);
    }
  };

  const handleUseCurrentStoreGps = () => {
    if (!navigator.geolocation) {
      showToast({ tone: 'error', message: 'Geolocation is not supported in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStoreLat(String(Number(pos.coords.latitude.toFixed(6))));
        setStoreLng(String(Number(pos.coords.longitude.toFixed(6))));
        showToast({ tone: 'success', message: 'Current GPS location captured for store.' });
      },
      () => {
        showToast({
          tone: 'warning',
          message: 'Location access denied or blocked. Enter store latitude/longitude manually.',
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const savePaymentsMutation = useMutation({
    mutationFn: async () => {
      await smoApi.updatePaymentMethod({
        methodCode: 'upi',
        enabled: upiEnabled,
        upiId: upiId.trim() || null,
        payeeName: payeeName.trim() || null,
        upiQrUrl,
        requireReference,
      });
      await smoApi.updatePaymentMethod({ methodCode: 'pay_at_pickup', enabled: payPickupEnabled });
      await smoApi.updatePaymentMethod({ methodCode: 'cash', enabled: cashEnabled });
      await smoApi.updatePaymentMethod({ methodCode: 'khata', enabled: khataEnabled });
    },
    onSuccess: () => {
      showToast({ tone: 'success', message: 'Payment methods updated.' });
      invalidateSettings();
    },
    onError: (err: unknown) =>
      showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Payment settings invalid.' }),
  });

  const filteredFaqs = useMemo(() => {
    const faqs = config?.faqs || [];
    const q = faqSearch.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
    );
  }, [config?.faqs, faqSearch]);

  if (isLoading || !settingsData) {
    return <Skeleton className="h-56 w-full" />;
  }

  const { store, qrDataUrl: serverQrDataUrl, plan, usage } = settingsData;
  const storeUrl = `${window.location.origin}/store/${store.slug}`;
  const isOwner = user?.role === 'smo';

  const [clientQrDataUrl, setClientQrDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    const targetUrl = `${storeUrl}?utm_source=qr`;
    QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((dataUri) => {
        if (active) setClientQrDataUrl(dataUri);
      })
      .catch(() => {
        // Fallback to server qr
      });
    return () => {
      active = false;
    };
  }, [storeUrl]);

  const qrDataUrl = clientQrDataUrl || serverQrDataUrl;

  const defaultShareMessage = `Shop online at ${store.name}${store.address ? ` (${store.address})` : ''}! Scan the QR code or tap our store link to browse & order:`;

  const buildQrPosterBlob = async (): Promise<Blob | null> => {
    if (!qrDataUrl) return null;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = qrDataUrl;
      });
      const width = 720;
      const height = 920;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = store.brandColor || '#0F766E';
      ctx.fillRect(0, 0, width, 16);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(store.name.slice(0, 34), width / 2, 92);

      if (store.address) {
        ctx.fillStyle = '#4B5563';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillText(store.address.slice(0, 56), width / 2, 132);
      }

      const qrSize = 460;
      const qrX = (width - qrSize) / 2;
      const qrY = 180;
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 18, qrY - 18, qrSize + 36, qrSize + 36);
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#111827';
      ctx.font = '600 24px system-ui, -apple-system, sans-serif';
      ctx.fillText('Scan to browse & order online', width / 2, 710);

      ctx.fillStyle = '#0F766E';
      ctx.font = '20px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        store.timings ? `Open: ${store.timings.slice(0, 44)}` : 'Fresh groceries delivered or ready for pickup',
        width / 2,
        764
      );

      if (store.phone) {
        ctx.fillStyle = '#6B7280';
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Store Phone: ${store.phone}`, width / 2, 822);
      }

      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch {
      return null;
    }
  };

  const downloadQr = async () => {
    const posterBlob = await buildQrPosterBlob();
    if (posterBlob) {
      const url = URL.createObjectURL(posterBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.slug}-qr-poster.png`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${store.slug}-qr-poster.png`;
    a.click();
  };

  const openShareModal = () => {
    setShareMessage(defaultShareMessage);
    setShareModalOpen(true);
  };

  const effectiveShareText = (shareMessage || defaultShareMessage).trim();
  const fullShareText = `${effectiveShareText} ${storeUrl}`.trim();

  const handleNativeShareQr = async () => {
    setSharingPoster(true);
    try {
      const posterBlob = await buildQrPosterBlob();
      const qrFile = posterBlob
        ? new File([posterBlob], `${store.slug}-qr-poster.png`, { type: 'image/png' })
        : null;

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (qrFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [qrFile] })) {
          await navigator.share({
            title: `${store.name} — Store QR`,
            text: effectiveShareText,
            url: storeUrl,
            files: [qrFile],
          });
          showToast({ tone: 'success', message: 'Store QR shared.' });
          return;
        }
        await navigator.share({
          title: `${store.name} — Order Online`,
          text: effectiveShareText,
          url: storeUrl,
        });
        showToast({ tone: 'success', message: 'Store link shared.' });
        return;
      }

      await downloadQr();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullShareText);
      }
      showToast({
        tone: 'info',
        message: 'QR poster downloaded and invite message copied. Choose any app below to share.',
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showToast({ tone: 'info', message: 'Use any social app link below or download the QR poster to share.' });
    } finally {
      setSharingPoster(false);
    }
  };

  const socialShareTargets = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(fullShareText)}`,
      badge: 'WA',
      accent: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    },
    {
      id: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodeURIComponent(storeUrl)}&text=${encodeURIComponent(effectiveShareText)}`,
      badge: 'TG',
      accent: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(storeUrl)}&quote=${encodeURIComponent(effectiveShareText)}`,
      badge: 'FB',
      accent: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    },
    {
      id: 'x',
      label: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(effectiveShareText)}&url=${encodeURIComponent(storeUrl)}`,
      badge: 'X',
      accent: 'bg-neutral-100 text-neutral-800 border-neutral-300 hover:bg-neutral-200',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(storeUrl)}`,
      badge: 'IN',
      accent: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    },
    {
      id: 'email',
      label: 'Email',
      href: `mailto:?subject=${encodeURIComponent(`Shop online at ${store.name}`)}&body=${encodeURIComponent(fullShareText)}`,
      badge: 'Email',
      accent: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    },
    {
      id: 'sms',
      label: 'SMS',
      href: `sms:?body=${encodeURIComponent(fullShareText)}`,
      badge: 'SMS',
      accent: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    },
  ];

  const exportStoreJson = async () => {
    const [prods, orders, khata] = await Promise.all([
      smoApi.listProducts(true),
      smoApi.listOrders(),
      smoApi.listKhataAccounts(),
    ]);
    const payload = { exportedAt: new Date().toISOString(), store, products: prods, orders, khata };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.slug}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Store & Account"
        subtitle={`Signed in as ${user?.name} (${user?.role.toUpperCase()})`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              logout();
              navigate(ROUTES.OWNER_LOGIN);
            }}
            className="hover:bg-status-danger-fg! hover:text-ink-inverse! hover:border-status-danger-fg! focus-visible:bg-status-danger-fg! focus-visible:text-ink-inverse! focus-visible:border-status-danger-fg! active:bg-status-danger-fg! active:text-ink-inverse!"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        }
      />

      <Tabs
        activeId={tab}
        onChange={(id) => {
          const next = id as typeof tab;
          setTab(next);
          if (next === 'settings') navigate(ROUTES.OWNER_SETTINGS);
          if (next === 'staff') navigate(ROUTES.OWNER_STAFF);
          if (next === 'support') navigate(ROUTES.OWNER_SUPPORT);
          if (next === 'subscription') navigate(ROUTES.OWNER_SUBSCRIPTION);
          if (next === 'delete') navigate(ROUTES.OWNER_DELETE_ACCOUNT);
        }}
        options={[
          { id: 'qr', label: 'Store QR & Link' },
          ...(isOwner ? [{ id: 'settings', label: 'Store Settings' }] : []),
          ...(isOwner ? [{ id: 'payments', label: 'Payments & UPI' }] : []),
          ...(isOwner ? [{ id: 'staff', label: 'Staff', count: staffList.length }] : []),
          { id: 'support', label: 'Support & FAQs' },
          ...(isOwner ? [{ id: 'subscription', label: 'Plan & Version' }] : []),
          ...(isOwner ? [{ id: 'delete', label: 'Delete Account' }] : []),
        ]}
      />

      {tab === 'qr' && (
        <Card padding="lg" className="max-w-xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <QrCode className="h-4 w-4 text-accent-primary" /> Customer Storefront QR Poster
          </div>
          <h2 className="text-xl font-bold text-ink-primary">{store.name}</h2>
          <p className="text-xs text-ink-secondary">{store.address}</p>
          <div>
            <QrDisplay src={qrDataUrl} alt={`${store.name} QR Code`} size="lg" caption="Scan to browse & order online" />
          </div>
          <div className="flex flex-wrap justify-center gap-2 print:hidden">
            <Button size="sm" onClick={openShareModal}>
              <Share2 className="h-4 w-4" /> Share QR
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(storeUrl);
                showToast({ tone: 'success', message: 'Store link copied.' });
              }}
            >
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void downloadQr()}>
              <Download className="h-4 w-4" /> Download QR
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print Poster
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/store/${store.slug}`)}>
              <ExternalLink className="h-4 w-4" /> Open Storefront
            </Button>
          </div>
        </Card>
      )}

      {tab === 'settings' && isOwner && (
        <Card padding="md" className="space-y-4 max-w-2xl">
          <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
            <Settings className="h-4 w-4" /> General & Fulfilment Settings
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Store Name" htmlFor="st-name" required>
              <TextInput id="st-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </FormField>
            <FormField label="Phone" htmlFor="st-phone">
              <TextInput id="st-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Address" htmlFor="st-addr">
            <TextInput id="st-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>

          {/* Delivery Range & Store Coordinates */}
          <div className="rounded-xl border border-border-default bg-surface-subtle/60 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink-primary inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-accent-primary" /> Delivery Range from Store Address
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isLoading={geocodingStore}
                  onClick={() => void handleFindStoreCoordinates()}
                >
                  <Search className="h-3.5 w-3.5" /> Lookup from Address
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={handleUseCurrentStoreGps}>
                  <Crosshair className="h-3.5 w-3.5" /> Use Current GPS
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                label="Delivery Range (km)"
                htmlFor="st-radius"
                hint="0 = unlimited range"
              >
                <TextInput
                  id="st-radius"
                  type="number"
                  min="0"
                  step="0.5"
                  value={deliveryRadiusKm}
                  onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                  placeholder="5"
                />
              </FormField>
              <FormField label="Store Latitude" htmlFor="st-lat">
                <TextInput
                  id="st-lat"
                  type="number"
                  step="0.000001"
                  value={storeLat}
                  onChange={(e) => setStoreLat(e.target.value)}
                  placeholder="12.9784"
                />
              </FormField>
              <FormField label="Store Longitude" htmlFor="st-lng">
                <TextInput
                  id="st-lng"
                  type="number"
                  step="0.000001"
                  value={storeLng}
                  onChange={(e) => setStoreLng(e.target.value)}
                  placeholder="77.6408"
                />
              </FormField>
            </div>

            <p className="text-xs text-ink-secondary">
              {Number(deliveryRadiusKm) > 0
                ? `Customers within ${deliveryRadiusKm} km of your store location can choose Home Delivery. Customers outside ${deliveryRadiusKm} km will receive an out-of-range alert and be guided to choose Store Pickup.`
                : 'Delivery range limit is disabled (0 km). All customers can select Home Delivery when enabled.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Opening Hours" htmlFor="st-time">
              <TextInput id="st-time" value={timings} onChange={(e) => setTimings(e.target.value)} />
            </FormField>
            <FormField label="Delivery ETA" htmlFor="st-eta">
              <TextInput id="st-eta" value={deliveryEtaText} onChange={(e) => setDeliveryEtaText(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="Delivery Fee" htmlFor="st-dfee">
              <MoneyInput id="st-dfee" valuePaise={deliveryFeePaise} onChangePaise={setDeliveryFeePaise} />
            </FormField>
            <FormField label="Min Order" htmlFor="st-min">
              <MoneyInput id="st-min" valuePaise={minOrderPaise} onChangePaise={setMinOrderPaise} />
            </FormField>
            <FormField label="Brand Accent" htmlFor="st-color">
              <input
                id="st-color"
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-11 w-full rounded-lg border border-border-strong bg-surface-card p-1 cursor-pointer"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border-default">
            <Switch label="Store Open for Online Orders" checked={isOpen} onChange={setIsOpen} />
            <Switch label="Delivery Enabled" checked={deliveryEnabled} onChange={setDeliveryEnabled} />
            <Switch label="Store Pickup Enabled" checked={pickupEnabled} onChange={setPickupEnabled} />
            <Switch label="New Order Sound Alerts" checked={soundAlertsEnabled} onChange={setSoundAlertsEnabled} />
            <Switch label="Allow Zero-Stock POS Billing" checked={allowZeroStockPos} onChange={setAllowZeroStockPos} />
            <Switch label="Staff Can Verify UPI" checked={staffCanVerifyPayment} onChange={setStaffCanVerifyPayment} />
          </div>
          <Button isLoading={saveSettingsMutation.isPending} onClick={() => saveSettingsMutation.mutate()}>
            Save Settings
          </Button>
        </Card>
      )}

      {tab === 'payments' && isOwner && (
        <Card padding="md" className="space-y-4 max-w-2xl">
          <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" /> Store Payment Methods & UPI QR
          </h3>
          <Alert tone="info">
            Configure your UPI ID and/or upload your store UPI QR image. Customers scan or tap this directly at checkout.
          </Alert>
          <div className="space-y-3 rounded-xl border border-border-default p-4">
            <Switch label="Accept UPI Payments" checked={upiEnabled} onChange={setUpiEnabled} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="UPI ID (VPA)" htmlFor="pay-upi">
                <TextInput
                  id="pay-upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="merchant@okicici"
                />
              </FormField>
              <FormField label="Payee Name" htmlFor="pay-payee">
                <TextInput
                  id="pay-payee"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder={store.name}
                />
              </FormField>
            </div>
            <ImageUploader
              label="Upload Store UPI QR Code Image"
              value={upiQrUrl}
              onChange={setUpiQrUrl}
            />
            <Switch
              label="Require UPI UTR / Reference Number from Customer"
              checked={requireReference}
              onChange={setRequireReference}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Switch label="Pay at Pickup" checked={payPickupEnabled} onChange={setPayPickupEnabled} />
            <Switch label="Cash on Delivery" checked={cashEnabled} onChange={setCashEnabled} />
            <Switch label="Customer Khata" checked={khataEnabled} onChange={setKhataEnabled} />
          </div>

          <Button isLoading={savePaymentsMutation.isPending} onClick={() => savePaymentsMutation.mutate()}>
            Save Payment Configuration
          </Button>
        </Card>
      )}

      {tab === 'staff' && isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card padding="md" className="md:col-span-5 space-y-3">
            <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Add Store Staff
            </h3>
            <p className="text-xs text-ink-secondary">
              Staff can use Counter POS, pack online orders, and view Khata, but Financial Intelligence is restricted to owners.
            </p>
            <FormField label="Full Name" htmlFor="stf-name" required>
              <TextInput id="stf-name" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </FormField>
            <FormField label="Phone" htmlFor="stf-phone" required>
              <PhoneInput id="stf-phone" value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} />
            </FormField>
            <FormField label="Password" htmlFor="stf-pass" required>
              <TextInput
                id="stf-pass"
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
              />
            </FormField>
            <FormField label="Role" htmlFor="stf-role">
              <Select
                id="stf-role"
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as 'cashier' | 'packer' | 'manager')}
              >
                <option value="cashier">Cashier</option>
                <option value="packer">Packer</option>
                <option value="manager">Manager</option>
              </Select>
            </FormField>
            <Button
              disabled={!staffName.trim() || staffPhone.length < 10 || staffPassword.length < 4}
              onClick={async () => {
                try {
                  await smoApi.createStaff({
                    name: staffName.trim(),
                    phone: staffPhone,
                    password: staffPassword,
                    staffRole,
                  });
                  setStaffName('');
                  setStaffPhone('');
                  setStaffPassword('');
                  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_STAFF });
                  showToast({ tone: 'success', message: 'Staff member added.' });
                } catch (err) {
                  showToast({ tone: 'error', message: err instanceof Error ? err.message : 'Failed.' });
                }
              }}
            >
              Create Staff Login
            </Button>
          </Card>

          <div className="md:col-span-7 space-y-2.5">
            {staffList.length === 0 ? (
              <EmptyState title="No staff accounts" description="Add cashiers or packers for counter & order packing." />
            ) : (
              staffList.map((st) => (
                <Card key={st.id} padding="md" className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{st.name}</div>
                    <div className="text-xs text-ink-secondary capitalize">
                      {st.staffRole} · {st.phone}
                    </div>
                  </div>
                  <Switch
                    label={st.isActive ? 'Active' : 'Disabled'}
                    checked={st.isActive}
                    onChange={async (checked) => {
                      await smoApi.toggleStaff(st.id, checked);
                      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_STAFF });
                    }}
                  />
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card padding="md" className="md:col-span-6 space-y-3">
            <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4" /> FAQs
            </h3>
            <SearchBar value={faqSearch} onChange={setFaqSearch} placeholder="Search help topics..." />
            {filteredFaqs.length === 0 ? (
              <EmptyState title="No matching FAQs" description="Submit a support ticket for help." />
            ) : (
              <div className="space-y-2">
                {filteredFaqs.map((f) => (
                  <details key={f.id} className="rounded-lg border border-border-default p-3 text-sm">
                    <summary className="font-medium text-ink-primary cursor-pointer">{f.question}</summary>
                    <p className="mt-2 text-xs text-ink-secondary">{f.answer}</p>
                  </details>
                ))}
              </div>
            )}
          </Card>

          {isOwner && (
            <div className="md:col-span-6 space-y-4">
              <Card padding="md" className="space-y-3">
                <h3 className="text-sm font-semibold text-ink-primary inline-flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" /> Raise Support Ticket
                </h3>
                <FormField label="Subject" htmlFor="tk-sub" required>
                  <TextInput id="tk-sub" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} />
                </FormField>
                <FormField label="Description" htmlFor="tk-body" required>
                  <textarea
                    id="tk-body"
                    rows={3}
                    value={ticketBody}
                    onChange={(e) => setTicketBody(e.target.value)}
                    className="w-full rounded-lg border border-border-strong bg-surface-card p-3 text-sm text-ink-primary"
                  />
                </FormField>
                <Button
                  disabled={ticketSubject.trim().length < 3 || ticketBody.trim().length < 3}
                  onClick={async () => {
                    await smoApi.createTicket({ subject: ticketSubject.trim(), body: ticketBody.trim() });
                    setTicketSubject('');
                    setTicketBody('');
                    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_TICKETS });
                    showToast({ tone: 'success', message: 'Support ticket submitted.' });
                  }}
                >
                  Submit Ticket
                </Button>
              </Card>

              {tickets.map((tk) => {
                const t = tk as {
                  id: string;
                  subject: string;
                  status: string;
                  messages: { id: string; senderName: string; body: string }[];
                };
                return (
                  <Card key={t.id} padding="md" className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-primary">{t.subject}</span>
                      <StatusChip kind="custom" code={t.status} overrideLabel={t.status} overrideTone="info" />
                    </div>
                    <div className="space-y-1 text-xs">
                      {t.messages?.map((m) => (
                        <div key={m.id} className="rounded bg-surface-subtle p-2">
                          <span className="font-semibold">{m.senderName}: </span>
                          {m.body}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <TextInput
                        value={replyTexts[t.id] || ''}
                        onChange={(e) => setReplyTexts((p) => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="Reply..."
                      />
                      <Button
                        size="sm"
                        onClick={async () => {
                          const msg = (replyTexts[t.id] || '').trim();
                          if (!msg) return;
                          await smoApi.replyTicket(t.id, msg);
                          setReplyTexts((p) => ({ ...p, [t.id]: '' }));
                          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SMO_TICKETS });
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'subscription' && isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <Card padding="md" className="space-y-4">
            <h3 className="text-sm font-semibold text-ink-primary">
              Current Plan: {plan?.name || 'Active Plan'}
            </h3>
            <div className="space-y-3">
              <ProgressBar
                label="Products Used"
                value={usage.productsCount}
                max={plan?.max_products || 500}
              />
              <ProgressBar
                label="Active Staff"
                value={usage.staffCount}
                max={plan?.max_staff || 5}
              />
            </div>
          </Card>

          <Card padding="md" className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-primary">
              {config?.appSettings.appName} v{config?.appSettings.appVersion}
            </h3>
            <p className="text-xs text-ink-secondary">{config?.appSettings.appSlogan}</p>
            <div className="rounded-lg bg-surface-subtle p-3 text-xs text-ink-secondary whitespace-pre-wrap">
              {config?.appSettings.changelog || 'No changelog notes.'}
            </div>
          </Card>
        </div>
      )}

      {tab === 'delete' && isOwner && (
        <Card padding="md" className="max-w-xl space-y-4">
          <div className="flex items-center gap-2 text-status-danger-fg font-semibold text-sm">
            <ShieldAlert className="h-5 w-5" /> Delete Store Account
          </div>
          <p className="text-xs text-ink-secondary">
            Requesting deletion places your store in a 30-day compliance grace period before permanent removal. Export your store data first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportStoreJson()}>
              <Download className="h-4 w-4" /> Export Store Data (JSON)
            </Button>
            <Button variant="danger" onClick={() => setDeleteDialogOpen(true)}>
              Request Store Deletion
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={`Share ${store.name} QR`}
        size="md"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(fullShareText);
                showToast({ tone: 'success', message: 'Invite message & store link copied.' });
              }}
            >
              <Copy className="h-4 w-4" /> Copy Message & Link
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void downloadQr()}>
              <Download className="h-4 w-4" /> Download QR Poster
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-border-default bg-surface-subtle/60 p-3.5">
            <QrDisplay src={qrDataUrl} alt={`${store.name} QR Code`} size="sm" />
            <div className="flex-1 text-center sm:text-left space-y-1 min-w-0">
              <div className="text-sm font-bold text-ink-primary truncate">{store.name}</div>
              {store.address && <div className="text-xs text-ink-secondary">{store.address}</div>}
              <div className="pt-2">
                <Button size="sm" isLoading={sharingPoster} onClick={() => void handleNativeShareQr()}>
                  <Share2 className="h-4 w-4" /> Share QR Image via Apps
                </Button>
              </div>
            </div>
          </div>

          <FormField label="Custom Invite Message" htmlFor="qr-share-msg">
            <textarea
              id="qr-share-msg"
              rows={2}
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-surface-card p-2.5 text-sm text-ink-primary"
            />
          </FormField>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Share on Social Media & Messaging
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {socialShareTargets.map((target) => (
                <a
                  key={target.id}
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${target.accent}`}
                >
                  {target.id === 'whatsapp' || target.id === 'sms' ? (
                    <MessageCircle className="h-4 w-4 shrink-0" />
                  ) : target.id === 'telegram' ? (
                    <Send className="h-4 w-4 shrink-0" />
                  ) : target.id === 'email' ? (
                    <Mail className="h-4 w-4 shrink-0" />
                  ) : (
                    <Share2 className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{target.label}</span>
                </a>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">
              For Instagram Stories or WhatsApp Status, tap <strong>Download QR Poster</strong> and upload the PNG directly.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Confirm Store Deletion Request"
        description="Your store will enter a 30-day grace period before final removal by Platform Admin."
        confirmLabel="Submit Deletion Request"
        typeToConfirm={store.slug}
        reasonLabel="Reason for leaving"
        onConfirm={async (reason) => {
          if (!reason) return;
          await smoApi.requestAccountDeletion(reason);
          setDeleteDialogOpen(false);
          showToast({ tone: 'info', message: 'Deletion request submitted.' });
        }}
      />
    </div>
  );
}
