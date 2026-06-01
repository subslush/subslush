<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
  <title>Privacy and Cookie Policy - SubSlush</title>
  <meta name="description" content="SubSlush Privacy and Cookie Policy." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
  <HomeNav />

  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
    <header class="border-b border-gray-300 pb-6 mb-8">
      <h1 class="text-2xl font-semibold tracking-wide">Privacy and Cookie Policy</h1>
      <p class="mt-1 text-xs text-gray-600">Last updated: June 1, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">1. Overview</h2>
        <p class="mt-2">
          This policy explains how SubSlush collects, uses, shares, stores, and protects personal data
          when you use our platform, place orders, or contact support.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Controller roles and contact</h2>
        <p class="mt-2">
          <span class="font-semibold">2Sneaks AB</span> is controller for customer purchase, payment,
          receipt/order confirmation, tax/VAT, refund, dispute, and legal-compliance data for transactions
          where 2Sneaks AB is merchant of record.
        </p>
        <p class="mt-2">
          <span class="font-semibold">3NITY DIGITAL LIMITED</span> is controller for platform account data,
          and may act as processor/service provider for fulfillment, delivery, and support operations for
          transactions sold by 2Sneaks AB.
        </p>
        <p class="mt-2">
          3NITY DIGITAL LIMITED (BRN 79886556): UNIT B, 12/F, HANG SENG CAUSEWAY BAY BUILDING,
          28 YEE WO STREET, CAUSEWAY BAY, HONG KONG.
        </p>
        <p class="mt-2">
          2Sneaks AB (org. no. 559265-0963): Madängsvägen 5 b, 556 28 Jönköping, Sweden.
        </p>
        <p class="mt-2">
          Privacy contact:
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>
          · Legal/payment enquiries:
          <a href="mailto:compliance@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">compliance@subslush.com</a>
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. Data categories</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>identity and contact data (name, email, phone, country/region where provided);</li>
          <li>order, payment, and billing records;</li>
          <li>account and authentication data;</li>
          <li>delivery and fulfillment data (including account identifiers where needed for own-account fulfillment);</li>
          <li>support and complaint records;</li>
          <li>technical/security data (IP address, device/browser metadata, request logs, timestamps).</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. Purposes and legal bases</h2>
        <p class="mt-2">We process data to:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>provide platform access and account management;</li>
          <li>process orders, payments, and digital fulfillment;</li>
          <li>handle refunds, disputes, fraud checks, and compliance obligations;</li>
          <li>provide support and resolve complaints;</li>
          <li>improve platform reliability and security.</li>
        </ul>
        <p class="mt-2">Where GDPR/EEA/UK rules apply, legal bases include contract, legal obligation, legitimate interests, and consent where required.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Sharing and recipients</h2>
        <p class="mt-2">We may share data with:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>payment providers and anti-fraud services;</li>
          <li>hosting, security, and infrastructure providers;</li>
          <li>support/communications providers;</li>
          <li>fulfillment providers where needed to perform delivery;</li>
          <li>professional advisers and authorities where legally required.</li>
        </ul>
        <p class="mt-2">We do not sell personal data.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. International transfers</h2>
        <p class="mt-2">
          Data may be transferred between Sweden/EU and Hong Kong, and to other countries where our processors operate,
          for fulfillment, support, and platform operations.
        </p>
        <p class="mt-2">
          Where required, transfers are protected by appropriate safeguards, including contractual safeguards
          (for example Standard Contractual Clauses), transfer-risk assessments, and equivalent technical/organizational controls.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. Retention</h2>
        <p class="mt-2">We retain data only as long as necessary for contractual, legal, security, and dispute-handling purposes.</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>order/payment/accounting records: up to 7 years where required;</li>
          <li>fraud and security records: typically up to 24 months;</li>
          <li>support and complaint records: typically up to 3 years after closure.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. Rights</h2>
        <p class="mt-2">Depending on applicable law, you may have rights to access, correct, erase, restrict, object, and withdraw consent for consent-based processing.</p>
        <p class="mt-2">Requests can be sent to <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">9. Cookies and tracking</h2>
        <p class="mt-2">We use essential cookies for security and core functionality.</p>
        <p class="mt-2">
          We use a cookie consent banner for non-essential analytics and marketing technologies where required.
          Non-essential cookies and advertising pixels are not activated unless consent has been given.
        </p>
        <p class="mt-2">
          You can manage preferences through the cookie banner and browser settings.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">10. Security</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>encryption in transit and security hardening controls;</li>
          <li>role-based access controls;</li>
          <li>security logging and monitoring;</li>
          <li>incident response and remediation procedures.</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">11. Changes</h2>
        <p class="mt-2">We may update this policy. The "Last updated" date reflects the current version.</p>
      </section>
    </div>
  </div>
  <Footer />
</div>
