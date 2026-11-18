import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../../shared/config/routes';
import type { Product } from '../../../shared/types';

export interface CustomerCartItem {
  productId: string;
  name: string;
  unitLabel: string;
  imageUrl: string | null;
  unitPricePaise: number;
  mrpPaise: number;
  qty: number;
  allowDecimal: boolean;
  maxStock: number;
  substitutionPref: 'call_me' | 'replace' | 'remove';
}

const CART_EVENT = 'gs:customer-cart-changed';

function readCart(slug: string): CustomerCartItem[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.CUSTOMER_CART_PREFIX}${slug}`);
    return raw ? (JSON.parse(raw) as CustomerCartItem[]) : [];
  } catch {
    return [];
  }
}

function writeCart(slug: string, items: CustomerCartItem[]) {
  localStorage.setItem(`${STORAGE_KEYS.CUSTOMER_CART_PREFIX}${slug}`, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { slug } }));
}

export function useCustomerCart(slug: string) {
  const [items, setItems] = useState<CustomerCartItem[]>(() => readCart(slug));

  useEffect(() => {
    setItems(readCart(slug));
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ slug: string }>;
      if (!ce.detail || ce.detail.slug === slug) {
        setItems(readCart(slug));
      }
    };
    window.addEventListener(CART_EVENT, onChange);
    return () => window.removeEventListener(CART_EVENT, onChange);
  }, [slug]);

  const addProduct = useCallback(
    (product: Product, allowDecimal = false, qtyToAdd?: number) => {
      const current = readCart(slug);
      const step = qtyToAdd ?? (allowDecimal ? 0.5 : 1);
      const price = product.effectivePricePaise ?? product.sellingPricePaise;
      const existing = current.find((i) => i.productId === product.id);
      let next: CustomerCartItem[];
      if (existing) {
        const nextQty = Math.min(product.availableQty, Number((existing.qty + step).toFixed(2)));
        next = current.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                qty: nextQty,
                unitPricePaise: price,
                mrpPaise: product.mrpPaise,
                maxStock: product.availableQty,
              }
            : i
        );
      } else {
        next = [
          ...current,
          {
            productId: product.id,
            name: product.name,
            unitLabel: product.unitLabel || 'pcs',
            imageUrl: product.imageUrl,
            unitPricePaise: price,
            mrpPaise: product.mrpPaise,
            qty: Math.min(product.availableQty, step),
            allowDecimal,
            maxStock: product.availableQty,
            substitutionPref: 'call_me',
          },
        ];
      }
      writeCart(slug, next);
      setItems(next);
    },
    [slug]
  );

  const setItemQty = useCallback(
    (productId: string, qty: number) => {
      const current = readCart(slug);
      const next =
        qty <= 0
          ? current.filter((i) => i.productId !== productId)
          : current.map((i) => (i.productId === productId ? { ...i, qty } : i));
      writeCart(slug, next);
      setItems(next);
    },
    [slug]
  );

  const setSubstitutionPref = useCallback(
    (productId: string, pref: 'call_me' | 'replace' | 'remove') => {
      const current = readCart(slug);
      const next = current.map((i) => (i.productId === productId ? { ...i, substitutionPref: pref } : i));
      writeCart(slug, next);
      setItems(next);
    },
    [slug]
  );

  const replaceCart = useCallback(
    (next: CustomerCartItem[]) => {
      writeCart(slug, next);
      setItems(next);
    },
    [slug]
  );

  const clearCart = useCallback(() => {
    writeCart(slug, []);
    setItems([]);
  }, [slug]);

  const subtotalPaise = items.reduce((s, i) => s + Math.round(i.unitPricePaise * i.qty), 0);
  const mrpTotalPaise = items.reduce((s, i) => s + Math.round(i.mrpPaise * i.qty), 0);
  const savingsPaise = Math.max(0, mrpTotalPaise - subtotalPaise);
  const itemCount = items.reduce((s, i) => s + (i.allowDecimal ? 1 : i.qty), 0);

  return {
    items,
    itemCount,
    subtotalPaise,
    savingsPaise,
    addProduct,
    setItemQty,
    setSubstitutionPref,
    replaceCart,
    clearCart,
  };
}
