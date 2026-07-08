<script lang="ts">
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { ArrowRight, CreditCard, ShieldCheck } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Your payment didn't go through - SubSlush</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta
    name="description"
    content="Your payment was declined, but you have not been charged and your order is still saved."
  />
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-br from-cyan-100/70 via-white to-fuchsia-100/70"></div>

    <section class="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div class="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
        <div class="border-b border-slate-100 px-6 py-6 sm:px-8">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <ShieldCheck class="h-6 w-6" />
            </div>
            <div>
              <h1 class="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                Your payment didn't go through
              </h1>
              <p class="mt-2 text-sm font-medium text-slate-600">
                Don't worry &mdash; you have not been charged, and your order is still saved.
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-7 px-6 py-6 sm:px-8">
          <section class="space-y-4 text-base leading-7 text-slate-700">
            <p>
              Your bank declined this payment. This usually isn't about your card or your
              balance &mdash; many banks automatically block online purchases from international
              stores unless you've switched them on first.
            </p>

            <div>
              <p class="font-semibold text-slate-950">Here's what you can do:</p>
              <ol class="mt-3 space-y-3 pl-5">
                <li class="pl-1">
                  Open your banking app and look for a setting like 'Allow international
                  payments' or 'Online purchases abroad', and turn it on for your card.
                </li>
                <li class="pl-1">Come back and try your payment again.</li>
              </ol>
            </div>

            <a
              href="/checkout/payment"
              class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
            >
              Try again
              <ArrowRight class="h-4 w-4" />
            </a>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-fuchsia-700 shadow-sm">
                <CreditCard class="h-5 w-5" />
              </div>
              <div class="space-y-3 text-sm leading-6 text-slate-700">
                <h2 class="text-base font-bold text-slate-950">Still not working?</h2>
                <p>
                  Some banks block these payments no matter what. The easiest fix is to pay
                  with Apple Pay or Google Pay instead &mdash; you can add the same card there, and
                  payments almost always go through smoothly. You'll also find other payment
                  options at checkout, so you can pick whichever works best for you.
                </p>
                <a
                  href="/checkout/payment"
                  class="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 sm:w-auto"
                >
                  Choose another payment method
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  </main>

  <Footer />
</div>
