<script lang="ts">
  import {
    Lock,           // 🔒 Bank-Level Security
    Zap,            // ⚡ Instant Access
    CheckCircle,    // ✓ 7-Day Money Back
    Globe,          // 🌍 24/7 Support
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';

  interface TrustSignal {
    icon: ComponentType;
    title: string;
    description: string;
    bgColor: string;
  }

  const trustSignals: TrustSignal[] = [
    {
      icon: Zap,
      title: 'Big discounts',
      description: 'Heavily discounted popular premium subscriptions.',
      bgColor: 'bg-white/10'
    },
    {
      icon: Lock,
      title: 'Secure payments',
      description: 'Bank-level security with 256-bit SSL encryption.',
      bgColor: 'bg-white/10'
    },
    {
      icon: CheckCircle,
      title: 'Simple management',
      description: 'Manage subscriptions and renewals from one dashboard.',
      bgColor: 'bg-white/10'
    },
    {
      icon: Globe,
      title: 'Full warranty',
      description: 'Coverage for your entire subscription period.',
      bgColor: 'bg-white/10'
    }
  ];
</script>

<section class="py-8 bg-gray-900 content-visibility-auto">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <svg aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <linearGradient id="subslush-trust-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#7e22ce"></stop>
          <stop offset="100%" stop-color="#db2777"></stop>
        </linearGradient>
      </defs>
    </svg>

    <!-- Heading -->
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-white mb-1">
        Why SubSlush?
      </h2>
    </div>

    <!-- Trust Signal Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {#each trustSignals as signal}
        <div class="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:border-gray-600 transition-border">
          <div class="p-3 {signal.bgColor} rounded-lg w-11 h-11 flex items-center justify-center mb-3">
            <svelte:component this={signal.icon} size={22} class="trust-signal-icon" />
          </div>
          <h3 class="text-base font-semibold text-white mb-1.5">{signal.title}</h3>
          <p class="text-sm text-gray-300 leading-relaxed">{signal.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  :global(.trust-signal-icon *) {
    stroke: url(#subslush-trust-gradient);
  }
</style>
