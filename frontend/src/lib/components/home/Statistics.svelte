<script lang="ts">
  // TODO: Replace with actual backend data when available
  const stats = [
    { value: '250,127', label: 'Happy Customers' },
    { value: '500+', label: 'Premium Services' },
    { value: '€2.5M+', label: 'Total Savings' },
    { value: '99.9%', label: 'Uptime Guarantee' }
  ];
</script>

<section class="py-12 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 class="text-center text-2xl font-semibold text-gray-900 mb-8">
      Trusted by Customers Worldwide
    </h2>

    <p class="text-center text-sm text-gray-600 mb-12">
      Our numbers speak for themselves
    </p>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
      {#each stats as stat}
        <div class="text-center">
          <p class="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            {stat.value}
          </p>
          <p class="text-sm text-gray-600">
            {stat.label}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>