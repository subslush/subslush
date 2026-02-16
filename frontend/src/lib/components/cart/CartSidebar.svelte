<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { X, Trash2 } from 'lucide-svelte';
  import { cart } from '$lib/stores/cart.js';
  import { currency } from '$lib/stores/currency.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';

  let previousBodyOverflow = '';
  const BODY_CART_OPEN_ATTR = 'data-cart-sidebar-open';

  const resolveItemCurrency = (item: { currency?: string | null }) =>
    normalizeCurrencyCode(item.currency) || $currency;

  const closeSidebar = () => {
    cartSidebar.close();
  };

  const handleCheckout = async () => {
    closeSidebar();
    await goto('/checkout');
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!$cartSidebar) return;
    if (event.key === 'Escape') {
      closeSidebar();
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    if (browser) {
      previousBodyOverflow = document.body.style.overflow;
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (browser) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.removeAttribute(BODY_CART_OPEN_ATTR);
      }
    };
  });

  onDestroy(() => {
    if (browser) {
      document.body.style.overflow = previousBodyOverflow;
      document.body.removeAttribute(BODY_CART_OPEN_ATTR);
    }
  });

  $: total = $cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  $: if (browser) {
    document.body.style.overflow = $cartSidebar ? 'hidden' : previousBodyOverflow;
    if ($cartSidebar) {
      document.body.setAttribute(BODY_CART_OPEN_ATTR, 'true');
    } else {
      document.body.removeAttribute(BODY_CART_OPEN_ATTR);
    }
  }
</script>

{#if $cartSidebar}
  <div class="fixed inset-0 z-[120] flex justify-end" aria-live="polite">
    <button
      type="button"
      class="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
      aria-label="Close cart"
      on:click={closeSidebar}
    ></button>

    <div
      class="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl cart-panel-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-sidebar-title"
    >
      <header class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id="cart-sidebar-title" class="text-lg font-semibold text-slate-900">Your cart</h2>
          <p class="text-xs text-slate-500">{$cart.length} item(s)</p>
        </div>
        <button
          type="button"
          class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          on:click={closeSidebar}
          aria-label="Close cart sidebar"
        >
          <X size={18} />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        {#if $cart.length === 0}
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <p class="text-sm font-semibold text-slate-900">Your cart is empty</p>
            <p class="mt-1 text-xs text-slate-500">
              Add products from the browse page to continue.
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each $cart as item}
              <div class="rounded-xl border border-slate-200 px-4 py-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-slate-900">{item.serviceName}</p>
                    <p class="text-xs text-slate-500 capitalize">{item.plan}</p>
                    {#if item.termMonths}
                      <p class="mt-1 text-xs text-slate-500">{item.termMonths} months</p>
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                    on:click={() => cart.removeItem(item.id)}
                    aria-label="Remove item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{item.termMonths ? `${item.termMonths} months` : 'Term unavailable'}</span>
                  <span class="text-sm font-semibold text-slate-900">
                    {formatCurrency(item.price * item.quantity, resolveItemCurrency(item))}
                  </span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <footer class="border-t border-slate-200 px-5 py-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm text-slate-500">Total</span>
          <span class="text-xl font-semibold text-slate-900">
            {formatCurrency(total, $currency)}
          </span>
        </div>
        <button
          type="button"
          class="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          on:click={handleCheckout}
          disabled={$cart.length === 0}
        >
          GO TO CHECKOUT
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  @keyframes cart-panel-enter {
    from {
      transform: translateX(100%);
      opacity: 0.75;
    }

    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .cart-panel-enter {
    animation: cart-panel-enter 180ms ease-out;
  }
</style>
