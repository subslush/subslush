<script lang="ts">
  import {
    Lock,           // 🔒 Bank-Level Security
    Zap,            // ⚡ Instant Access
    BadgeDollarSign,// 💰 Best Price Guaranteed
    CheckCircle,    // ✓ 7-Day Money Back
    Globe,          // 🌍 24/7 Support
    ShieldCheck,    // 🔐 Verified Licenses
    Users,          // 👥 250K+ Happy Users
    Shield          // 🔄 Privacy Protected
  } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';

  interface TrustSignal {
    icon: ComponentType;
    title: string;
    description: string;
    iconColor: string;
    bgColor: string;
  }

  const trustSignals: TrustSignal[] = [
    {
      icon: Zap,
      title: 'Big discounts',
      description: 'Heavily discounted popular premium subscriptions.',
      iconColor: 'text-white',
      bgColor: 'bg-white/10'
    },
    {
      icon: Lock,
      title: 'Secure payments',
      description: 'Bank-level security with 256-bit SSL encryption.',
      iconColor: 'text-white',
      bgColor: 'bg-white/10'
    },
    {
      icon: CheckCircle,
      title: 'Simple management',
      description: 'Manage subscriptions and renewals from one dashboard.',
      iconColor: 'text-white',
      bgColor: 'bg-white/10'
    },
    {
      icon: Globe,
      title: 'Full warranty',
      description: 'Coverage for your entire subscription period.',
      iconColor: 'text-white',
      bgColor: 'bg-white/10'
    }
  ];
</script>

<section class="py-8 bg-gray-900">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <svelte:component this={signal.icon} size={22} class={signal.iconColor} />
          </div>
          <h3 class="text-base font-semibold text-white mb-1.5">{signal.title}</h3>
          <p class="text-sm text-gray-300 leading-relaxed">{signal.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
