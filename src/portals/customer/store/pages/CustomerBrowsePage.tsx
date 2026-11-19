import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Filter,
  Heart,
  Package,
  Plus,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PriceText } from '../../../../shared/components/data-display/PriceText';
import { EmptyState, Skeleton } from '../../../../shared/components/feedback/EmptyState';
import { Modal } from '../../../../shared/components/feedback/Modal';
import { useToast } from '../../../../shared/components/feedback/ToastProvider';
import { NumberStepper } from '../../../../shared/components/forms/NumberStepper';
import { SearchBar } from '../../../../shared/components/forms/SearchBar';
import { Button } from '../../../../shared/components/ui/Button';
import { Card } from '../../../../shared/components/ui/Card';
import { QUERY_KEYS } from '../../../../shared/config/queryKeys';
import { ROUTES } from '../../../../shared/config/routes';
import { useAuth } from '../../../../shared/hooks/useAuth';
import { useBootstrapConfig } from '../../../../shared/hooks/useBootstrapConfig';
import type { Product } from '../../../../shared/types';
import { CustomerFloatingCartBar } from '../../components/CustomerFloatingCartBar';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { customerApi } from '../../services/customerApi';

type SortOption = 'default' | 'price_asc' | 'price_desc' | 'name_asc';

export function CustomerBrowsePage() {
  const { slug = '', productId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useBootstrapConfig();

  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(() => searchParams.get('category') || 'all');
  const [selectedBrandId, setSelectedBrandId] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const cart = useCustomerCart(slug);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_STORE(slug),
    queryFn: () => customerApi.getPublicStore(slug),
    enabled: Boolean(slug),
  });

  const store = data?.store;

  // Sync category param if URL changes
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) {
      setSelectedCategoryId(cat);
    }
  }, [searchParams]);

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

  const cartQtyMap = useMemo(
    () => new Map(cart.items.map((i) => [i.productId, i.qty])),
    [cart.items]
  );

  const handleCategorySelect = (catId: string) => {
    setSelectedCategoryId(catId);
    if (catId === 'all') {
      searchParams.delete('category');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ category: catId }, { replace: true });
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedCategoryId('all');
    setSelectedBrandId('all');
    setSortBy('default');
    setInStockOnly(false);
    searchParams.delete('category');
    setSearchParams(searchParams, { replace: true });
  };

  const hasActiveFilters =
    Boolean(search.trim()) ||
    selectedCategoryId !== 'all' ||
    selectedBrandId !== 'all' ||
    inStockOnly ||
    sortBy !== 'default';

  const filteredProducts = useMemo(() => {
    if (!data?.products) return [];
    const q = search.trim().toLowerCase();

    let list = data.products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (selectedBrandId !== 'all' && p.brandId !== selectedBrandId) return false;
      if (inStockOnly && (!p.isAvailable || p.availableQty <= 0)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        (p.brandName && p.brandName.toLowerCase().includes(q))
      );
    });

    if (sortBy === 'price_asc') {
      list = [...list].sort(
        (a, b) =>
          (a.effectivePricePaise ?? a.sellingPricePaise) -
          (b.effectivePricePaise ?? b.sellingPricePaise)
      );
    } else if (sortBy === 'price_desc') {
      list = [...list].sort(
        (a, b) =>
          (b.effectivePricePaise ?? b.sellingPricePaise) -
          (a.effectivePricePaise ?? a.sellingPricePaise)
      );
    } else if (sortBy === 'name_asc') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [data?.products, search, selectedCategoryId, selectedBrandId, inStockOnly, sortBy]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Skeleton className="h-44" />
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

  const selectedCategoryObj = data.categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-5 pb-28 md:pb-12">
      {/* Browse Header & Search */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-ink-primary">Browse Catalogue</h1>
            <p className="text-xs text-ink-secondary">
              Explore {data.products.length} products from {store.name}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs font-semibold text-accent-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}
        </div>

        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search all groceries, brands, categories..."
        />
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-border-default pb-3">
        {/* In-Stock Toggle */}
        <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="rounded border-border-strong text-accent-primary focus:ring-accent-primary h-4 w-4"
          />
          <span>In-stock only</span>
        </label>

        {/* Sort Selector */}
        <div className="flex items-center gap-1.5 text-xs">
          <ArrowDownUp className="h-3.5 w-3.5 text-ink-muted shrink-0" />
          <span className="text-ink-muted">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-border-default bg-surface-card px-2.5 py-1 text-xs font-medium text-ink-primary focus:outline-none focus:border-accent-primary cursor-pointer"
          >
            <option value="default">Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
          </select>
        </div>
      </div>

      {/* Category Pills Strip */}
      {data.categories.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider flex items-center gap-1">
            <Filter className="h-3 w-3" /> Categories
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => handleCategorySelect('all')}
              className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-accent-primary text-ink-inverse border-accent-primary shadow-xs'
                  : 'bg-surface-card text-ink-secondary border-border-default hover:border-accent-primary/40'
              }`}
            >
              All Categories ({data.products.length})
            </button>
            {data.categories.map((cat) => {
              const count = data.products.filter((p) => p.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySelect(cat.id)}
                  className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-accent-primary text-ink-inverse border-accent-primary shadow-xs'
                      : 'bg-surface-card text-ink-secondary border-border-default hover:border-accent-primary/40'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Brand Filter Pills */}
      {data.brands && data.brands.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Brands</div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedBrandId('all')}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                selectedBrandId === 'all'
                  ? 'bg-ink-primary text-ink-inverse border-ink-primary'
                  : 'bg-surface-card text-ink-secondary border-border-default hover:text-ink-primary'
              }`}
            >
              All Brands
            </button>
            {data.brands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => setSelectedBrandId(brand.id)}
                className={`min-h-[32px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                  selectedBrandId === brand.id
                    ? 'bg-ink-primary text-ink-inverse border-ink-primary'
                    : 'bg-surface-card text-ink-secondary border-border-default hover:text-ink-primary'
                }`}
              >
                {brand.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Filter Summary */}
      <div className="flex items-center justify-between text-xs text-ink-secondary pt-1">
        <span>
          Showing <strong className="text-ink-primary">{filteredProducts.length}</strong> of{' '}
          {data.products.length} products
          {selectedCategoryObj ? ` in ${selectedCategoryObj.name}` : ''}
        </span>
      </div>

      {/* Full Product Grid */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title={data.products.length === 0 ? 'Catalogue is empty' : 'No matching items'}
          description={
            data.products.length === 0
              ? 'This store is setting up its shelves. Check back shortly!'
              : 'Try clearing your search or category filters to see more products.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={handleClearFilters}>
                Clear All Filters
              </Button>
            ) : undefined
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
