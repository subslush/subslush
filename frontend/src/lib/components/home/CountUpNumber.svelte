<script lang="ts">
  import { onMount } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  // Props
  export let value: number;
  export let duration: number = 2000; // Animation duration in ms
  export let delay: number = 0; // Delay before starting animation
  export let suffix: string = ''; // Suffix like '+' or '%'
  export let prefix: string = ''; // Prefix like '€'
  export let formatNumber: boolean = true; // Whether to add commas
  export let decimals: number = 0; // Number of decimal places

  // Tweened store for smooth animation
  const count = tweened(0, {
    duration,
    easing: cubicOut
  });

  // Track if animation has run (only animate once)
  let hasAnimated = false;
  let element: HTMLElement;

  onMount(() => {
    // Intersection Observer to trigger animation when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasAnimated) {
            // Delay then start animation
            setTimeout(() => {
              count.set(value);
              hasAnimated = true;
            }, delay);
          }
        });
      },
      {
        threshold: 0.5, // Trigger when 50% visible
        rootMargin: '0px'
      }
    );

    observer.observe(element);

    // Cleanup
    return () => {
      observer.disconnect();
    };
  });

  /**
   * Format number with commas and decimals
   */
  function formatValue(val: number): string {
    const rounded = decimals > 0
      ? val.toFixed(decimals)
      : Math.round(val).toString();

    if (!formatNumber) {
      return rounded;
    }

    // Add thousand separators
    const parts = rounded.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
</script>

<span bind:this={element} class="inline-block">
  {prefix}{formatValue($count)}{suffix}
</span>