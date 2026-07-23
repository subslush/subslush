import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { UpgradeSelectionType } from '$lib/types/upgradeSelection.js';
import type { OwnAccountCredentialRequirement } from '$lib/types/subscription.js';

export type CartItem = {
  id: string;
  serviceType: string;
  serviceName: string;
  subCategory?: string;
  logoKey?: string;
  logoUrl?: string;
  plan: string;
  price: number;
  currency?: string;
  quantity: number;
  description?: string;
  features?: string[];
  productId?: string;
  variantId?: string;
  termMonths?: number;
  pricingSnapshotId?: string;
  autoRenew?: boolean;
  upgradeSelectionType?: UpgradeSelectionType | null;
  ownAccountCredentialRequirement?: OwnAccountCredentialRequirement | null;
  manualMonthlyAcknowledged?: boolean;
};

const STORAGE_KEY = 'subslush_cart';
const { subscribe: subscribeCartAddPulse, set: setCartAddPulse } = writable(0);
const { subscribe: subscribeCartRecoveryNotice, set: setCartRecoveryNotice } =
  writable<string | null>(null);

export const cartAddPulse = {
  subscribe: subscribeCartAddPulse
};

export const cartRecoveryNotice = {
  subscribe: subscribeCartRecoveryNotice,
  clear: () => setCartRecoveryNotice(null),
  show: (message: string) => setCartRecoveryNotice(message)
};

const sanitizeCartItem = (raw: unknown): CartItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const item: CartItem = {
    id: typeof candidate.id === 'string' ? candidate.id : '',
    serviceType: typeof candidate.serviceType === 'string' ? candidate.serviceType : '',
    serviceName: typeof candidate.serviceName === 'string' ? candidate.serviceName : '',
    subCategory:
      typeof candidate.subCategory === 'string'
        ? candidate.subCategory
        : typeof candidate.sub_category === 'string'
          ? candidate.sub_category
          : undefined,
    logoKey:
      typeof candidate.logoKey === 'string'
        ? candidate.logoKey
        : typeof candidate.logo_key === 'string'
          ? candidate.logo_key
          : undefined,
    logoUrl:
      typeof candidate.logoUrl === 'string'
        ? candidate.logoUrl
        : typeof candidate.logo_url === 'string'
          ? candidate.logo_url
          : undefined,
    plan: typeof candidate.plan === 'string' ? candidate.plan : '',
    price: Number.isFinite(candidate.price) ? Number(candidate.price) : 0,
    currency: typeof candidate.currency === 'string' ? candidate.currency : undefined,
    quantity:
      typeof candidate.quantity === 'number' && Number.isFinite(candidate.quantity)
        ? Math.max(1, Math.floor(candidate.quantity))
      : 1,
    description:
      typeof candidate.description === 'string' ? candidate.description : undefined,
    features: Array.isArray(candidate.features)
      ? candidate.features.filter((item: unknown) => typeof item === 'string')
      : undefined,
    productId:
      typeof candidate.productId === 'string'
        ? candidate.productId
        : typeof candidate.product_id === 'string'
          ? candidate.product_id
          : undefined,
    variantId: typeof candidate.variantId === 'string' ? candidate.variantId : undefined,
    termMonths:
      typeof candidate.termMonths === 'number' &&
      Number.isFinite(candidate.termMonths)
      ? Math.max(1, Math.floor(candidate.termMonths))
      : undefined,
    pricingSnapshotId:
      typeof candidate.pricingSnapshotId === 'string'
        ? candidate.pricingSnapshotId
        : typeof candidate.pricing_snapshot_id === 'string'
          ? candidate.pricing_snapshot_id
          : undefined,
    autoRenew:
      typeof candidate.autoRenew === 'boolean' ? candidate.autoRenew : undefined,
    upgradeSelectionType:
      candidate.upgradeSelectionType === 'upgrade_new_account' ||
      candidate.upgradeSelectionType === 'upgrade_own_account'
        ? candidate.upgradeSelectionType
        : undefined,
    ownAccountCredentialRequirement:
      candidate.ownAccountCredentialRequirement === 'email_only' ||
      candidate.ownAccountCredentialRequirement === 'email_and_password'
        ? candidate.ownAccountCredentialRequirement
        : undefined,
    manualMonthlyAcknowledged:
      typeof candidate.manualMonthlyAcknowledged === 'boolean'
        ? candidate.manualMonthlyAcknowledged
        : undefined,
  };

  if (!item.id || !item.serviceName || !item.plan || !item.productId) {
    return null;
  }

  return item;
};

function loadCart(): CartItem[] {
  if (!browser) return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed
      .map(sanitizeCartItem)
      .filter((item): item is CartItem => item !== null);
    const removedCount = parsed.length - sanitized.length;
    if (removedCount > 0) {
      setCartRecoveryNotice(
        `${removedCount} saved cart ${removedCount === 1 ? 'item was' : 'items were'} removed because the product information was outdated. Please add ${removedCount === 1 ? 'it' : 'them'} again from the catalog.`
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch (error) {
    console.error('Failed to load cart from storage:', error);
    setCartRecoveryNotice(
      'Your saved cart could not be restored. Please add the products again from the catalog.'
    );
    return [];
  }
}

function persistCart(items: CartItem[]) {
  if (!browser) return;

  try {
    const sanitized = items
      .map(sanitizeCartItem)
      .filter((item): item is CartItem => item !== null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    console.error('Failed to persist cart:', error);
  }
}

function createCartStore() {
  const { subscribe, update, set } = writable<CartItem[]>(loadCart());

  return {
    subscribe,
    addItem: (item: CartItem) => update(current => {
      const incoming = {
        ...item,
        quantity:
          typeof item.quantity === 'number' && Number.isFinite(item.quantity)
            ? Math.max(1, Math.floor(item.quantity))
            : 1
      };
      const existingIndex = current.findIndex(cartItem => cartItem.id === incoming.id);
      const updated =
        existingIndex >= 0
          ? current.map((cartItem, index) =>
              index === existingIndex
                ? {
                    ...cartItem,
                    ...incoming,
                    quantity: Math.max(
                      1,
                      Math.floor(cartItem.quantity) + incoming.quantity
                    )
                  }
                : cartItem
            )
          : [...current, incoming];
      persistCart(updated);
      setCartAddPulse(Date.now());
      return updated;
    }),
    updateItem: (id: string, updates: Partial<CartItem>) => update(current => {
      const updated = current.map(item =>
        item.id === id ? { ...item, ...updates } : item
      );
      persistCart(updated);
      return updated;
    }),
    removeItem: (id: string) => update(current => {
      const updated = current.filter(item => item.id !== id);
      persistCart(updated);
      return updated;
    }),
    setItems: (items: CartItem[]) => {
      const sanitized = items
        .map(sanitizeCartItem)
        .filter((item): item is CartItem => item !== null);
      persistCart(sanitized);
      set(sanitized);
    },
    removeInvalidItems: (ids: string[], message: string) => update(current => {
      const invalidIds = new Set(ids);
      const updated = current.filter(item => !invalidIds.has(item.id));
      persistCart(updated);
      setCartRecoveryNotice(message);
      return updated;
    }),
    clear: () => {
      persistCart([]);
      set([]);
    }
  };
}

export const cart = createCartStore();
