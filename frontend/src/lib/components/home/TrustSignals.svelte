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
      description: '256-bit SSL encryption. Your payment data is always protected with the same security banks use.',
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: Zap,
      title: 'Instant Access',
      description: 'Get immediate access to your subscriptions. No waiting, no delays - start using right away.',
      iconColor: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      icon: BadgeDollarSign,
      title: 'Best Price Guaranteed',
      description: "Find a better price elsewhere? We'll match it plus give you an extra 5% off.",
      iconColor: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      icon: CheckCircle,
      title: '7-Day Money Back',
      description: 'Not satisfied? Get a full refund within 7 days, no questions asked. Your satisfaction guaranteed.',
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-100'
    },
    {
      icon: Globe,
      title: '24/7 Support',
      description: 'Our dedicated support team is available around the clock to help with any questions.',
      iconColor: 'text-cyan-600',
      bgColor: 'bg-cyan-100'
    },
    {
      icon: ShieldCheck,
      title: 'Verified Licenses',
      description: 'All subscriptions are legitimate and verified. No pirated or shared accounts.',
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      icon: Users,
      title: '250K+ Happy Users',
      description: 'Join over 250,000 satisfied customers who save money on premium subscriptions.',
      iconColor: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    {
      icon: Shield,
      title: 'Privacy Protected',
      description: 'We never share your personal data. Your privacy is our top priority.',
      iconColor: 'text-gray-600',
      bgColor: 'bg-gray-100'
    }
  ];
</script>

<section class="py-12 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Heading -->
    <div class="text-center mb-12">
      <h2 class="text-2xl font-semibold text-gray-900 mb-2">
        Why Choose SubSlush?
      </h2>
      <p class="text-sm text-gray-600 max-w-2xl mx-auto">
        Trusted by 250,000+ users for secure, instant access to premium subscriptions
      </p>
    </div>

    <!-- Trust Signal Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each trustSignals as signal}
        <div class="text-center">

          <!-- Icon Circle with colored background -->
          <div class="w-16 h-16 {signal.bgColor} rounded-full flex items-center justify-center mx-auto mb-4 transition-transform hover:scale-110">
            <svelte:component
              this={signal.icon}
              size={28}
              class={signal.iconColor}
              strokeWidth={2}
            />
          </div>

          <!-- Title -->
          <h3 class="font-semibold text-gray-900 mb-2 text-base">
            {signal.title}
          </h3>

          <!-- Description -->
          <p class="text-sm text-gray-600 leading-relaxed">
            {signal.description}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>