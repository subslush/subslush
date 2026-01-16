import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type CartItem = {
  id: string;
  serviceType: string;
  serviceName: string;
  plan: string;
  price: number;
  currency?: string;
  quantity: number;
  description?: string;
  features?: string[];
};

const STORAGE_KEY = 'subslush_cart';

function loadCart(): CartItem[] {
  if (!browser) return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as CartItem[] : [];
  } catch (error) {
    console.error('Failed to load cart from storage:', error);
    return [];
  }
}

function persistCart(items: CartItem[]) {
  if (!browser) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to persist cart:', error);
  }
}

function createCartStore() {
  const { subscribe, update, set } = writable<CartItem[]>(loadCart());

  return {
    subscribe,
    addItem: (item: CartItem) => update(current => {
      const existing = current.find(cartItem => cartItem.id === item.id);
      if (existing) {
        const updated = current.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + item.quantity }
            : cartItem
        );
        persistCart(updated);
        return updated;
      }

      const updated = [...current, item];
      persistCart(updated);
      return updated;
    }),
    removeItem: (id: string) => update(current => {
      const updated = current.filter(item => item.id !== id);
      persistCart(updated);
      return updated;
    }),
    clear: () => {
      persistCart([]);
      set([]);
    }
  };
}

export const cart = createCartStore();
