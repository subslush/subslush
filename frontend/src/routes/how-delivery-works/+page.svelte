<script lang="ts">
  import {
    Clock3,
    KeyRound,
    Link as LinkIcon,
    Users,
    BellRing,
    ShieldCheck,
    Mail
  } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';

  const revealNotice =
    'You will be notified by email when the order has been delivered, and you can find the relevant credentials by pressing the "Reveal" button on the specific order.';
</script>

<svelte:head>
  <title>How Delivery Works - SubSlush</title>
  <meta
    name="description"
    content="Learn how SubSlush delivery works for account-based products, activation codes, links, and workspace/team invites."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <section class="relative overflow-hidden py-12">
    <div class="absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan-100 blur-3xl opacity-60"></div>
    <div class="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-pink-100 blur-3xl opacity-60"></div>

    <div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
        <ShieldCheck size={14} aria-hidden="true" />
        Fulfillment
      </div>
      <h1 class="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">How delivery works</h1>
      <p class="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">
        Delivery depends on the product type. The sections below explain the expected flow, timing,
        and where to find your delivered access.
      </p>
      <div class="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm">
        <BellRing size={14} class="text-cyan-600" aria-hidden="true" />
        You always receive an email notification after delivery is completed.
      </div>
    </div>
  </section>

  <section class="pb-14">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid gap-5 md:grid-cols-2">
        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Clock3 size={18} class="text-cyan-600" aria-hidden="true" />
            Manual account-based delivery
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Usually within 24 hours, up to 72 hours. Used for new account provisioning and customer own-account activation.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">{revealNotice}</p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <KeyRound size={18} class="text-cyan-600" aria-hidden="true" />
            Activation code/key delivery
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Delivered through dashboard reveal when inventory is available.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">{revealNotice}</p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <LinkIcon size={18} class="text-cyan-600" aria-hidden="true" />
            Activation link delivery
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Delivered by dashboard, email, or support after verification.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">{revealNotice}</p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Users size={18} class="text-cyan-600" aria-hidden="true" />
            Workspace/team invite delivery
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Customer email is invited to a workspace/panel and delivery is confirmed.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            You will be notified by email when the order has been delivered. Invite to the workspace/team plan will have been sent to the email address you input during checkout. If you can't find the email in your inbox, please also check spam/junk.
          </p>
        </article>
      </div>

      <div class="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Need help with an order?</h2>
            <p class="mt-1 text-sm text-gray-600">
              Contact support and include your order ID for faster verification and fulfillment assistance.
            </p>
          </div>
          <a
            href="mailto:hello@subslush.com"
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Mail size={16} aria-hidden="true" />
            Contact support
          </a>
        </div>
      </div>
    </div>
  </section>

  <Footer />
</div>
