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
        <p class="mt-2">
          This policy should be read together with our
          <a href="/terms" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">Terms and Conditions</a>
          and
          <a href="/privacy" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">Privacy and Cookie Policy</a>.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Scope by product type</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li><span class="font-semibold">Activation code products:</span> delivered as redeemable code/key/token.</li>
          <li><span class="font-semibold">Activation link products:</span> delivered as a claim/redeem/activation URL.</li>
          <li><span class="font-semibold">Account-based products:</span> delivered as credentials for a new account, or applied to your own account during fulfillment.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. Objective order states controlling refundability</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li><span class="font-semibold">Not delivered:</span> order can be cancelled and refunded.</li>
          <li><span class="font-semibold">Delivered but unclaimed/unconsumed:</span> only activation-link/code products may be eligible for mistaken/duplicate refunds, subject to verification and request timing below.</li>
          <li><span class="font-semibold">Claimed/consumed/used:</span> not refundable.</li>
          <li><span class="font-semibold">Applied by SubSlush to an account during fulfillment:</span> treated as used and not refundable.</li>
          <li><span class="font-semibold">Faulty / not as described:</span> eligible for remedy under Section 6 (replacement first, refund if unresolved).</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. Cancellation before delivery</h2>
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
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Wrong-item / mistaken purchase and duplicate purchases</h2>
        <p class="mt-2">
          Mistaken-purchase and duplicate-purchase refund requests are only available when the item is not claimed/used and
          the request is submitted within 12 hours of purchase.
        </p>
        <p class="mt-2">
          For account-based products fulfilled by SubSlush (including own-account applied fulfillment), delivery generally means
          the item is already considered used and is not refundable.
        </p>
        <p class="mt-2">Claimed means:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li><span class="font-semibold">Activation code/link:</span> once redeemed/activated on your account.</li>
          <li><span class="font-semibold">Account-based fulfillment:</span> once SubSlush applies the product to an account and delivers credentials/confirmation.</li>
        </ul>
        <p class="mt-2">
          Duplicate purchases may be refunded only for the extra order item that remains unclaimed/unused and is reported within 12 hours.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. Faulty or not-as-described products (Money Back Guarantee)</h2>
        <p class="mt-2">A product is considered faulty or not as described where, for example:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>wrong product/duration is delivered due to SubSlush fulfillment error;</li>
          <li>activation fails for reasons attributable to SubSlush delivery;</li>
          <li>critical product characteristics materially differ from pre-purchase disclosures.</li>
        </ul>
        <p class="mt-2">Evidence required:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>Order ID and product name;</li>
          <li>screenshots/error messages;</li>
          <li>relevant account/device details needed to reproduce the issue.</li>
        </ul>
        <p class="mt-2">
          We provide replacement or fix attempts first. If replacement is unavailable (for example out of stock),
          or the issue cannot be resolved after reasonable attempts, we issue a refund.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. Delivery delay and out-of-stock</h2>
        <p class="mt-2">Most orders are delivered within 24 hours. Maximum standard fulfillment window is 72 hours.</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>Before delivery: cancellation available with refund minus non-recoverable payment processing fees.</li>
          <li>Still not delivered after 72 hours: cancellation available with full refund including payment processing fees.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. Account-based product rules</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>Refund is only available if requested before fulfillment/delivery is completed.</li>
          <li>If credentials are delivered or access is applied, refund is not available even if login was never completed.</li>
          <li>Password change or email change counts as use.</li>
          <li>Where region/device compatibility limits were clearly disclosed before sale, incompatibility is not refundable.</li>
          <li>Provider-side content/catalog changes outside SubSlush control are not refundable.</li>
          <li>SubSlush does not classify products as partially used: a product is treated as either unused (before delivery/claim) or used (upon delivery/claim/application).</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">9. What counts as delivery</h2>
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
        <h2 class="text-base font-semibold uppercase tracking-wide">10. Refund method and timing</h2>
        <p class="mt-2">Refunds are issued to the original payment method by default.</p>
        <p class="mt-2">
          SubSlush processes approved refunds within 48-72 hours. After processing, settlement time depends on the payment processor,
          network, and customer bank.
        </p>
        <p class="mt-2">
          In some cases refund settlement may take longer due to factors outside SubSlush control (for example processor reviews or banking delays).
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">11. EU/EEA/UK digital content withdrawal information</h2>
        <p class="mt-2">
          For EU/EEA/UK distance contracts, consumer withdrawal rights may normally apply for 14 days. However, for digital content,
          withdrawal rights do not apply once performance has begun after the consumer's express request/consent and acknowledgement.
        </p>
        <p class="mt-2">
          SubSlush checkout includes an explicit checkbox for immediate digital performance acknowledgement before payment can proceed.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">12. Money Back Guarantee</h2>
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
        <h2 class="text-base font-semibold uppercase tracking-wide">13. When refunds are not available</h2>
        <p class="mt-2">
          Refunds are not available for delivered digital products solely because you changed your mind after delivery.
        </p>
        <p class="mt-2">
          Refunds may also be denied where investigation shows the issue was caused by customer misuse,
          policy violations, fraud, or abuse.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">14. How to request a refund or guarantee review</h2>
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
        <h2 class="text-base font-semibold uppercase tracking-wide">15. Response times</h2>
        <p class="mt-2">
          Our target initial response time for refund and guarantee requests is 48-72 hours.
          Complex cases may require longer review where provider verification is needed.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">16. Abuse, fraud, and false claims</h2>
        <p class="mt-2">
          Please contact support before opening a payment dispute so we can attempt resolution.
          We may provide objective order and delivery records to payment processors for dispute handling.
        </p>
        <p class="mt-2">
          We may refuse requests where evidence shows prior delivery/use, fraud, abusive behavior, or false claims.
          We may request screenshots, error messages, transaction proof, and relevant account/device details before decision.
        </p>
        <p class="mt-2">
          False or misleading claims may lead to refusal of refund requests and restriction of future service access.
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
