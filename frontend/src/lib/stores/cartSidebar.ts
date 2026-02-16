import { writable } from 'svelte/store';

const { subscribe, set, update } = writable(false);

export const cartSidebar = {
  subscribe,
  open: () => set(true),
  close: () => set(false),
  toggle: () => update(current => !current)
};
