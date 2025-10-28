<script lang="ts">
  import { onMount } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { TrendingUp, ArrowRight, DollarSign } from 'lucide-svelte';
  import type { SavingsSpeedometerProps } from '$lib/types/browse.js';

  export let currentSavings = 0;
  export let maxSavings = 150;
  export let userSavingsData: SavingsSpeedometerProps['userSavingsData'] = {
    averageSavings: 94,
    comparisonCount: 3
  };

  // Animated values
  const animatedSavings = tweened(0, {
    duration: 1500,
    easing: cubicOut
  });

  const needleRotation = tweened(0, {
    duration: 800,
    easing: cubicOut
  });

  const gaugeProgress = tweened(0, {
    duration: 1200,
    easing: cubicOut
  });

  // Reactive calculations
  $: savingsPercentage = Math.min((currentSavings / maxSavings) * 100, 100);
  $: needleAngle = (savingsPercentage / 100) * 270 - 135; // -135° to 135° range
  $: savingsColor = getSavingsColor(currentSavings);
  $: savingsCategory = getSavingsCategory(currentSavings);
  $: comparisonText = getComparisonText(currentSavings);

  // Update animations when currentSavings changes
  $: if (currentSavings !== undefined) {
    animatedSavings.set(currentSavings);
    needleRotation.set(needleAngle);
    gaugeProgress.set(savingsPercentage);
  }

  function getSavingsColor(savings: number): string {
    if (savings < 30) return 'text-amber-500';
    if (savings < 60) return 'text-cyan-500';
    if (savings < 100) return 'text-green-500';
    return 'text-transparent bg-gradient-to-r from-cyan-500 to-pink-500 bg-clip-text';
  }

  function getSavingsCategory(savings: number): string {
    if (savings < 30) return 'Good Start';
    if (savings < 60) return 'Great Savings';
    if (savings < 100) return 'Excellent Value';
    return 'Outstanding Deal';
  }

  function getComparisonText(savings: number): string {
    if (savings >= 100) return "That's like getting 2 months free every year! 🎉";
    if (savings >= 80) return "That's 16 Starbucks coffees! ☕";
    if (savings >= 60) return "That's a nice dinner for two! 🍽️";
    if (savings >= 40) return "That's your weekly groceries! 🛒";
    if (savings >= 20) return "That's a movie night out! 🎬";
    return "Every euro saved counts! 💰";
  }

  // Initialize animations on mount
  onMount(() => {
    // Stagger the initial animations
    setTimeout(() => animatedSavings.set(currentSavings), 300);
    setTimeout(() => needleRotation.set(needleAngle), 500);
    setTimeout(() => gaugeProgress.set(savingsPercentage), 700);
  });

  // SVG dimensions and calculations
  const size = 200;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centerX = size / 2;
  const centerY = size / 2;

  // Arc path for the gauge background
  function createArcPath(startAngle: number, endAngle: number, r: number): string {
    const start = polarToCartesian(centerX, centerY, r, startAngle);
    const end = polarToCartesian(centerX, centerY, r, endAngle);
    const arcSweep = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${arcSweep} 1 ${end.x} ${end.y}`;
  }

  function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  }

  // Gauge segments for visual appeal
  const segments = [
    { start: -135, end: -90, color: '#f59e0b', label: '€0' },
    { start: -90, end: -45, color: '#06b6d4', label: '€50' },
    { start: -45, end: 0, color: '#10b981', label: '€100' },
    { start: 0, end: 45, color: '#8b5cf6', label: '€150+' },
    { start: 45, end: 135, color: '#ec4899', label: 'Max' }
  ];
</script>

<div class="savings-speedometer bg-white rounded-xl border border-gray-200 p-6 lg:p-8">
  <!-- Header -->
  <div class="text-center mb-6">
    <div class="flex items-center justify-center space-x-2 mb-2">
      <DollarSign class="text-green-500" size={24} />
      <h3 class="text-xl font-bold text-gray-900">Your Potential Monthly Savings</h3>
    </div>
    <p class="text-gray-600 text-sm">Based on current subscriptions in your comparison</p>
  </div>

  <!-- Speedometer Container -->
  <div class="relative flex justify-center mb-6">
    <div class="speedometer-container relative" style="width: {size}px; height: {size * 0.75}px;">
      <!-- SVG Gauge -->
      <svg
        width={size}
        height={size}
        viewBox="0 0 {size} {size}"
        class="absolute inset-0 transform -rotate-90"
        style="overflow: visible;"
      >
        <!-- Background arc -->
        <path
          d={createArcPath(-135, 135, radius)}
          fill="none"
          stroke="#f3f4f6"
          stroke-width={strokeWidth}
          stroke-linecap="round"
        />

        <!-- Colored segments -->
        {#each segments as segment}
          <path
            d={createArcPath(segment.start, segment.end, radius)}
            fill="none"
            stroke={segment.color}
            stroke-width={strokeWidth * 0.3}
            stroke-linecap="round"
            opacity="0.3"
          />
        {/each}

        <!-- Progress arc -->
        <path
          d={createArcPath(-135, -135 + (($gaugeProgress / 100) * 270), radius)}
          fill="none"
          stroke="url(#gradient)"
          stroke-width={strokeWidth}
          stroke-linecap="round"
          style="transition: all 0.8s ease-out;"
        />

        <!-- Gradient definition -->
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="50%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#ec4899" />
          </linearGradient>
        </defs>

        <!-- Needle -->
        <g transform="translate({centerX}, {centerY}) rotate({$needleRotation})">
          <line
            x1="0"
            y1="0"
            x2={radius - 10}
            y2="0"
            stroke="#374151"
            stroke-width="3"
            stroke-linecap="round"
            style="transition: transform 0.8s ease-out;"
          />
          <!-- Needle base -->
          <circle cx="0" cy="0" r="6" fill="#374151" />
        </g>
      </svg>

      <!-- Center value display -->
      <div class="absolute inset-0 flex items-center justify-center pt-8">
        <div class="text-center">
          <div class="text-3xl lg:text-4xl font-bold {savingsColor} mb-1">
            €{$animatedSavings.toFixed(0)}
          </div>
          <div class="text-sm font-medium text-gray-600">
            {savingsCategory}
          </div>
        </div>
      </div>

      <!-- Scale labels -->
      <div class="absolute inset-0">
        {#each segments as segment, index}
          {@const labelAngle = (segment.start + segment.end) / 2}
          {@const labelPos = polarToCartesian(centerX, centerY, radius + 20, labelAngle)}
          <div
            class="absolute text-xs font-medium text-gray-500 transform -translate-x-1/2 -translate-y-1/2"
            style="left: {labelPos.x}px; top: {labelPos.y}px;"
          >
            {segment.label}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Stats and insights -->
  <div class="space-y-4">
    <!-- Current comparison stats -->
    <div class="bg-gradient-to-br from-cyan-50/50 to-pink-50/50 rounded-lg p-4 border border-cyan-100">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700">Current comparison:</span>
        <span class="text-sm font-bold text-cyan-600">
          {userSavingsData?.comparisonCount || 0} services
        </span>
      </div>
      <div class="text-sm text-gray-600">
        {comparisonText}
      </div>
    </div>

    <!-- Social proof -->
    <div class="flex items-center justify-between text-sm">
      <div class="flex items-center space-x-2">
        <TrendingUp size={16} class="text-green-500" />
        <span class="text-gray-600">Users like you save an average of</span>
      </div>
      <span class="font-bold text-green-600">
        €{userSavingsData?.averageSavings || 94}/month
      </span>
    </div>

    <!-- CTA -->
    <button
      type="button"
      class="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-105 flex items-center justify-center space-x-2 group"
    >
      <span>Compare More Services</span>
      <ArrowRight size={16} class="transform group-hover:translate-x-1 transition-transform" />
    </button>
  </div>
</div>

<style>
  .savings-speedometer {
    /* Subtle shadow for depth */
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  }

  .speedometer-container {
    /* Ensure proper positioning for overlaid elements */
    position: relative;
    isolation: isolate;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .speedometer-container {
      width: 160px !important;
      height: 120px !important;
    }

    .savings-speedometer :global(.text-3xl) {
      font-size: 1.875rem;
    }

    .savings-speedometer :global(.text-4xl) {
      font-size: 1.875rem;
    }
  }

  @media (max-width: 640px) {
    .speedometer-container {
      width: 140px !important;
      height: 105px !important;
    }

    .savings-speedometer :global(.text-3xl),
    .savings-speedometer :global(.text-4xl) {
      font-size: 1.5rem;
    }
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    .speedometer-container *,
    .savings-speedometer button {
      transition: none !important;
      animation: none !important;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .savings-speedometer {
      border-width: 2px;
      border-color: #000;
    }
  }

  /* Hover effects for interactivity */
  .savings-speedometer:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease-out;
  }

  /* Pulse animation for center value when it updates */
  .savings-speedometer :global(.font-bold) {
    animation: pulse-value 0.5s ease-out;
  }

  @keyframes pulse-value {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
</style>