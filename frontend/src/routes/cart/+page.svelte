<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import { cart } from '$lib/stores/cart.js';
  import { auth } from '$lib/stores/auth.js';
  import { currency } from '$lib/stores/currency.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { LogIn, UserPlus, Trash2, LayoutDashboard, History } from 'lucide-svelte';

  $: total = $cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const resolveItemCurrency = (item: { currency?: string | null }) =>
    normalizeCurrencyCode(item.currency) || $currency;
</script>

<svelte:head>
  <title>Your Cart - SubSlush</title>
  <meta name="description" content="Review your subscription cart and proceed to checkout." />
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <HomeNav />

  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
    {#if !$auth.isAuthenticated}
      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <p class="text-lg font-semibold text-gray-900 mb-1">Sign in to view your cart</p>
        <p class="text-sm text-gray-600 mb-4">
          You need to
          <a href="/auth/login" class="text-cyan-600 hover:text-cyan-700 font-semibold">sign in</a>
          or
          <a href="/auth/register" class="text-cyan-600 hover:text-cyan-700 font-semibold">register</a>
          before you can see or add items to your cart.
        </p>
        <div class="flex flex-wrap gap-3">
          <a
            href="/auth/login"
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Sign in</span>
          </a>
          <a
            href="/auth/register"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            <UserPlus size={16} aria-hidden="true" />
            <span>Register</span>
          </a>
        </div>
      </div>
    {:else if $cart.length === 0}
      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
        <p class="text-lg font-semibold text-gray-900">Your cart is empty</p>
        <p class="text-sm text-gray-600 mt-2">Browse subscriptions to add them to your cart.</p>
        <a
          href="/browse"
          class="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Browse subscriptions
        </a>
      </div>
    {:else}
      <div class="space-y-4">
        {#each $cart as item}
          <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p class="text-base font-semibold text-gray-900">{item.serviceName}</p>
              <p class="text-sm text-gray-600 capitalize">{item.plan}</p>
              <p class="text-sm text-gray-700 mt-1">
                {formatCurrency(item.price, resolveItemCurrency(item))} / month
              </p>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <p class="text-xs text-gray-500">Qty</p>
                <p class="text-lg font-semibold text-gray-900">{item.quantity}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-gray-500">Total</p>
                <p class="text-lg font-semibold text-gray-900">
                  {formatCurrency(item.price * item.quantity, resolveItemCurrency(item))}
                </p>
              </div>
              <button
                type="button"
                class="p-2 rounded-lg text-red-600 hover:bg-red-50"
                on:click={() => cart.removeItem(item.id)}
                aria-label="Remove {item.serviceName} {item.plan} from cart"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        {/each}
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p class="text-sm text-gray-500">Cart total</p>
          <p class="text-2xl font-bold text-gray-900">{formatCurrency(total, $currency)}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <a
            href="/dashboard"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            <LayoutDashboard size={16} aria-hidden="true" />
            <span>Dashboard</span>
          </a>
          <a
            href="/dashboard/orders"
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <History size={16} aria-hidden="true" />
            <span>Order History</span>
          </a>
        </div>
      </div>
    {/if}

    <div class="pt-8 border-t border-gray-200 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-gray-700">
      <a href="/help" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Support Hub</a>
      <a href="/terms" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Terms &amp; Conditions</a>
      <a href="/privacy" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Privacy and Cookies Policy</a>
      <a href="/returns" class="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">Returns &amp; Refunds</a>
    </div>
  </div>
</div>
