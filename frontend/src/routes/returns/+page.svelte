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
      <p class="mt-1 text-xs text-gray-600">Last updated: March 30, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">1. Scope</h2>
        <p class="mt-2">
          This policy applies to digital products sold by SubSlush as fixed-price, one-time purchases with a stated duration.
          It explains cancellation rights, refund eligibility, and the Money Back Guarantee.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Cancellation before delivery</h2>
        <p class="mt-2">
          You may request cancellation before the order is fulfilled and delivered.
        </p>
        <p class="mt-2">
          If the order has not been delivered, we will cancel and refund the payment minus non-recoverable
          payment processing fees charged by the payment provider or network.
        </p>
        <p class="mt-2">SubSlush does not charge any additional cancellation or refund fee.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. What counts as delivery</h2>
        <p class="mt-2">An order is considered delivered when any of the following occurs:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>account credentials are made available to you;</li>
          <li>an activation link or activation code is delivered to you;</li>
          <li>the product is applied or activated on your own account and completion is confirmed.</li>
        </ul>
        <p class="mt-2">
          Once delivery has occurred, standard cancellation and refund are no longer available due to the irreversible
          nature of digital fulfillment, except where mandatory law requires otherwise or where the Money Back Guarantee applies.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. Delivery timelines and delayed orders</h2>
        <p class="mt-2">
          Most orders are delivered within 24 hours. In some cases, delivery may take up to 72 hours.
        </p>
        <p class="mt-2">
          If delivery exceeds 72 hours, you may request cancellation for a full refund including payment processing fees.
          We will also proactively contact you to find a solution.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Money Back Guarantee</h2>
        <p class="mt-2">
          If a product is not as described, or SubSlush is unable to deliver the purchased product,
          you are covered by our Money Back Guarantee.
        </p>
        <p class="mt-2">
          We first attempt to resolve the issue directly, including troubleshooting, correction,
          re-delivery, or replacement.
        </p>
        <p class="mt-2">
          If the issue cannot be resolved through those steps, we will issue a full refund including payment processing fees when justified.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. When refunds are not available</h2>
        <p class="mt-2">
          Refunds are not available for delivered digital products solely because you changed your mind after delivery.
        </p>
        <p class="mt-2">
          Refunds may also be denied where investigation shows the issue was caused by customer misuse,
          policy violations, fraud, or abuse.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. How to request a refund or guarantee review</h2>
        <p class="mt-2">
          Send requests to
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>
          or through support channels on
          <a href="/help" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">/help</a>.
        </p>
        <p class="mt-2">Please include:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>Order ID and product name</li>
          <li>description of the issue</li>
          <li>screenshots, error messages, or other relevant evidence</li>
          <li>the requested remedy (fix, replacement, or refund)</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. Response times</h2>
        <p class="mt-2">
          Our target initial response time for refund and guarantee requests is 48-72 hours.
          Complex cases may require longer review where provider verification is needed.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">9. Chargebacks and abuse</h2>
        <p class="mt-2">
          Please contact support before opening a payment dispute so we can attempt resolution.
          We may provide objective order and delivery records to payment processors for dispute handling.
        </p>
        <p class="mt-2">
          We may refuse requests where we reasonably suspect fraud, abuse, duplicate claims, or chargeback misuse.
          Mandatory legal rights remain unaffected.
        </p>
      </section>
    </div>
  </div>
  <Footer />
</div>
