<script lang="ts">
  import { Building2, ShieldCheck, PackageCheck, Headphones, Globe, BadgeCheck } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>About Us - SubSlush</title>
  <meta
    name="description"
    content="Learn about SubSlush, operated by 3NITY DIGITAL LIMITED together with 2Sneaks AB, and how platform operations, payments, and digital fulfillment are handled."
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
      <h1 class="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">About SubSlush</h1>
      <p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
        SubSlush is a digital goods and digital access platform operated by
        3NITY DIGITAL LIMITED together with 2Sneaks AB.
      </p>
      <p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
        SubSlush is not an open marketplace. Products are sold directly by the applicable
        SubSlush selling entity shown at checkout and in the order confirmation.
      </p>
    </div>
  </section>

  <section class="pb-14">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid gap-5 md:grid-cols-2">
        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BadgeCheck size={18} class="text-cyan-600" aria-hidden="true" />
            3NITY DIGITAL LIMITED role
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            3NITY DIGITAL LIMITED is responsible for platform operations, product catalog management,
            digital fulfillment, order handling, customer support workflows, delivery records,
            and supplier/fulfillment operations.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Registered in Hong Kong (BRN 79886556), 3NITY provides the operational and fulfillment
            services that power SubSlush.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PackageCheck size={18} class="text-cyan-600" aria-hidden="true" />
            2Sneaks AB role
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            2Sneaks AB acts as merchant of record and contracting seller for applicable payment
            transactions processed through SubSlush.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Where 2Sneaks AB is shown at checkout, on your payment statement, or in your order
            confirmation, 2Sneaks AB is responsible for payment acceptance, receipts/order confirmations,
            payment-related refunds, and payment-dispute handling for that transaction.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ShieldCheck size={18} class="text-cyan-600" aria-hidden="true" />
            Product and pre-purchase clarity
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            SubSlush sells selected digital access products, software access products, activation-based
            products, and account-based digital delivery products.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Product pages and checkout disclose core characteristics including duration, delivery method,
            activation method, region/account requirements where relevant, and refund limitations.
          </p>
        </article>

        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Headphones size={18} class="text-cyan-600" aria-hidden="true" />
            Delivery, dashboard, and support
          </div>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Customers can track order status in the dashboard and receive email notifications
            when delivery is completed.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-gray-700">
            Support is available via live chat during published hours and by email at
            <a href="mailto:hello@subslush.com" class="font-semibold text-cyan-700 hover:underline">hello@subslush.com</a>.
            Legal and payment enquiries can be sent to
            <a href="mailto:compliance@subslush.com" class="font-semibold text-cyan-700 hover:underline">compliance@subslush.com</a>.
          </p>
        </article>
      </div>

      <div class="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 class="text-base font-semibold text-gray-900">Legal company information</h2>
        <div class="mt-3 grid gap-4 md:grid-cols-2 text-sm leading-relaxed text-gray-700">
          <div>
            <p class="font-semibold text-gray-900">3NITY DIGITAL LIMITED</p>
            <p>Role: Platform operator and fulfillment provider</p>
            <p>Business Registration No: 79886556</p>
            <p>Registered address: UNIT B, 12/F, HANG SENG CAUSEWAY BAY BUILDING, 28 YEE WO STREET, CAUSEWAY BAY, HONG KONG</p>
            <p>Email: compliance@subslush.com</p>
          </div>
          <div>
            <p class="font-semibold text-gray-900">2Sneaks AB</p>
            <p>Role: Merchant of record and contracting seller for applicable payment transactions</p>
            <p>Swedish company registration no: 559265-0963</p>
            <p>VAT no: SE559265096301</p>
            <p>Registered address: Madängsvägen 5 b, 556 28 Jönköping, Sweden</p>
            <p>Email: compliance@subslush.com</p>
          </div>
        </div>
      </div>

      <div class="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-gray-900">Brand relationship disclosure</h2>
            <p class="mt-1 text-sm text-gray-600">
              Unless explicitly stated otherwise, SubSlush is not affiliated with, endorsed by,
              or sponsored by any third-party brand owner. All trademarks belong to their respective owners.
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
