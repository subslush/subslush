<script lang="ts">
  import { onMount } from 'svelte';
  import { Clock, Mail, MessageSquare, ChevronDown, Globe, CreditCard, ShieldCheck, Timer, Wallet, LifeBuoy } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';

  type SupportHourSlot = {
    label: string;
    range: string;
    zoneName: string;
    timeZone: string;
  };

  type FaqItem = {
    tag: string;
    question: string;
    answer: string;
    linkHref?: string;
    linkText?: string;
  };

  const baseTimeZone = 'Europe/Paris';
  const supportStartHour = 12;
  const supportWindowHours = 12;

  const faqs: FaqItem[] = [
    {
      tag: 'Eligibility',
      question: 'Can I use SubSlush from any country?',
      answer: 'Yes. We accept customers worldwide. Checkout supports USD, GBP, CAD, and EUR.',
    },
    {
      tag: 'Payments',
      question: 'How can I pay?',
      answer: 'We accept card and crypto payments. Card payments are processed securely through Stripe. Crypto payments are handled via credits top-ups.',
    },
    {
      tag: 'Delivery',
      question: 'How fast will I receive my subscription?',
      answer: 'Most orders are delivered within 24 hours. Some orders can take up to 72 hours due to verification or provider constraints.',
    },
    {
      tag: 'Accounts',
      question: 'Do I need an existing account for the service I purchase?',
      answer: 'It depends on the service. In most cases you can choose to add the subscription to a new account or your existing account. For some services we must create a new account and provide it to you. Any credentials shared on SubSlush are encrypted with 256-bit bank-level encryption.',
    },
    {
      tag: 'Orders',
      question: 'Where can I track my order status?',
      answer: 'You can always see order updates in your dashboard and in your confirmation email.',
      linkHref: '/dashboard/orders',
      linkText: 'Go to Order History',
    },
    {
      tag: 'Refunds',
      question: 'Can I cancel or refund an order?',
      answer: 'If delivery has not started, we can cancel and refund. After delivery, refunds are not available because the products are digital.',
      linkHref: '/returns',
      linkText: 'Read the Refund Policy',
    },
    {
      tag: 'Security',
      question: 'Is my payment information stored by SubSlush?',
      answer: 'No. Card payments are handled by Stripe and we only receive confirmation and transaction references.',
    },
    {
      tag: 'Renewals',
      question: 'Do subscriptions auto-renew?',
      answer: 'Some plans can renew automatically. You can manage renewal preferences from your dashboard.',
      linkHref: '/dashboard/subscriptions',
      linkText: 'Manage subscriptions',
    },
    {
      tag: 'Crypto',
      question: 'How do crypto payments work?',
      answer: 'Top up your credits with crypto, then use those credits at checkout. We begin fulfillment once the blockchain confirmation is received.',
      linkHref: '/dashboard/credits',
      linkText: 'View credits',
    },
    {
      tag: 'Feedback',
      question: 'How do I report a bug or suggestion?',
      answer: 'We are in beta and value your feedback. Use the feedback form to send issues or ideas.',
      linkHref: '/feedback',
      linkText: 'Report feedback',
    },
  ];

  const faqColumns = [
    faqs.filter((_, index) => index % 2 === 0),
    faqs.filter((_, index) => index % 2 === 1),
  ];

  const getDateParts = (date: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
    };
  };

  const getTimeZoneOffset = (date: Date, timeZone: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const utcTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return (utcTime - date.getTime()) / 60000;
  };

  const makeZonedDate = (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    timeZone: string,
  ) => {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const offsetMinutes = getTimeZoneOffset(utcGuess, timeZone);
    return new Date(utcGuess.getTime() - offsetMinutes * 60000);
  };

  const formatRange = (start: Date, end: Date, timeZone: string) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  };

  const getTimeZoneName = (date: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find(part => part.type === 'timeZoneName')?.value || timeZone;
  };

  const buildSupportHours = (localTimeZone: string): SupportHourSlot[] => {
    const now = new Date();
    const { year, month, day } = getDateParts(now, baseTimeZone);
    const start = makeZonedDate(year, month, day, supportStartHour, 0, baseTimeZone);
    const end = new Date(start.getTime() + supportWindowHours * 60 * 60 * 1000);

    const slots = [
      { label: 'Your local time', timeZone: localTimeZone },
      { label: 'Central Europe (CET/CEST)', timeZone: baseTimeZone },
      { label: 'UTC', timeZone: 'UTC' },
      { label: 'US/Canada Eastern', timeZone: 'America/New_York' },
      { label: 'US/Canada Pacific', timeZone: 'America/Los_Angeles' },
    ];

    const seen = new Set<string>();
    return slots
      .filter(slot => {
        if (seen.has(slot.timeZone)) return false;
        seen.add(slot.timeZone);
        return true;
      })
      .map(slot => ({
        label: slot.label,
        timeZone: slot.timeZone,
        range: formatRange(start, end, slot.timeZone),
        zoneName: getTimeZoneName(start, slot.timeZone),
      }));
  };

  let supportHours: SupportHourSlot[] = buildSupportHours('UTC');

  onMount(() => {
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    supportHours = buildSupportHours(localTimeZone);
  });
</script>

<svelte:head>
  <title>Help & Support - SubSlush</title>
  <meta
    name="description"
    content="Contact SubSlush support via live chat during opening hours or email hello@subslush.com anytime."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <section class="relative overflow-hidden py-12">
    <div class="absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan-100 blur-3xl opacity-60"></div>
    <div class="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-pink-100 blur-3xl opacity-60"></div>

    <div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
        <div class="space-y-5">
          <div class="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
            <LifeBuoy size={14} aria-hidden="true" />
            Support
          </div>
          <h1 class="text-3xl sm:text-4xl font-bold text-gray-900">Help and support</h1>
          <p class="text-sm text-gray-600 leading-relaxed">
            Support is here to help you with any support-related inquiry. Reach us via live chat during
            opening hours or email us at
            <a href="mailto:hello@subslush.com" class="text-cyan-700 font-semibold hover:underline">hello@subslush.com</a>.
            Email support is available 24/7.
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <MessageSquare size={18} class="text-cyan-600" aria-hidden="true" />
                Live chat
              </div>
              <p class="mt-2 text-xs text-gray-600">
                Chat with the team during opening hours for order status, delivery help, or account questions.
              </p>
            </div>
            <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Mail size={18} class="text-cyan-600" aria-hidden="true" />
                Email support
              </div>
              <p class="mt-2 text-xs text-gray-600">
                Send us a message any time. We respond quickly with clear next steps.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <a
              href="mailto:hello@subslush.com"
              class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Mail size={16} aria-hidden="true" />
              Email support
            </a>
            <a
              href="/dashboard/orders"
              class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <Timer size={16} aria-hidden="true" />
              Order status
            </a>
            <a
              href="/feedback"
              class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Report a bug
            </a>
          </div>
        </div>

        <div class="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Clock size={18} class="text-cyan-600" aria-hidden="true" />
            Live chat opening hours
          </div>
          <p class="mt-2 text-xs text-gray-600">
            Live chat is open daily from 12:00 PM to 12:00 AM Central European Time (CET/CEST).
            We display the same window in your local time, UTC, and major North American time zones.
          </p>

          <div class="mt-4 space-y-3">
            {#if supportHours.length > 0}
              {#each supportHours as slot}
                <div class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <div>
                    <p class="text-xs font-semibold text-gray-900">{slot.label}</p>
                    <p class="text-[11px] text-gray-500">{slot.zoneName}</p>
                  </div>
                  <p class="text-sm font-semibold text-gray-900">{slot.range}</p>
                </div>
              {/each}
            {:else}
              <div class="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500">
                Loading local times...
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="py-12 bg-gray-50">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Quick help</p>
          <h2 class="text-2xl font-bold text-gray-900 mt-2">Common support topics</h2>
          <p class="text-sm text-gray-600 mt-1">Find answers fast or jump to the right place.</p>
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Globe size={18} class="text-cyan-600" aria-hidden="true" />
            Global access
          </div>
          <p class="mt-2 text-xs text-gray-600">
            We accept customers worldwide with multi-currency checkout and local-friendly pricing.
          </p>
        </div>
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <CreditCard size={18} class="text-cyan-600" aria-hidden="true" />
            Payments and billing
          </div>
          <p class="mt-2 text-xs text-gray-600">
            Pay by card or crypto credits. Transactions are secured by Stripe and our payment partners.
          </p>
        </div>
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Wallet size={18} class="text-cyan-600" aria-hidden="true" />
            Delivery updates
          </div>
          <p class="mt-2 text-xs text-gray-600">
            Track order progress, delivery status, and renewal info straight from your dashboard.
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="py-12 bg-white">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">FAQ</p>
          <h2 class="text-2xl font-bold text-gray-900 mt-2">Answers to common questions</h2>
          <p class="text-sm text-gray-600 mt-1">Everything you need to know before or after checkout.</p>
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        {#each faqColumns as column}
          <div class="space-y-4">
            {#each column as faq}
              <details class="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <summary class="flex cursor-pointer list-none items-start justify-between gap-4">
                  <div class="space-y-2">
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-cyan-600">{faq.tag}</span>
                    <h3 class="text-sm font-semibold text-gray-900">{faq.question}</h3>
                  </div>
                  <span class="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition group-open:rotate-180 group-open:bg-cyan-50 group-open:text-cyan-600">
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </summary>
                <div class="mt-3 text-sm text-gray-600 leading-relaxed space-y-3">
                  <p>{faq.answer}</p>
                  {#if faq.linkHref && faq.linkText}
                    <a
                      href={faq.linkHref}
                      class="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-800"
                    >
                      {faq.linkText}
                    </a>
                  {/if}
                </div>
              </details>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <Footer />
</div>
