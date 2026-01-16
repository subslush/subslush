<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>Refund and Warranty Policy - SubSlush</title>
  <meta name="description" content="SubSlush Refund and Warranty Policy." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
  <HomeNav />

  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
    <header class="border-b border-gray-300 pb-6 mb-8">
      <h1 class="text-2xl font-semibold tracking-wide">Refund and Warranty Policy</h1>
      <p class="mt-1 text-xs text-gray-600">Last updated: January 4, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">1. Warranty coverage (subscriptions)</h2>
        <p class="mt-2">
          SubSlush provides and covers a warranty for the entire subscription period (the
          "Subscription Period"). Replacement and refunds are handled case-by-case, at SubSlush's
          discretion.
        </p>
        <p class="mt-2">All warranty inquiries must be sent to hello@subslush.com with:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>Order ID</li>
          <li>Product name</li>
          <li>description of the issue</li>
          <li>screenshots or evidence (where relevant)</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Third-Party Service outages and service quality</h2>
        <p class="mt-2">
          SubSlush should not be held responsible for disruptions caused by Third-Party Services
          (for example, Netflix, Spotify, or ChatGPT downtime, lag, delays, or feature changes).
          SubSlush provides the premium subscription upgrade or access; we do not control the
          Third-Party Service's infrastructure or service quality.
        </p>
        <p class="mt-2">
          If the Third-Party Service is down, you should contact the provider about the outage
          itself. You may contact SubSlush if you believe your entitlement or upgrade was not
          delivered correctly.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. No returns or refunds after delivery (digital nature)</h2>
        <p class="mt-2">
          Due to the nature of digital Products, no returns or refunds can be made once the premium
          subscription has been provided (or a key or code has been delivered or revealed), except
          where mandatory law requires otherwise (for example, if SubSlush fails to deliver what
          was purchased).
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. Cancellation before delivery (24 hour target / up to 72 hours)</h2>
        <p class="mt-2">
          SubSlush aims to deliver within 24 hours, but delivery may take up to 72 hours.
        </p>
        <p class="mt-2">
          During this window, the customer may contact SubSlush (live chat or hello@subslush.com)
          to request cancellation. If the subscription has not yet been delivered, we will cancel
          the Order and refund as set out below. If it has already been delivered, we cannot
          cancel or refund under this section.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Refund amount and third-party fees</h2>
        <p class="mt-2">
          If we cancel and refund before delivery at the customer's request, SubSlush may refund
          the total amount minus any non-recoverable third-party transaction or processing fees,
          determined by the payment method (for example, card refund fees or crypto network fees).
        </p>
        <p class="mt-2">SubSlush will not charge any internal cancellation fee. Only third-party fees may be deducted.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. Customer-caused issues (no remedy)</h2>
        <p class="mt-2">
          If issues are caused by the customer (for example, illegal use or violating a
          Third-Party Service's policies leading to restriction, limitation, or disablement),
          SubSlush bears no responsibility and will not provide replacements or refunds after
          investigation.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. SubSlush-caused issues (remedy under warranty)</h2>
        <p class="mt-2">
          If SubSlush bears responsibility (for example, access not granted, wrong plan or period,
          incorrect delivery), SubSlush will provide a solution under warranty at our discretion,
          which may include:
        </p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>re-delivery or replacement</li>
          <li>extension of the Subscription Period</li>
          <li>store credit</li>
          <li>partial or full refund (where appropriate)</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. Abuse, fraud, chargebacks</h2>
        <p class="mt-2">
          We may refuse warranty or refund support where we reasonably suspect fraud, abuse, or
          chargeback misuse.
        </p>
      </section>
    </div>
  </div>
  <Footer />
</div>
