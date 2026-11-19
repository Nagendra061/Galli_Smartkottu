import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MapPin, Package, Plus, ShoppingBag, ShoppingCart, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { NumberStepper } from '../../../../shared/components/forms/NumberStepper';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { useI18n } from '../../../../shared/i18n/I18nContext';
import type { Product } from '../../../../shared/types';
import { CustomerFloatingCartBar } from '../../components/CustomerFloatingCartBar';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi } from '../../services/customerApi';

export function CustomerStorePage() {
  const { slug = '', productId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedBrandId, setSelectedBrandId] = useState('all');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const cart = useCustomerCart(slug);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = data?.store;
  const { data: favouriteIds = [] } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_FAVOURITES(slug),
    queryFn: () => customerApi.listFavourites(store!.id),
    enabled: Boolean(store?.id && user?.role === 'customer'),
  });

  const favMutation = useMutation({
    mutationFn: (pid: string) => customerApi.toggleFavourite(store!.id, pid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CUSTOMER_FAVOURITES(slug) });
    },
  });

  // Track QR scan if utm_source is present
  useEffect(() => {
    const utmSource = searchParams.get('utm_source');
    if (slug && utmSource) {
      void customerApi.trackQrScan(slug, {
        utmSource,
        utmMedium: searchParams.get('utm_medium') || undefined,
        utmCampaign: searchParams.get('utm_campaign') || undefined,
      });
    }
  }, [slug, searchParams]);

  // Open product detail if route has :productId
  useEffect(() => {
    if (productId && data?.products) {
      const found = data.products.find((p) => p.id === productId);
      if (found) setDetailProduct(found);
    }
  }, [productId, data?.products]);

  const unitsById = useMemo(
    () => new Map((config?.units || []).map((u) => [u.id, u])),
    [config?.units]
  );

  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    const q = search.trim().toLowerCase();
    return data.products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (selectedBrandId !== 'all' && p.brandId !== selectedBrandId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        (p.brandName && p.brandName.toLowerCase().includes(q))
      );
    });
  }, [data?.products, search, selectedCategoryId, selectedBrandId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      </div>
    );
  }

  if (error || !data || !store) {
    return (
      <EmptyState
        title="Store not found"
        description="The store link may be incorrect or no longer active."
        action={<Button onClick={() => navigate(ROUTES.HOME)}>Go Home</Button>}
      />
    );
  }

  if (store.status === 'suspended') {
    return (
      <Card padding="lg" className="max-w-lg mx-auto text-center space-y-3 my-8">
        <StatusChip kind="custom" code="suspended" overrideLabel={t('store.suspendedBanner')} overrideTone="danger" />
        <h1 className="text-xl font-bold text-ink-primary">{store.name}</h1>
        <p className="text-sm text-ink-secondary">
          {store.suspensionReason || 'This store is temporarily unavailable for online orders.'}
        </p>
        {store.supportContact && (
          <p className="text-xs text-ink-muted">Support: {store.supportContact}</p>
        )}
      </Card>
    );
  }

  const cartQtyMap = new Map(cart.items.map((i) => [i.productId, i.qty]));

  return (
    <div className="space-y-5 pb-28 md:pb-12">
      {/* Store Header Banner */}
      <Card padding="md" className="space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink-primary">{store.name}</h1>
              <StatusChip
                kind="custom"
                code={store.isOpen ? 'open' : 'closed'}
                overrideLabel={store.isOpen ? 'Open' : 'Closed'}
                overrideTone={store.isOpen ? 'success' : 'danger'}
              />
            </div>
            <p className="text-xs text-ink-secondary mt-1 inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {store.address || 'Local neighbourhood store'} · {store.timings}
            </p>
          </div>
          <div className="text-right text-xs text-ink-secondary space-y-0.5">
            {store.minOrderPaise > 0 && (
              <div>
                Min order: <PriceText amountPaise={store.minOrderPaise} className="font-semibold" />
              </div>
            )}
            {store.deliveryEnabled && (
              <div>
                {store.deliveryEtaText}
                {store.deliveryRadiusKm > 0 ? ` · Within ${store.deliveryRadiusKm} km` : ''}
              </div>
            )}
          </div>
        </div>

        {!store.isOpen && (
          <Alert tone="warning" title={t('store.closedBanner')}>
            {store.closedReason || 'You can browse the catalogue, and checkout will reopen when the store opens.'}
          </Alert>
        )}
      </Card>

      {/* Active Offers Strip */}
      {data.offers.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {data.offers.map((offer) => (
            <div
              key={offer.id}
              className="shrink-0 rounded-xl border border-border-default bg-accent-soft px-3.5 py-2.5 text-xs space-y-0.5"
            >
              <div className="font-semibold text-accent-primary inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> {offer.title}
              </div>
              <div className="text-ink-secondary">
                {offer.offerType === 'percent' ? `Save ${offer.discountValue}%` : 'Special store offer'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search, Category & Brand Pills */}
      <div className="space-y-2.5">
        <SearchBar value={search} onChange={setSearch} placeholder="Search groceries, brands, categories..." />
        {data.categories.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Categories</div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer ${
                  selectedCategoryId === 'all'
                    ? 'bg-accent-primary text-ink-inverse border-accent-primary'
                    : 'bg-surface-card text-ink-secondary border-border-default'
                }`}
              >
                All Categories ({data.products.length})
              </button>
              {data.categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-accent-primary text-ink-inverse border-accent-primary'
                      : 'bg-surface-card text-ink-secondary border-border-default'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {data.brands && data.brands.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Brands</div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedBrandId('all')}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer ${
                  selectedBrandId === 'all'
                    ? 'bg-[#0f716a] text-ink-inverse border-[#0f716a]'
                    : 'bg-surface-card text-ink-secondary border-border-default hover:text-[#0f716a]'
                }`}
              >
                All Brands
              </button>
              {data.brands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setSelectedBrandId(brand.id)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border cursor-pointer ${
                    selectedBrandId === brand.id
                      ? 'bg-[#0f716a] text-ink-inverse border-[#0f716a]'
                      : 'bg-surface-card text-ink-secondary border-border-default hover:text-[#0f716a]'
                  }`}
                >
                  {brand.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title={data.products.length === 0 ? 'Store catalogue is empty' : 'No matching items'}
          description={
            data.products.length === 0
              ? 'This store is setting up its shelves. Check back shortly!'
              : 'Try another search term or category.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredProducts.map((p) => {
            const unitMeta = unitsById.get(p.unitId);
            const allowDecimal = unitMeta?.allowDecimal ?? false;
            const inCartQty = cartQtyMap.get(p.id) || 0;
            const effectivePrice = p.effectivePricePaise ?? p.sellingPricePaise;
            const hasDiscount = p.mrpPaise > effectivePrice;
            const outOfStock = !p.isAvailable || p.availableQty <= 0;
            const isFav = favouriteIds.includes(p.id);

            return (
              <Card key={p.id} padding="sm" className="flex flex-col justify-between gap-2.5">
                <div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDetailProduct(p)}
                      className="w-full aspect-square rounded-lg bg-surface-subtle overflow-hidden flex items-center justify-center cursor-pointer"
                    >
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-8 w-8 text-ink-muted" />
                      )}
                    </button>
                    {user?.role === 'customer' && (
                      <button
                        type="button"
                        aria-label="Toggle favourite"
                        onClick={() => favMutation.mutate(p.id)}
                        className="absolute top-1.5 right-1.5 h-8 w-8 rounded-full bg-surface-card/90 border border-border-default flex items-center justify-center cursor-pointer"
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            isFav ? 'fill-status-danger-fg text-status-danger-fg' : 'text-ink-muted'
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailProduct(p)}
                    className="mt-2 text-left w-full cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-ink-primary line-clamp-2">{p.name}</div>
                    {(p.brandName || p.categoryName) && (
                      <div className="text-[11px] font-medium text-accent-primary truncate mt-0.5">
                        {[p.brandName, p.categoryName].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      {p.unitLabel || unitMeta?.label || 'pcs'}
                      {p.activeOffer ? ` · ${p.activeOffer.title}` : ''}
                    </div>
                  </button>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-baseline gap-1.5">
                    <PriceText amountPaise={effectivePrice} className="text-sm font-bold text-ink-primary" />
                    {hasDiscount && (
                      <PriceText
                        amountPaise={p.mrpPaise}
                        className="text-xs text-ink-muted line-through"
                      />
                    )}
                  </div>

                  {outOfStock ? (
                    <div className="min-h-[40px] flex items-center justify-center rounded-lg bg-surface-subtle text-xs font-medium text-ink-muted">
                      Out of stock
                    </div>
                  ) : inCartQty > 0 ? (
                    <div className="flex justify-center">
                      <NumberStepper
                        value={inCartQty}
                        min={0}
                        max={p.availableQty}
                        step={allowDecimal ? 0.5 : 1}
                        allowDecimal={allowDecimal}
                        onChange={(qty) => cart.setItemQty(p.id, qty)}
                      />
                    </div>
                  ) : (
                    <Button
                      fullWidth
                      size="sm"
                      disabled={!store.isOpen}
                      onClick={() => {
                        cart.addProduct(p, allowDecimal);
                        showToast({ tone: 'success', message: `Added ${p.name}` });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Floating Cart Bar - Above Floating Navbar */}
      <CustomerFloatingCartBar slug={slug} />

      {/* Product Detail Modal */}
      <Modal
        open={Boolean(detailProduct)}
        onClose={() => setDetailProduct(null)}
        title={detailProduct?.name || 'Product'}
        size="sm"
        footer={
          detailProduct &&
          store.isOpen &&
          detailProduct.availableQty > 0 && (
            <Button
              fullWidth
              onClick={() => {
                const u = unitsById.get(detailProduct.unitId);
                cart.addProduct(detailProduct, u?.allowDecimal ?? false);
                setDetailProduct(null);
                showToast({ tone: 'success', message: `Added ${detailProduct.name}` });
              }}
            >
              Add to Cart —{' '}
              <PriceText amountPaise={detailProduct.effectivePricePaise ?? detailProduct.sellingPricePaise} />
            </Button>
          )
        }
      >
        {detailProduct && (
          <div className="space-y-3">
            {detailProduct.imageUrl && (
              <img
                src={detailProduct.imageUrl}
                alt={detailProduct.name}
                referrerPolicy="no-referrer"
                className="w-full h-48 object-cover rounded-lg bg-surface-subtle"
              />
            )}
            <div className="flex items-baseline justify-between">
              <PriceText
                amountPaise={detailProduct.effectivePricePaise ?? detailProduct.sellingPricePaise}
                className="text-xl font-bold text-ink-primary"
              />
              <span className="text-xs text-ink-secondary">
                {detailProduct.availableQty} {detailProduct.unitLabel || ''} available
              </span>
            </div>
            {detailProduct.description && (
              <p className="text-sm text-ink-secondary">{detailProduct.description}</p>
            )}
            <div className="text-xs text-ink-muted">
              {detailProduct.categoryName || 'Groceries'}
              {detailProduct.brandName ? ` · ${detailProduct.brandName}` : ''}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
