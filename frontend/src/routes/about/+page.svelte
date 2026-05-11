<script lang="ts">
  import { Building2, ShieldCheck, PackageCheck, Headphones, Globe, BadgeCheck } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>About Us - SubSlush</title>
  <meta
    name="description"
    content="Learn about SubSlush, a digital goods retailer operated by 3NITY DIGITAL LIMITED, and how we fulfill and support digital orders."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <section class="relative overflow-hidden py-12">
    <div class="absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan-100 blur-3xl opacity-60"></div>
    <div class="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-pink-100 blur-3xl opacity-60"></div>

    <div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
        <Building2 size={14} aria-hidden="true" />
        Company
      </div>
      <h1 class="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">About us</h1>
      <p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
        SubSlush is a digital goods retailer operated by 3NITY DIGITAL LIMITED, a Hong Kong company.
        We sell selected digital subscriptions, software access products, activation-based products, and
        account-based digital access products.
      </p>
      <p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
        Orders are fulfilled through our secure customer dashboard, with delivery tracking, support,
        and fraud prevention controls.
      </p>
    </div>
  </section>

  <section class="pb-14">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid gap-5 md:grid-cols-2">
        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BadgeCheck size={18} class="text-cyan-600" aria-hidden="true" />
            Who we are
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            SubSlush is a trading name of <span class="font-semibold">3NITY DIGITAL LIMITED</span>
            (BRN: <span class="font-semibold">79886556</span>), incorporated in Hong Kong.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            We are the direct seller of record for products sold on SubSlush. SubSlush is not an open marketplace.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Unless explicitly stated otherwise, SubSlush is not affiliated with, endorsed by, or sponsored by any brand owner.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PackageCheck size={18} class="text-cyan-600" aria-hidden="true" />
            What we sell
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            We focus on selected digital access products with clear pre-purchase disclosures. Product pages
            and checkout present key characteristics such as duration, delivery format, and activation method.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Our catalog includes digital subscriptions and access products delivered through account credentials,
            activation links, activation codes/keys, and account-applied fulfillment where applicable.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ShieldCheck size={18} class="text-cyan-600" aria-hidden="true" />
            Secure fulfillment and fraud prevention
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            We use secure hosted payment flows and layered fraud/risk screening to protect customers and reduce
            unauthorized transactions, abuse, and chargeback misuse.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Order events and delivery records are tracked to support operational quality, customer support, and
            payment-dispute resolution where needed.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Headphones size={18} class="text-cyan-600" aria-hidden="true" />
            Delivery, dashboard, and support
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Customers can track order status in the dashboard and receive email notifications when delivery is completed.
            Delivered credentials or activation details are accessible through the relevant order view.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Support is available via live chat during published hours and by email at
            <a href="mailto:hello@subslush.com" class="font-semibold text-cyan-700 hover:underline">hello@subslush.com</a>.
          </p>
        </article>
      </div>

      <div class="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Global service with transparent policies</h2>
            <p class="mt-1 text-sm text-gray-600">
              We serve customers worldwide and publish clear terms for delivery, refunds, data handling, and payment security.
            </p>
          </div>
          <a
            href="/help"
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Globe size={16} aria-hidden="true" />
            Visit support
          </a>
        </div>
      </div>
    </div>
  </section>

  <Footer />
</div>
