<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>Payment Security &amp; Fraud Prevention - SubSlush</title>
  <meta
    name="description"
    content="SubSlush payment security and fraud prevention approach."
  />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
  <HomeNav />

  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
    <header class="border-b border-gray-300 pb-6 mb-8">
      <h1 class="text-2xl font-semibold tracking-wide">Payment Security &amp; Fraud Prevention</h1>
      <p class="mt-1 text-xs text-gray-600">Last updated: March 31, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <p>
          At SubSlush, we use a layered approach to help protect our website, customer accounts, and order
          flow from fraud, abuse, and unauthorized activity.
        </p>
        <p class="mt-2">
          Our goal is simple: reduce payment fraud, prevent account abuse, limit automated attacks, and support
          fair handling of suspicious or unauthorized transactions.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">How we protect our website</h2>
        <p class="mt-2">
          We use Cloudflare Pro to help secure our website and customer-facing areas. This includes web
          application firewall protections, managed security rules, and bot mitigation measures designed to
          help reduce common attacks, credential abuse, and automated traffic.
        </p>
        <p class="mt-2">
          These protections are used to help safeguard areas such as login, checkout, and customer account
          access.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">How we screen orders for fraud risk</h2>
        <p class="mt-2">
          We use MaxMind minFraud Factors as part of our fraud screening process.
        </p>
        <p class="mt-2">
          For first-time orders, we run automated risk screening to help identify signals commonly associated
          with fraudulent or unauthorized transactions. We may also re-run risk screening on repeat orders when
          certain risk triggers are present, such as changes in device, location, payment behavior, or other
          unusual activity patterns.
        </p>
        <p class="mt-2">Risk screening may take into account a combination of signals such as:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>IP and network risk indicators</li>
          <li>device and browser-related signals</li>
          <li>email and contact risk indicators</li>
          <li>location inconsistencies</li>
          <li>unusual order behavior or repeated high-risk patterns</li>
        </ul>
        <p class="mt-2">
          This helps us decide whether an order should be approved, reviewed, delayed, or canceled and refunded
          for safety reasons.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Device and visitor intelligence</h2>
        <p class="mt-2">
          We also use Castle to support visitor and device intelligence.
        </p>
        <p class="mt-2">
          This helps us better identify suspicious behavior patterns, repeated abuse attempts, and other signals
          that may indicate account misuse, bot activity, or elevated fraud risk. Device and visitor
          intelligence may be used together with other security and risk signals as part of our review process.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Manual review and order verification</h2>
        <p class="mt-2">
          Not all suspicious activity can be evaluated by automated systems alone.
        </p>
        <p class="mt-2">
          For that reason, some orders may be subject to additional manual review before fulfillment. This may
          happen, for example, when:
        </p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>a transaction appears unusually high risk,</li>
          <li>order behavior is inconsistent with prior activity,</li>
          <li>device, network, or location signals change unexpectedly,</li>
          <li>or other security indicators suggest that verification is appropriate.</li>
        </ul>
        <p class="mt-2">
          Where necessary, we may delay fulfillment, request additional confirmation, or cancel and refund an
          order if we are unable to verify it safely.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Fulfillment and dispute protection</h2>
        <p class="mt-2">
          We maintain internal records related to order status, delivery, and account or access fulfillment so
          that we can investigate issues, respond to customer support requests, and help resolve payment disputes
          when needed.
        </p>
        <p class="mt-2">
          If you believe a transaction was unauthorized or there is a problem with your order, we strongly
          encourage you to contact our support team first so we can review the matter and work toward a
          resolution as quickly as possible.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Additional payment security measures</h2>
        <p class="mt-2">
          As our payment infrastructure expands, we may enable additional security and verification controls
          offered by selected payment partners and providers where supported. These controls may include enhanced
          payment verification, additional fraud screening, and other measures designed to improve transaction
          security and reduce unauthorized activity.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Our approach</h2>
        <p class="mt-2">
          Our security and fraud-prevention process is designed to balance three things:
        </p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>protecting legitimate customers,</li>
          <li>reducing fraud and abuse,</li>
          <li>and ensuring that suspicious activity is reviewed responsibly.</li>
        </ul>
        <p class="mt-2">
          No security system can eliminate all risk, but we continuously work to improve our controls,
          monitoring, and review processes to help keep the platform secure.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">Contact</h2>
        <p class="mt-2">
          If you have questions about an order, a payment, or account security, please contact our support team
          through our <a href="/help" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">contact page</a> or official support email
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>.
        </p>
        <p class="mt-2">
          For more information, please also review our
          <a href="/terms" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">Terms &amp; Conditions</a>,
          <a href="/returns" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">Refund Policy</a>,
          and
          <a href="/privacy" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">Privacy Policy</a>.
        </p>
      </section>
    </div>
  </div>
  <Footer />
</div>
