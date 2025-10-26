<script lang="ts">
  import CountUpNumber from './CountUpNumber.svelte';

  interface Stat {
    value: number;
    label: string;
    prefix?: string;
    suffix?: string;
    animated: boolean;
    formatNumber: boolean;
    decimals?: number;
  }

  const stats: Stat[] = [
    {
      value: 250127,
      label: 'Happy Customers',
      animated: true,
      formatNumber: true,
      decimals: 0
    },
    {
      value: 500,
      label: 'Premium Services',
      suffix: '+',
      animated: true,
      formatNumber: false,
      decimals: 0
    },
    {
      value: 2.5,
      label: 'Total Savings',
      prefix: '€',
      suffix: 'M+',
      animated: true,
      formatNumber: false,
      decimals: 1
    },
    {
      value: 99.9,
      label: 'Uptime Guarantee',
      suffix: '%',
      animated: false, // Keep static as requested
      formatNumber: false,
      decimals: 1
    }
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
      {#each stats as stat, index}
        <div class="text-center">

          <!-- Number with animation -->
          <p class="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            {#if stat.animated}
              <CountUpNumber
                value={stat.value}
                prefix={stat.prefix || ''}
                suffix={stat.suffix || ''}
                delay={index * 150}
                duration={2000}
                formatNumber={stat.formatNumber}
                decimals={stat.decimals || 0}
              />
            {:else}
              {stat.prefix || ''}{stat.value}{stat.suffix || ''}
            {/if}
          </p>

          <!-- Label -->
          <p class="text-sm text-gray-600">
            {stat.label}
          </p>
        </div>
      {/each}
    </div>
  </div>
</section>