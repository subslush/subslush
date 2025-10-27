<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { browser } from '$app/environment';
  import { completedAnimations, createAnimationId, markAnimationCompleted } from '$lib/stores/animations';

  // Props
  export let value: number;
  export let duration: number = 2000;
  export let delay: number = 0;
  export let suffix: string = '';
  export let prefix: string = '';
  export let formatNumber: boolean = true;
  export let decimals: number = 0;
  export let location: string = 'default'; // Unique identifier for this animation location

  // Create unique animation ID
  $: animationId = createAnimationId('countup', value, location);

  // Tweened store for smooth animation
  const count = tweened(0, {
    duration,
    easing: cubicOut
  });

  // Component state
  let element: HTMLElement;
  let isIntersecting = false;
  let observer: IntersectionObserver | null = null;
  let animationTriggered = false;

  // Check if this animation has already been completed globally
  $: hasGloballyAnimated = $completedAnimations.has(animationId);

  // If animation was completed globally, set the final value immediately
  $: if (hasGloballyAnimated && $count !== value) {
    count.set(value, { duration: 0 });
  }

  // Ensure final value is always shown after a reasonable delay (prevents stuck at 0)
  $: if (browser && element && $count === 0 && value > 0) {
    setTimeout(() => {
      if ($count === 0) {
        console.log('🎯 [CountUpNumber] Emergency fallback - setting final value:', { animationId, value });
        count.set(value, { duration: 0 });
        markAnimationCompleted(animationId);
      }
    }, 5000);
  }

  function startAnimation() {
    if (animationTriggered || hasGloballyAnimated) return;

    console.log('🎯 [CountUpNumber] Starting animation:', { animationId, value, delay });
    animationTriggered = true;

    setTimeout(() => {
      count.set(value);
      // Mark as completed globally to prevent re-animation on navigation
      markAnimationCompleted(animationId);
    }, delay);
  }

  function setupIntersectionObserver() {
    if (!browser || !element || observer) return;

    // Check if already visible with more generous bounds
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const isVisible = rect.top < (windowHeight + 100) && rect.bottom > -100;

    if (isVisible) {
      console.log('🎯 [CountUpNumber] Element immediately visible:', animationId);
      isIntersecting = true;
      if (!hasGloballyAnimated) {
        startAnimation();
      }
      return;
    }

    // Setup intersection observer with more aggressive settings
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const wasIntersecting = isIntersecting;
          isIntersecting = entry.isIntersecting;

          console.log('🎯 [CountUpNumber] Intersection change:', {
            animationId,
            isIntersecting,
            wasIntersecting,
            hasGloballyAnimated,
            boundingRect: entry.boundingClientRect,
            intersectionRatio: entry.intersectionRatio
          });

          if (isIntersecting && !wasIntersecting && !hasGloballyAnimated) {
            console.log('🎯 [CountUpNumber] Element entered viewport:', animationId);
            startAnimation();
          }
        });
      },
      {
        threshold: [0, 0.1, 0.25, 0.5], // Multiple thresholds for better detection
        rootMargin: '100px 0px' // More generous margin
      }
    );

    observer.observe(element);
    console.log('🎯 [CountUpNumber] Observer setup complete:', animationId);
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  onMount(() => {
    if (!browser) {
      // In SSR, set final value immediately
      count.set(value, { duration: 0 });
      return;
    }

    console.log('🎯 [CountUpNumber] Component mounted:', { animationId, value, hasGloballyAnimated });

    // Small delay to ensure DOM is ready
    setTimeout(setupIntersectionObserver, 100);

    // Fallback: If animation hasn't triggered within 3 seconds, trigger it anyway
    const fallbackTimer = setTimeout(() => {
      if (!animationTriggered && !hasGloballyAnimated) {
        console.log('🎯 [CountUpNumber] Fallback animation trigger:', animationId);
        startAnimation();
      }
    }, 3000);

    return () => {
      clearTimeout(fallbackTimer);
      cleanup();
    };
  });

  afterUpdate(() => {
    // Ensure observer is setup after any data changes
    if (browser && element && !observer && !hasGloballyAnimated) {
      setupIntersectionObserver();
    }
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