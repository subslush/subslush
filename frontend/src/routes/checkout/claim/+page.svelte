<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { user } from '$lib/stores/auth.js';
  import { checkoutService } from '$lib/api/checkout.js';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { ArrowRight, CheckCircle2, Loader2, LogIn, ShieldCheck, UserPlus, XCircle } from 'lucide-svelte';

  let token = '';
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let message = '';

  const claimOrder = async () => {
    if (!token) {
      status = 'error';
      message = 'Claim token missing or invalid.';
      return;
    }
    status = 'loading';
    message = '';
    try {
      await checkoutService.claimCheckout(token);
      status = 'success';
    } catch (error) {
      status = 'error';
      message =
        error instanceof Error
          ? error.message
          : 'Unable to claim this checkout.';
    }
  };

  const unsubscribe = page.subscribe($page => {
    token = $page.url.searchParams.get('token') ?? '';
  });

  onDestroy(() => {
    unsubscribe();
  });

  $: if (token && $user?.id && status === 'idle') {
    void claimOrder();
  }

  $: if (!token && $user?.id && status === 'idle') {
    status = 'error';
    message = 'Claim token missing or invalid.';
  }

  const buildClaimRedirectPath = (): string => {
    if (!token) {
      return '/checkout/claim';
    }
    return `/checkout/claim?token=${encodeURIComponent(token)}`;
  };

  const handleLogin = () => {
    const params = new URLSearchParams();
    params.set('redirect', buildClaimRedirectPath());
    void goto(`/auth/login?${params.toString()}`);
  };

  const handleRegister = () => {
    const params = new URLSearchParams();
    params.set('redirect', buildClaimRedirectPath());
    void goto(`/auth/register?${params.toString()}`);
  };
</script>

<svelte:head>
  <title>Claim Checkout</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-br from-sky-100/70 via-cyan-100/30 to-rose-100/70"></div>

    <section class="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div class="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <h1 class="text-2xl font-bold text-slate-900 sm:text-3xl">Claim your order</h1>
        <p class="mt-2 text-sm text-slate-600 sm:text-base">
          Use this page to attach your guest checkout to a SubSlush account so you can manage it anytime.
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.35fr,1fr]">
        <div class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          {#if !$user?.id}
            <div class="space-y-4">
              <h2 class="text-xl font-semibold text-slate-900">Sign in or create an account</h2>
              <p class="text-sm leading-6 text-slate-700">
                If you already have a SubSlush account, sign in first. If not, create one and then you will return here automatically to complete the claim.
              </p>
              <p class="text-sm leading-6 text-slate-700">
                Use the same email address you used during checkout.
              </p>
              {#if !token}
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Claim token missing or invalid. Please use the claim link from your order email.
                </div>
              {/if}
              <div class="flex flex-wrap gap-3 pt-2">
                <button
                  class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                  on:click={handleLogin}
                >
                  <LogIn class="h-4 w-4" />
                  Sign in
                </button>
                <button
                  class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  on:click={handleRegister}
                >
                  <UserPlus class="h-4 w-4" />
                  Create account
                </button>
              </div>
            </div>
          {:else if status === 'loading'}
            <div class="flex flex-col items-center gap-3 py-8 text-slate-700">
              <Loader2 class="h-7 w-7 animate-spin" />
              <h2 class="text-xl font-semibold text-slate-900">Claiming your order</h2>
              <p class="text-sm text-slate-600">Please wait while we link this checkout to your account.</p>
            </div>
          {:else if status === 'success'}
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <CheckCircle2 class="h-9 w-9 text-emerald-500" />
                <h2 class="text-xl font-semibold text-slate-900">Order claimed successfully</h2>
              </div>
              <p class="text-sm leading-6 text-slate-700">
                This guest order is now linked to your account. You can view order status and manage subscriptions from your dashboard.
              </p>
              <div class="flex flex-wrap gap-3 pt-2">
                <a
                  href="/dashboard/subscriptions"
                  class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  View subscriptions
                  <ArrowRight class="h-4 w-4" />
                </a>
                <a
                  href="/"
                  class="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to home
                </a>
              </div>
            </div>
          {:else if status === 'error'}
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <XCircle class="h-9 w-9 text-rose-500" />
                <h2 class="text-xl font-semibold text-slate-900">Unable to claim this order</h2>
              </div>
              <p class="text-sm leading-6 text-slate-700">
                {message || 'The claim token is invalid or has expired.'}
              </p>
              <div class="flex flex-wrap gap-3 pt-2">
                <a
                  href="/"
                  class="inline-flex items-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to home
                </a>
              </div>
            </div>
          {/if}
        </div>

        <aside class="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">How Claiming Works</h2>
          <div class="mt-4 space-y-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
              <p class="mt-1 text-sm text-slate-700">Sign in to your SubSlush account, or create one if this is your first order.</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
              <p class="mt-1 text-sm text-slate-700">We securely attach this guest checkout to your account using this one-time claim token.</p>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
              <p class="mt-1 text-sm text-slate-700">You can track delivery and manage subscriptions from your dashboard going forward.</p>
            </div>
          </div>

          <div class="mt-5 flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            <ShieldCheck class="mt-0.5 h-4 w-4" />
            <span>This claim token is one-time use and expires for your security.</span>
          </div>
        </aside>
      </div>
    </section>
  </main>

  <Footer />
</div>
