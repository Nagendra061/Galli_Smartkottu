import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Clock,
  Heart,
  Layers,
  MapPin,
  Package,
  Phone,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { Alert } from '../../../../shared/components/feedback/Alert';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { NumberStepper } from '../../../../shared/components/forms/NumberStepper';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { StatusChip } from '../../../../shared/components/ui/StatusChip';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import { useI18n } from '../../../../shared/i18n/I18nContext';
import type { OrderRecord, Product } from '../../../../shared/types';
import { CustomerFloatingCartBar } from '../../components/CustomerFloatingCartBar';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi } from '../../services/customerApi';

export function CustomerHomePage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const cart = useCustomerCart(slug);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = data?.store;

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

  // Recent orders for "Order Again" strip
  const { data: recentOrders = [] } = useQuery({
    queryKey: QUERY_KEYS.CUSTOMER_ORDERS(slug),
    queryFn: () => customerApi.listOrders(store?.id),
    enabled: Boolean(user?.role === 'customer' && store?.id),
  });

  const unitsById = useMemo(
    () => new Map((config?.units || []).map((u) => [u.id, u])),
    [config?.units]
  );

  const cartQtyMap = useMemo(
    () => new Map(cart.items.map((i) => [i.productId, i.qty])),
    [cart.items]
  );

  // Products grouped by category count
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    (data?.products || []).forEach((p) => {
      if (p.categoryId) {
        map.set(p.categoryId, (map.get(p.categoryId) || 0) + 1);
      }
    });
    return map;
  }, [data?.products]);

  // Featured / Popular products (e.g. discounted first, then top 8)
  const featuredProducts = useMemo(() => {
    if (!data?.products) return [];
    const prods = [...data.products];
    // Prioritize discounted or available items
    prods.sort((a, b) => {
      const aDisc = (a.mrpPaise || 0) - (a.effectivePricePaise || a.sellingPricePaise);
      const bDisc = (b.mrpPaise || 0) - (b.effectivePricePaise || b.sellingPricePaise);
      return bDisc - aDisc;
    });
    return prods.slice(0, 8);
  }, [data?.products]);

  const handleReorder = (order: OrderRecord) => {
    const productMap = new Map((data?.products || []).map((p) => [p.id, p]));
    let added = 0;
    for (const item of order.items) {
      if (!item.productId) continue;
      const prod = productMap.get(item.productId);
      if (prod && prod.availableQty > 0) {
        cart.addProduct(prod, false, Math.min(prod.availableQty, item.qty));
        added += 1;
      }
    }
    if (added > 0) {
      showToast({ tone: 'success', message: `${added} item(s) re-added to cart.` });
      navigate(ROUTES.STORE_CART.replace(':slug', slug));
    } else {
      showToast({ tone: 'warning', message: 'Items from this order are currently unavailable.' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
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

  const latestOrder = recentOrders[0];

  return (
    <div className="space-y-6 pb-28 md:pb-12">
      {/* Store Header Hero */}
      <div className="rounded-2xl border border-border-default bg-surface-card p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-ink-primary">{store.name}</h1>
              <StatusChip
                kind="custom"
                code={store.isOpen ? 'open' : 'closed'}
                overrideLabel={store.isOpen ? 'Open Now' : 'Closed'}
                overrideTone={store.isOpen ? 'success' : 'danger'}
              />
            </div>
            <p className="text-xs text-ink-secondary flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
              <span>{store.address || 'Local neighbourhood store'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
            {store.timings && (
              <div className="flex items-center gap-1.5 bg-surface-subtle px-2.5 py-1.5 rounded-lg">
                <Clock className="h-3.5 w-3.5 text-ink-muted" />
                <span>{store.timings}</span>
              </div>
            )}
            {store.deliveryEnabled && (
              <div className="flex items-center gap-1.5 bg-surface-subtle px-2.5 py-1.5 rounded-lg">
                <Truck className="h-3.5 w-3.5 text-accent-primary" />
                <span>
                  {store.deliveryEtaText || 'Delivery available'}
                  {store.deliveryRadiusKm > 0 ? ` · ${store.deliveryRadiusKm} km` : ''}
                </span>
              </div>
            )}
            {store.minOrderPaise > 0 && (
              <div className="bg-surface-subtle px-2.5 py-1.5 rounded-lg">
                Min order: <PriceText amountPaise={store.minOrderPaise} className="font-semibold text-ink-primary" />
              </div>
            )}
          </div>
        </div>

        {!store.isOpen && (
          <Alert tone="warning" title={t('store.closedBanner')}>
            {store.closedReason || 'You can browse the catalogue, and checkout will reopen when the store opens.'}
          </Alert>
        )}
      </div>

      {/* Special Offers Strip */}
      {data.offers.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide uppercase text-ink-muted flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-accent-primary" /> Exclusive Offers & Deals
            </h2>
            <Link
              to={`/store/${slug}/products`}
              className="text-xs font-semibold text-accent-primary hover:underline inline-flex items-center gap-1"
            >
              Shop Deals <ChevronRightIcon className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.offers.map((offer) => (
              <div
                key={offer.id}
                className="shrink-0 w-72 rounded-xl border border-accent-primary/20 bg-accent-soft/40 p-3.5 text-xs space-y-1.5 shadow-sm"
              >
                <div className="font-bold text-accent-primary text-sm inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" /> {offer.title}
                </div>
                <div className="text-ink-secondary text-xs">
                  {offer.offerType === 'percent' ? `Save ${offer.discountValue}% on your order` : 'Special store offer'}
                </div>
                {offer.minCartPaise > 0 && (
                  <div className="text-[11px] text-ink-muted">
                    Min order: <PriceText amountPaise={offer.minCartPaise} className="font-semibold" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick Category Navigation */}
      {data.categories.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-primary flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent-primary" /> Shop by Category
            </h2>
            <Link
              to={`/store/${slug}/products`}
              className="text-xs font-semibold text-accent-primary hover:underline inline-flex items-center gap-1"
            >
              View All Catalogue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.categories.map((cat) => {
              const count = categoryCounts.get(cat.id) || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => navigate(`/store/${slug}/products?category=${cat.id}`)}
                  className="flex flex-col items-start justify-between p-3.5 rounded-xl border border-border-default bg-surface-card hover:border-accent-primary hover:bg-accent-soft/30 transition-all text-left group cursor-pointer shadow-xs"
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-subtle group-hover:bg-accent-primary group-hover:text-ink-inverse flex items-center justify-center transition-colors">
                    <Package className="h-5 w-5 text-ink-secondary group-hover:text-ink-inverse" />
                  </div>
                  <div className="mt-2.5">
                    <div className="text-sm font-semibold text-ink-primary group-hover:text-accent-primary transition-colors">
                      {cat.name}
                    </div>
                    <div className="text-[11px] text-ink-muted mt-0.5">
                      {count} {count === 1 ? 'item' : 'items'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Reorder Strip for Logged-in Customers */}
      {user?.role === 'customer' && latestOrder && (
        <Card padding="md" className="space-y-3 bg-gradient-to-r from-accent-soft/40 to-surface-card border-accent-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-accent-primary inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Order Again
              </div>
              <div className="text-sm font-semibold text-ink-primary mt-0.5">
                Past Order {latestOrder.orderNumber} ({latestOrder.items.length} items)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(ROUTES.STORE_ORDER_TRACK.replace(':slug', slug).replace(':orderId', latestOrder.id))}
              >
                Track Order
              </Button>
              <Button size="sm" onClick={() => handleReorder(latestOrder)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reorder Items
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Top Picks / Popular Products */}
      {featuredProducts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-primary">Top Picks & Best Sellers</h2>
              <p className="text-xs text-ink-muted">Popular essentials from {store.name}</p>
            </div>
            <Link
              to={`/store/${slug}/products`}
              className="text-xs font-semibold text-accent-primary hover:underline inline-flex items-center gap-1"
            >
              Browse All ({data.products.length}) <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {featuredProducts.map((p) => {
              const unitMeta = unitsById.get(p.unitId);
              const allowDecimal = unitMeta?.allowDecimal ?? false;
              const inCartQty = cartQtyMap.get(p.id) || 0;
              const effectivePrice = p.effectivePricePaise ?? p.sellingPricePaise;
              const hasDiscount = p.mrpPaise > effectivePrice;
              const outOfStock = !p.isAvailable || p.availableQty <= 0;
              const isFav = favouriteIds.includes(p.id);

              return (
                <Card key={p.id} padding="sm" className="flex flex-col justify-between gap-2.5 shadow-xs">
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
        </section>
      )}

      {/* Explore Catalogue Banner */}
      <div className="rounded-2xl border border-border-default bg-surface-card p-5 text-center space-y-3">
        <h3 className="text-base font-bold text-ink-primary">Looking for everything we stock?</h3>
        <p className="text-xs text-ink-secondary max-w-md mx-auto">
          Explore all {data.products.length} products with category filters, brand search, and sorting.
        </p>
        <Button size="md" onClick={() => navigate(`/store/${slug}/products`)}>
          <ShoppingBag className="h-4 w-4 mr-2" /> Explore Full Catalogue
        </Button>
      </div>

      {/* Store Information & Policy */}
      <Card padding="md" className="space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">About {store.name}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-ink-secondary">
          <div className="space-y-1">
            <span className="font-semibold text-ink-primary block">Payment Methods</span>
            <p>Cash on Delivery/Pickup, Online UPI Payments, Khata Credit (for approved customers).</p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-ink-primary block">Store Timings & Contact</span>
            <p>{store.timings || 'Mon - Sun'}</p>
            {store.supportContact && (
              <p className="inline-flex items-center gap-1 text-ink-muted">
                <Phone className="h-3 w-3" /> {store.supportContact}
              </p>
            )}
          </div>
        </div>
      </Card>

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

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
