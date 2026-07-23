import { get } from 'svelte/store';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { cart, type CartItem } from '$lib/stores/cart.js';
import { currency } from '$lib/stores/currency.js';
import {
  normalizeCurrencyCode,
  type SupportedCurrency
} from '$lib/utils/currency.js';
import type {
  CartPricingPreviewItemRequest,
  CartPricingPreviewResponse
} from '$lib/types/subscription.js';

const CART_PRICING_SYNC_DEBOUNCE_MS = 120;

type RepriceableCartItem = CartItem & { productId: string };

const isRepriceableCartItem = (item: CartItem): item is RepriceableCartItem =>
  typeof item.productId === 'string' && item.productId.trim().length > 0;

const buildPreviewItems = (
  items: CartItem[]
): CartPricingPreviewItemRequest[] =>
  items
    .filter(isRepriceableCartItem)
    .map(item => ({
      cart_item_id: item.id,
      product_id: item.productId,
      ...(item.termMonths ? { term_months: item.termMonths } : {}),
      quantity: item.quantity
    }));

const buildRequestKey = (
  activeCurrency: SupportedCurrency,
  items: CartPricingPreviewItemRequest[]
): string =>
  `${activeCurrency}|${items
    .map(
      item =>
        `${item.cart_item_id}:${item.product_id ?? ''}:${item.term_months ?? 1}:${item.quantity ?? 1}`
    )
    .join('|')}`;

const applyPreviewToCart = (
  items: CartItem[],
  preview: CartPricingPreviewResponse,
  activeCurrency: SupportedCurrency
): CartItem[] => {
  const pricedItemsById = new Map(
    preview.items.map(item => [item.cart_item_id, item])
  );

  return items.map(item => {
    const pricedItem = pricedItemsById.get(item.id);
    if (!pricedItem) {
      return item;
    }

    const normalizedCurrency =
      normalizeCurrencyCode(pricedItem.currency) || activeCurrency;
    if (
      item.price === pricedItem.unit_price &&
      normalizeCurrencyCode(item.currency) === normalizedCurrency &&
      item.pricingSnapshotId === pricedItem.pricing_snapshot_id
    ) {
      return item;
    }

    return {
      ...item,
      price: pricedItem.unit_price,
      currency: normalizedCurrency,
      pricingSnapshotId: pricedItem.pricing_snapshot_id
    };
  });
};

export const startCartPricingSync = (): (() => void) => {
  let disposed = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRequestKey: string | null = null;
  let lastAppliedKey: string | null = null;

  const clearDebounce = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const queueSync = (): void => {
    if (disposed) {
      return;
    }

    clearDebounce();
    debounceTimer = setTimeout(() => {
      void syncCartPricing();
    }, CART_PRICING_SYNC_DEBOUNCE_MS);
  };

  const syncCartPricing = async (): Promise<void> => {
    if (disposed) {
      return;
    }

    const activeCurrency = get(currency);
    const currentItems = get(cart);
    const previewItems = buildPreviewItems(currentItems);

    if (previewItems.length === 0) {
      activeRequestKey = null;
      lastAppliedKey = null;
      return;
    }

    const requestKey = buildRequestKey(activeCurrency, previewItems);
    if (requestKey === lastAppliedKey || requestKey === activeRequestKey) {
      return;
    }

    activeRequestKey = requestKey;

    try {
      const preview = await subscriptionService.getCartPricingPreview({
        currency: activeCurrency,
        items: previewItems
      });

      if (disposed || activeRequestKey !== requestKey) {
        return;
      }

      const latestCurrency = get(currency);
      const latestItems = get(cart);
      const latestPreviewItems = buildPreviewItems(latestItems);
      const latestKey = buildRequestKey(latestCurrency, latestPreviewItems);
      if (latestKey !== requestKey) {
        activeRequestKey = null;
        queueSync();
        return;
      }

      const skippedIds = (preview.skipped_items ?? [])
        .map(item => item.cart_item_id)
        .filter(Boolean);
      if (skippedIds.length > 0) {
        cart.removeInvalidItems(
          skippedIds,
          `${skippedIds.length} cart ${skippedIds.length === 1 ? 'item is' : 'items are'} no longer available with the saved configuration. Please add ${skippedIds.length === 1 ? 'it' : 'them'} again from the catalog.`
        );
        lastAppliedKey = null;
        return;
      }

      const updatedItems = applyPreviewToCart(
        latestItems,
        preview,
        latestCurrency
      );
      const hasChanges = updatedItems.some(
        (item, index) =>
          item.price !== latestItems[index]?.price ||
          item.currency !== latestItems[index]?.currency ||
          item.pricingSnapshotId !== latestItems[index]?.pricingSnapshotId
      );

      if (hasChanges) {
        cart.setItems(updatedItems);
      }

      lastAppliedKey = requestKey;
    } catch (error) {
      console.error('Failed to synchronize cart pricing:', error);
    } finally {
      if (activeRequestKey === requestKey) {
        activeRequestKey = null;
      }
    }
  };

  const unsubscribeCart = cart.subscribe(() => {
    queueSync();
  });
  const unsubscribeCurrency = currency.subscribe(() => {
    queueSync();
  });

  queueSync();

  return () => {
    disposed = true;
    clearDebounce();
    unsubscribeCart();
    unsubscribeCurrency();
  };
};
