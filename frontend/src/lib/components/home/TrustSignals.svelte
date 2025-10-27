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

  interface TrustSignal {
    icon: any; // Svelte component type
    title: string;
    description: string;
    iconColor: string;
    bgColor: string;
  }

  const trustSignals: TrustSignal[] = [
    {
      icon: Lock,
      title: 'Bank-Level Security',
      description: '256-bit SSL encryption protects your payment data.',
      iconColor: 'text-cyan-600',
      bgColor: 'bg-cyan-50'
    },
    {
      icon: Zap,
      title: 'Instant Access',
      description: 'Start using your subscriptions immediately, no waiting.',
      iconColor: 'text-amber-600',
      bgColor: 'bg-amber-50'
    },
    {
      icon: CheckCircle,
      title: '7-Day Money Back',
      description: 'Full refund within 7 days, no questions asked.',
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      icon: Globe,
      title: '24/7 Support',
      description: 'Our team is always available to help you.',
      iconColor: 'text-cyan-600',
      bgColor: 'bg-cyan-50'
    }
  ];
</script>

<section class="py-12 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Heading -->
    <div class="text-center mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-2">
        Why Choose SubSlush?
      </h2>
      <p class="text-base text-gray-600">
        Join thousands of satisfied customers saving money every month
      </p>
    </div>

    <!-- Trust Signal Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each trustSignals as signal}
        <div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div class="p-3 {signal.bgColor} rounded-lg w-12 h-12 flex items-center justify-center mb-4">
            <svelte:component this={signal.icon} size={24} class={signal.iconColor} />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">{signal.title}</h3>
          <p class="text-sm text-gray-600">{signal.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>