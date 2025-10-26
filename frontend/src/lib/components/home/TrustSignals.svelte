<script lang="ts">
  const trustSignals = [
    {
      icon: '🔒',
      title: 'Bank-Level Security',
      description: '256-bit SSL encryption. Your payment data is always protected with the same security banks use.'
    },
    {
      icon: '⚡',
      title: 'Instant Access',
      description: 'Get immediate access to your subscriptions. No waiting, no delays - start using right away.'
    },
    {
      icon: '💰',
      title: 'Best Price Guaranteed',
      description: 'Find a better price elsewhere? We\'ll match it plus give you an extra 5% off.'
    },
    {
      icon: '✓',
      title: '7-Day Money Back',
      description: 'Not satisfied? Get a full refund within 7 days, no questions asked. Your satisfaction guaranteed.'
    },
    {
      icon: '🌍',
      title: '24/7 Support',
      description: 'Our dedicated support team is available around the clock to help with any questions.'
    },
    {
      icon: '🔐',
      title: 'Verified Licenses',
      description: 'All subscriptions are legitimate and verified. No pirated or shared accounts.'
    },
    {
      icon: '👥',
      title: '250K+ Happy Users',
      description: 'Join over 250,000 satisfied customers who save money on premium subscriptions.'
    },
    {
      icon: '🔄',
      title: 'Privacy Protected',
      description: 'We never share your personal data. Your privacy is our top priority.'
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
          <!-- Icon Circle -->
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="text-3xl">{signal.icon}</span>
          </div>

          <!-- Title -->
          <h3 class="font-semibold text-gray-900 mb-2">{signal.title}</h3>

          <!-- Description -->
          <p class="text-sm text-gray-600 leading-relaxed">
            {signal.description}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>