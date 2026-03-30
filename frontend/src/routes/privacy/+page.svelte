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
      <p class="mt-1 text-xs text-gray-600">Last updated: March 30, 2026</p>
    </header>

    <div class="space-y-8 text-sm leading-relaxed">
      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">1. Overview</h2>
        <p class="mt-2">
          This policy explains how SubSlush collects, uses, discloses, stores, and protects personal data
          when you browse our Platform, place an order, or contact support.
        </p>
        <p class="mt-2">
          SubSlush seeks to comply with Hong Kong's Personal Data (Privacy) Ordinance (Cap. 486) (PDPO),
          including the six Data Protection Principles (DPP1-DPP6). We also honor mandatory consumer
          data rights that apply in the jurisdictions where we sell, including EU consumer markets.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">2. Data user (controller) and contact</h2>
        <p class="mt-2">
          Data user / trader: <span class="font-semibold">3NITY DIGITAL LIMITED</span> (BRN:
          <span class="font-semibold">79886556</span>)
        </p>
        <p class="mt-2">
          Address:<br />
          UNIT B, 12/F, HANG SENG CAUSEWAY BAY BUILDING,<br />
          28 YEE WO STREET, CAUSEWAY BAY,<br />
          HONG KONG
        </p>
        <p class="mt-2">
          Privacy contact:
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">3. Collection notice timing</h2>
        <p class="mt-2">
          We provide this privacy notice on our website and at checkout so users are informed at or before collection
          of personal data, including delivery details, fraud review data, and technical identifiers such as IP address.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">4. Personal data we collect</h2>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">4.1 Data you provide</h3>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>identity and contact data: name, email, country/region, and any support contact information you provide</li>
          <li>account data: account credentials (stored using security controls), preferences</li>
          <li>order data: products purchased, duration, delivery method, pricing records, refund/complaint status</li>
          <li>fulfillment data: details needed to deliver the product, such as target account email/identifier and, where required, account credentials for account-applied fulfillment</li>
          <li>support data: messages, screenshots, files, and case notes</li>
        </ul>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">4.2 Data collected automatically</h3>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>IP address, request headers, user agent, device/browser information, and timestamps</li>
          <li>approximate location (country/region) derived from IP for currency localization, fraud review, and service suitability checks</li>
          <li>usage data (pages visited, clicks, checkout progress)</li>
          <li>cookies and tracking data (see Cookies section)</li>
        </ul>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">4.3 Payment and risk data</h3>
        <p class="mt-2">
          Payments are handled by third-party processors. We receive transaction references, payment status, and
          anti-fraud/risk signals. We do not typically store full primary card numbers.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">5. Purposes of collection and use</h2>
        <p class="mt-2">We use personal data to:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>create and manage accounts</li>
          <li>process orders and deliver digital products</li>
          <li>perform account-applied fulfillment where selected by the customer</li>
          <li>provide customer support, complaints handling, and Money Back Guarantee processing</li>
          <li>prevent fraud, abuse, chargeback misuse, and unauthorized payments</li>
          <li>comply with legal, tax, and accounting obligations</li>
          <li>improve Platform performance and user experience</li>
          <li>send marketing communications only where permitted and in line with PDPO direct marketing rules (see Section 10)</li>
        </ul>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">6. Disclosure / sharing</h2>
        <p class="mt-2">We may disclose data to:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>payment providers, anti-fraud services, and chargeback processing partners</li>
          <li>hosting, email, and support tooling providers</li>
          <li>wholesale suppliers or fulfillment partners (only what is necessary to deliver)</li>
          <li>analytics or advertising partners (where enabled and permitted)</li>
          <li>professional advisers (accounting and legal) where needed</li>
          <li>law enforcement or regulators where legally required</li>
        </ul>
        <p class="mt-2">We do not sell your personal data.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">7. Retention</h2>
        <p class="mt-2">
          We keep personal data only as long as necessary for the purposes listed in this policy, and to meet legal,
          accounting, security, and dispute-handling obligations.
        </p>
        <p class="mt-2">Typical retention periods are:</p>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>order/payment/accounting records: up to 7 years where required by law</li>
          <li>support and complaint records: normally up to 3 years after case closure</li>
          <li>security and audit logs: normally up to 24 months</li>
          <li>fulfillment credentials shared for account-applied delivery: kept only as long as needed for fulfillment/support resolution and then removed or minimized</li>
        </ul>
        <p class="mt-2">We may retain records longer where legal claims, investigations, or mandatory legal obligations require it.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">8. Security</h2>
        <p class="mt-2">
          We use technical and organizational measures to protect data, including access controls, encryption where appropriate,
          and monitoring for unauthorized activity.
        </p>
        <p class="mt-2">
          No system is perfectly secure, but we continuously work to reduce risk and respond to incidents.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">9. International transfers</h2>
        <p class="mt-2">
          Our service providers and systems may operate outside Hong Kong. Where cross-border transfers occur, we apply
          contractual and operational safeguards appropriate to the transferred data and applicable law.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">10. Direct marketing (PDPO)</h2>
        <p class="mt-2">
          If we use your personal data for direct marketing, we will comply with PDPO requirements,
          including that we must not use personal data in direct marketing without your consent or
          indication of no objection, and you can opt out at any time.
        </p>
        <p class="mt-2">
          We will provide a clear unsubscribe or opt-out method in marketing communications.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">11. Your rights (PDPO)</h2>
        <p class="mt-2">
          Under PDPO, individuals have rights of access and correction of personal data (DPP6).
          To request access or correction, contact hello@subslush.com. We may need to verify
          identity before processing requests.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">12. Cookies and online tracking</h2>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">12.1 What cookies are</h3>
        <p class="mt-2">
          Cookies are small files stored on your device to enable site functionality, analytics,
          and preferences.
        </p>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">12.2 How we use cookies</h3>
        <ul class="mt-2 list-disc pl-5 space-y-1">
          <li>strictly necessary: login, session, security, checkout</li>
          <li>preferences: language and settings</li>
          <li>analytics: understand usage and improve performance</li>
          <li>marketing (if enabled): measure campaigns</li>
        </ul>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">12.3 Managing cookies</h3>
        <p class="mt-2">
          You can control cookies via browser settings. Where we implement a cookie banner or
          controls, you can adjust preferences there as well.
        </p>

        <h3 class="mt-4 text-sm font-semibold uppercase tracking-wide">12.4 Cookie list</h3>
        <p class="mt-2">
          The cookies currently set by SubSlush are listed below. These are strictly necessary
          for authentication and security. We will update this list if additional cookies are
          introduced.
        </p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full border border-gray-300 text-xs">
            <thead>
              <tr>
                <th class="border-b border-gray-300 px-3 py-2 text-left font-semibold">Cookie</th>
                <th class="border-b border-gray-300 px-3 py-2 text-left font-semibold">Provider</th>
                <th class="border-b border-gray-300 px-3 py-2 text-left font-semibold">Purpose</th>
                <th class="border-b border-gray-300 px-3 py-2 text-left font-semibold">Expiry</th>
                <th class="border-b border-gray-300 px-3 py-2 text-left font-semibold">Category</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="border-b border-gray-300 px-3 py-2">auth_token</td>
                <td class="border-b border-gray-300 px-3 py-2">SubSlush</td>
                <td class="border-b border-gray-300 px-3 py-2">Authentication token used to keep you signed in and secure API requests.</td>
                <td class="border-b border-gray-300 px-3 py-2">24 hours</td>
                <td class="border-b border-gray-300 px-3 py-2">Strictly necessary</td>
              </tr>
              <tr>
                <td class="border-b border-gray-300 px-3 py-2">csrf_token</td>
                <td class="border-b border-gray-300 px-3 py-2">SubSlush</td>
                <td class="border-b border-gray-300 px-3 py-2">Security token to protect against cross-site request forgery on state-changing requests.</td>
                <td class="border-b border-gray-300 px-3 py-2">24 hours</td>
                <td class="border-b border-gray-300 px-3 py-2">Strictly necessary</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="mt-6 text-sm font-semibold uppercase tracking-wide">12.5 Advertising pixels and hashed identifiers</h3>
        <p class="mt-2">
          We may use advertising pixels and similar technologies (such as TikTok, Meta, and other
          ad platforms) to measure ad performance, attribute conversions, and improve marketing
          effectiveness.
        </p>
        <p class="mt-2">
          Where supported and permitted, we may share hashed identifiers (such as hashed email,
          phone number, or user ID) with these platforms to improve matching and attribution.
          Hashing means transforming the identifier into a fixed, non-reversible format before
          sharing.
        </p>
        <p class="mt-2">
          Marketing cookies and pixels are used only where consent is required and given. You can
          opt out by adjusting your cookie preferences (where available) or by disabling cookies
          in your browser settings. Opting out may reduce the relevance of ads you see but will
          not affect core site functionality.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">13. Children and age limits</h2>
        <p class="mt-2">
          Our service is intended for adults who can legally contract. We do not knowingly collect personal data from children
          who are not legally permitted to place orders in their jurisdiction.
        </p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">14. Changes</h2>
        <p class="mt-2">We may update this policy. The "Last updated" date reflects the current version.</p>
      </section>

      <section>
        <h2 class="text-base font-semibold uppercase tracking-wide">15. Contact</h2>
        <p class="mt-2">
          Privacy questions:
          <a href="mailto:hello@subslush.com" class="underline underline-offset-2 text-gray-900 hover:text-gray-700">hello@subslush.com</a>
        </p>
      </section>
    </div>
  </div>
  <Footer />
</div>
