<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import { user } from '$lib/stores/auth.js';
  import { cart } from '$lib/stores/cart.js';
  import { ordersService } from '$lib/api/orders.js';
  import { checkoutService } from '$lib/api/checkout.js';
  import { trackPurchase, type AnalyticsItem } from '$lib/utils/analytics.js';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import type { Subscription } from '$lib/types/subscription.js';
  import { CheckCircle2, Clock3, Loader2, MailCheck, ShieldCheck, XCircle } from 'lucide-svelte';

  let status = '';
  let orderId: string | null = null;
  let sessionId: string | null = null;
  let subscriptions: Subscription[] = [];
  let loading = false;
  let pollingStarted = false;
  let pollingComplete = false;
  let confirmAttempted = false;
  let confirmError = '';
  let cartCleared = false;
  let stripeCheckoutConfirmed = false;

  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 120000;
  const CHECKOUT_DRAFT_STORAGE_KEY = 'checkout_draft_state';
  const PURCHASE_TRACKED_STORAGE_KEY = 'tiktok:checkout_purchase';
  let pollActive = true;

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const buildPurchaseItems = (): AnalyticsItem[] =>
    $cart.map((item, index) => ({
      item_id: item.variantId || `${item.serviceType}-${item.plan}`,
      item_name: item.serviceName,
      item_category: item.serviceType,
      item_variant: item.plan,
      price: item.price,
      currency: item.currency || 'USD',
      quantity: item.quantity,
      index
    }));

  const hasTrackedPurchase = (orderTrackingId: string): boolean => {
    try {
      return (
        sessionStorage.getItem(
          `${PURCHASE_TRACKED_STORAGE_KEY}:${orderTrackingId}`
        ) === '1'
      );
    } catch {
      return false;
    }
  };

  const markPurchaseTracked = (orderTrackingId: string): void => {
    try {
      sessionStorage.setItem(
        `${PURCHASE_TRACKED_STORAGE_KEY}:${orderTrackingId}`,
        '1'
      );
    } catch {
      // Ignore storage errors and keep UX uninterrupted.
    }
  };

  const confirmSession = async () => {
    if (!orderId || !sessionId) return;
    confirmError = '';
    try {
      await checkoutService.confirmStripeSession({
        order_id: orderId,
        session_id: sessionId
      });
      stripeCheckoutConfirmed = true;
    } catch (error) {
      confirmError =
        error instanceof Error
          ? error.message
          : 'Unable to confirm Stripe checkout status.';
      stripeCheckoutConfirmed = false;
    }
  };

  const startPolling = async () => {
    if (!orderId) return;
    loading = true;
    pollingComplete = false;
    const start = Date.now();

    while (pollActive && Date.now() - start < POLL_TIMEOUT_MS) {
      try {
        const response = await ordersService.getOrderSubscriptions(orderId);
        if (response.subscriptions && response.subscriptions.length > 0) {
          subscriptions = response.subscriptions;
          loading = false;
          pollingComplete = true;
          return;
        }
      } catch (error) {
        console.warn('Order subscription poll failed:', error);
      }
      await wait(POLL_INTERVAL_MS);
    }

    loading = false;
    pollingComplete = true;
  };

  const unsubscribe = page.subscribe($page => {
    status = $page.url.searchParams.get('status') ?? '';
    orderId = $page.url.searchParams.get('order_id');
    sessionId = $page.url.searchParams.get('session_id');
  });

  $: if (
    status === 'success' &&
    orderId &&
    sessionId &&
    !confirmAttempted
  ) {
    confirmAttempted = true;
    void confirmSession();
  }

  $: if (
    status === 'success' &&
    orderId &&
    $user?.id &&
    !pollingStarted
  ) {
    pollingStarted = true;
    void startPolling();
  }

  $: if (
    status !== 'success' ||
    !orderId ||
    !$user?.id
  ) {
    if (!pollingStarted) {
      pollingComplete = true;
    }
  }

  $: if (status !== 'success') {
    stripeCheckoutConfirmed = false;
  }

  $: if (browser && status === 'cancel') {
    void goto('/checkout', { replaceState: true });
  }

  $: if (
    browser &&
    status === 'success' &&
    orderId &&
    stripeCheckoutConfirmed &&
    !hasTrackedPurchase(orderId)
  ) {
    const items = buildPurchaseItems();
    if (items.length > 0) {
      const totalValue = Number(
        items
          .reduce(
            (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
            0
          )
          .toFixed(2)
      );
      const currency = items.find(item => item.currency)?.currency || 'USD';
      trackPurchase(
        orderId,
        currency,
        totalValue,
        items,
        `order_${orderId}_purchase`
      );
      markPurchaseTracked(orderId);
    }
  }

  $: if (
    browser &&
    status === 'success' &&
    stripeCheckoutConfirmed &&
    !cartCleared
  ) {
    cart.clear();
    localStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    cartCleared = true;
  }

  onDestroy(() => {
    pollActive = false;
    unsubscribe();
  });
</script>

<svelte:head>
  <title>Checkout Status</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-60 bg-gradient-to-br from-cyan-100/70 via-sky-100/30 to-pink-100/70"></div>

    <section class="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {#if status === 'cancel'}
        <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <XCircle class="h-7 w-7" />
          </div>
          <h1 class="text-center text-2xl font-bold text-slate-900">Checkout cancelled</h1>
          <p class="mt-2 text-center text-sm text-slate-600">
            Your Stripe checkout was cancelled. You can return to checkout and try again.
          </p>
          <div class="mt-6 flex justify-center">
            <a
              href="/checkout"
              class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Return to checkout
            </a>
          </div>
        </div>
      {:else if status === 'success'}
        <div class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div class="border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 sm:px-8">
            <div class="flex items-center gap-4">
              <div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                <CheckCircle2 class="h-7 w-7" />
              </div>
              <div>
                <h1 class="text-2xl font-bold text-white">Payment received</h1>
                <p class="mt-1 text-sm text-slate-200">
                  We have your payment and your order is now in processing.
                </p>
              </div>
            </div>
          </div>

          <div class="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.25fr,1fr]">
            <div class="space-y-4">
              {#if !$user?.id}
                <p class="text-sm leading-6 text-slate-700">
                  Orders are usually processed and delivered within 24 hours during business days. In rare cases, it can take up to 48-72 hours.
                </p>
                <p class="text-sm leading-6 text-slate-700">
                  We sent your order confirmation and activation link to your email. If you do not see it, check your junk/spam folder.
                </p>
                {#if confirmError}
                  <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {confirmError}
                  </div>
                {/if}
              {:else if loading}
                <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div class="flex items-center gap-2">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Finalizing your subscription. This can take a moment.
                  </div>
                </div>
              {:else if subscriptions.length > 0}
                <p class="text-sm leading-6 text-slate-700">
                  {#if subscriptions.length === 1}
                    Your subscription is ready and available in your
                    <a href="/dashboard" class="font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-700">dashboard</a>.
                  {:else}
                    Your {subscriptions.length} subscriptions are ready and available in your
                    <a href="/dashboard" class="font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-700">dashboard</a>.
                  {/if}
                </p>
              {:else if pollingComplete}
                <p class="text-sm leading-6 text-slate-700">
                  Your payment is confirmed and your order is still being processed. Please check your dashboard again in a few minutes.
                </p>
              {/if}

            </div>

            <aside class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 class="text-sm font-semibold text-slate-900">What happens next</h2>
              <div class="mt-4 space-y-4">
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 rounded-full bg-cyan-100 p-1.5 text-cyan-700">
                    <MailCheck class="h-4 w-4" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Email update</p>
                    <p class="mt-1 text-sm text-slate-700">Order confirmation and activation details are sent to your checkout email.</p>
                  </div>
                </div>

                <div class="flex items-start gap-3">
                  <div class="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-700">
                    <Clock3 class="h-4 w-4" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery window</p>
                    <p class="mt-1 text-sm text-slate-700">Most orders complete within 24 business hours. Rare cases can take up to 48-72 hours.</p>
                  </div>
                </div>

                <div class="flex items-start gap-3">
                  <div class="mt-0.5 rounded-full bg-emerald-100 p-1.5 text-emerald-700">
                    <ShieldCheck class="h-4 w-4" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Need help?</p>
                    <p class="mt-1 text-sm text-slate-700">If something looks off, contact support and include your order email.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      {:else}
        <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Loader2 class="h-7 w-7 animate-spin" />
          </div>
          <h1 class="text-center text-2xl font-bold text-slate-900">Checking payment status</h1>
          <p class="mt-2 text-center text-sm text-slate-600">
            We are confirming your payment. You can continue shopping while processing continues.
          </p>
          <div class="mt-6 flex justify-center">
            <a
              href="/browse"
              class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Continue shopping
            </a>
          </div>
        </div>
      {/if}
    </section>
  </main>

  <Footer />
</div>
