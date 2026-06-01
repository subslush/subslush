<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>Refund Policy and Money Back Guarantee - SubSlush</title>
  <meta name="description" content="SubSlush Refund Policy and Money Back Guarantee." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
  <HomeNav />

  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
    <header class="border-b border-gray-300 pb-6 mb-8">
      <h1 class="text-2xl font-semibold tracking-wide">Refund Policy and Money Back Guarantee</h1>
      <p class="mt-1 text-xs text-gray-600">Last updated: June 1, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">1. Scope and seller roles</h2>
        <p class="mt-2">
          This policy applies to digital products sold through SubSlush.
          The applicable selling entity is shown at checkout and in your order confirmation.
        </p>
        <p class="mt-2">
          For applicable payment transactions, 2Sneaks AB acts as merchant of record and handles
          payment-side refunds and payment disputes. 3NITY DIGITAL LIMITED handles platform operations,
          fulfillment, and support workflows.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Product states controlling refundability</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li><span class="font-semibold">Not fulfilled/delivered:</span> refundable under Section 3.</li>
          <li><span class="font-semibold">Fulfillment started:</span> cancellation handled case-by-case under Section 4.</li>
          <li><span class="font-semibold">Delivered, activated, claimed, or account-applied:</span> generally non-refundable for digital products, except where mandatory law requires a remedy.</li>
          <li><span class="font-semibold">Faulty / not as described / not delivered:</span> covered by Section 5 Money Back Guarantee.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. Cancellation before fulfillment begins</h2>
        <p class="mt-2">
          If fulfillment has not started, cancellation is available with a full refund to the original payment method.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. After fulfillment starts but before delivery completion</h2>
        <p class="mt-2">
          Once fulfillment work has started, cancellation is assessed case-by-case where legally required or operationally possible.
          If delivery has not completed and cancellation can be performed, refunds are processed to the original payment method.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Faulty or not-as-described products (Money Back Guarantee)</h2>
        <p class="mt-2">A remedy may be available where:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>the wrong product/duration was delivered due to SubSlush error;</li>
          <li>activation fails for reasons attributable to our fulfillment;</li>
          <li>critical product characteristics materially differ from pre-purchase disclosures;</li>
          <li>delivery is not completed within the stated delivery framework and no alternative is accepted.</li>
        </ul>
        <p class="mt-2">
          We first attempt troubleshooting, correction, re-delivery, or replacement. If unresolved,
          an appropriate refund is issued.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. Delivery timing and delayed orders</h2>
        <p class="mt-2">Most orders are completed within 24 hours. Some may take up to 72 hours.</p>
        <p class="mt-2">
          If delivery is materially delayed, contact support for resolution or cancellation options.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. EU/EEA/UK digital-content withdrawal information</h2>
        <p class="mt-2">
          Consumers may normally have a 14-day withdrawal right for distance contracts. For digital content,
          that right can be lost once performance begins after explicit request/consent and acknowledgement.
        </p>
        <p class="mt-2">
          SubSlush checkout captures explicit digital-performance consent before payment.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. What is generally non-refundable</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>products already delivered, claimed, activated, or account-applied;</li>
          <li>issues caused by customer misuse or policy violations;</li>
          <li>provider-side catalog or service changes outside our control where pre-purchase limits were clearly disclosed.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">9. How to request review</h2>
        <p class="mt-2">
          Send requests to
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>
          or through <a href="/help" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">/help</a>.
        </p>
        <p class="mt-2">Include order ID, product name, issue details, and relevant evidence.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">10. Refund timing</h2>
        <p class="mt-2">
          Approved refunds are initiated promptly, typically within 48-72 hours.
          Final settlement timing depends on the payment provider and banking network.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">11. Abuse and fraud</h2>
        <p class="mt-2">
          We may refuse requests where evidence shows prior delivery/use, fraud, abusive behavior,
          false claims, or chargeback misuse. Mandatory legal rights remain unaffected.
        </p>
      </section>
    </div>
  </div>
  <Footer />
</div>
