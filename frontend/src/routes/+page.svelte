<script lang="ts">
  import { ArrowUp, Play, Music, Bot, Briefcase, Code, Gamepad2, Shield, Users, GraduationCap, Dumbbell, PenTool, ChevronDown, Mail } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiClient } from '$lib/api/client.js';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Hero from '$lib/components/home/Hero.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import TrustSignals from '$lib/components/home/TrustSignals.svelte';
  import TestimonialsSection from '$lib/components/home/TestimonialsSection.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { API_ENDPOINTS } from '$lib/utils/constants.js';
  import { isValidEmail } from '$lib/utils/validators.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';
  let showScrollTop = false;
  const categories = [
    { key: 'streaming', label: 'Streaming', icon: Play },
    { key: 'music', label: 'Music', icon: Music },
    { key: 'ai', label: 'AI', icon: Bot },
    { key: 'productivity', label: 'Productivity', icon: Briefcase },
    { key: 'software', label: 'Software', icon: Code },
    { key: 'gaming', label: 'Gaming', icon: Gamepad2 },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'social', label: 'Social', icon: Users },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'fitness', label: 'Fitness', icon: Dumbbell },
    { key: 'design', label: 'Design', icon: PenTool }
  ];

  const bestsellers = Array.isArray(data.products) ? data.products.slice(0, 6) : [];

  const bundles = [
    { title: 'Creator duo', items: ['Adobe CC', 'Canva Pro'] },
    { title: 'Music + Streaming', items: ['Spotify', 'Netflix', 'Disney+'] },
    { title: 'Productivity power', items: ['Notion', 'Slack', 'Microsoft 365', 'Figma'] }
  ];

  onMount(() => {
    const hero = document.getElementById('hero-section');
    const heroHeight = hero?.offsetHeight ?? 0;

    const bannerEl = document.getElementById('promo-banner');
    if (bannerEl) {
      bannerHeight = bannerEl.offsetHeight;
    }

    const handleScroll = () => {
      showScrollTop = window.scrollY > heroHeight;
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function goToCategory(categoryKey: string) {
    const params = new URLSearchParams();
    params.set('category', categoryKey);
    goto(`/browse?${params.toString()}`);
  }

  function goToAllCategories() {
    goto('/browse');
  }

  let showNewsletterDetails = false;
  let bannerHeight = 0;
  let newsletterEmail = '';
  let newsletterError = '';
  let newsletterSuccess = '';
  let newsletterLoading = false;

  $: newsletterEmailValid = isValidEmail(newsletterEmail.trim());

  const resolveNewsletterError = (error: unknown): string => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Unable to subscribe. Please try again.';
  };

  const handleNewsletterSubscribe = async () => {
    newsletterError = '';
    newsletterSuccess = '';

    const email = newsletterEmail.trim();
    if (!isValidEmail(email)) {
      newsletterError = 'Please enter a valid email address.';
      return;
    }

    newsletterLoading = true;
    try {
      const response = await apiClient.post(API_ENDPOINTS.NEWSLETTER.SUBSCRIBE, {
        email,
        source: 'homepage'
      });
      const message =
        (response.data as { message?: string })?.message
        || 'Thanks for subscribing! Check your email for your 12% off coupon.';
      newsletterSuccess = message;
      newsletterEmail = '';
    } catch (error) {
      newsletterError = resolveNewsletterError(error);
    } finally {
      newsletterLoading = false;
    }
  };

  const handleNewsletterKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!newsletterLoading) {
        void handleNewsletterSubscribe();
      }
    }
  };
</script>

<svelte:head>
  <title>SubSlush - Save Up To 90% On Premium Subscriptions</title>
  <meta name="description" content="Join 250,000+ users getting Spotify, Netflix, and 500+ services at a fraction of retail price. Instant access. Verified accounts." />
</svelte:head>

<!-- Home page wrapper with natural scroll -->
<div class="min-h-screen bg-white">
  <!-- Navigation -->
  <HomeNav bind:searchQuery />

  <!-- Hero Section -->
  <Hero />

  <!-- Categories (sticky carousel) -->
  <div class="sticky z-40 w-full" style={`top: ${bannerHeight}px`}>
    <div class="flex justify-center px-2 sm:px-4 lg:px-6">
      <div class="max-w-5xl w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm bg-white">
        <div class="flex items-center justify-between gap-3 mb-2">
          <p class="text-sm font-semibold text-cyan-600 uppercase tracking-wide">Product categories</p>
          <button
            class="text-sm font-semibold text-cyan-600 hover:text-cyan-700 underline underline-offset-4"
            on:click={goToAllCategories}
          >
            Browse all products
          </button>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each categories as category}
            <button
              class="flex-shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm hover:shadow-md transition transform hover:-translate-y-0.5"
              on:click={() => goToCategory(category.key)}
            >
              <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-50 to-pink-50 text-cyan-600 border border-cyan-100">
                <svelte:component this={category.icon} size={14} />
              </span>
              <span class="text-sm font-semibold text-gray-900 whitespace-nowrap">{category.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Spacer -->
  <div class="h-6 bg-white"></div>

  <!-- Bestsellers -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Bestsellers</h2>
          <p class="text-sm text-gray-600 mt-1">The hottest items on our marketplace – discover what captured our users' hearts!</p>
        </div>
      </div>

      {#if bestsellers.length > 0}
        <SubscriptionGrid products={bestsellers} />
      {:else}
        <div class="border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-600">
          No bestsellers yet. Check back soon.
        </div>
      {/if}
    </div>
  </section>

  <!-- Bundle deals -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Bundle deals</h2>
        </div>
      </div>
      <div class="flex gap-3 overflow-x-auto pb-2">
        {#each bundles as bundle}
          <div class="flex-shrink-0 w-72 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition">
            <h3 class="text-lg font-bold text-gray-900 mb-3">{bundle.title}</h3>
            <ul class="space-y-2 text-sm text-gray-700">
              {#each bundle.items as item}
                <li class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-cyan-500"></span>
                  {item}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Trust Signals -->
  <TrustSignals />

  <!-- Newsletter CTA -->
  <div class="h-8 bg-white"></div>
  <section class="py-8 bg-blue-100">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center text-gray-900">
        <div class="space-y-2 relative">
          <h2 class="text-xl font-bold">Join our newsletter and enjoy 12% off</h2>
          <p class="text-sm text-gray-700 max-w-2xl leading-snug">
            Subscribe to get updates, confirm your subscription, and receive a discount code to use instantly
          </p>
          <button
            class="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4 text-gray-800"
            on:click={() => showNewsletterDetails = !showNewsletterDetails}
            aria-expanded={showNewsletterDetails}
          >
            <ChevronDown size={16} class={`transition-transform ${showNewsletterDetails ? 'rotate-180' : ''}`} />
            {showNewsletterDetails ? 'Show less' : 'Show more'}
          </button>
          {#if showNewsletterDetails}
            <div class="absolute left-0 right-0 mt-2 text-xs text-gray-800 bg-white/90 border border-gray-200 rounded-lg p-3 leading-relaxed shadow">
              By subscribing to the newsletter, you consent to SUBSLUSH.COM sending commercial communications to your email, including personalized offers available on the SubSlush Marketplace. The administrator of your personal data is SUBSLUSH.COM. You can withdraw your consent at any time. If you withdraw your consent, it will not affect the legality of your data processed before. We process your personal data in line with the Privacy and Cookies Policy. Every new user who subscribes for the first time to the newsletter receives a one-time 12% discount code that may use once for future purchases on the subslush.com platform. The code is valid for 3 days.
            </div>
          {/if}
        </div>
        <div class="bg-white rounded-xl shadow-md p-4 flex flex-col gap-2">
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex items-center gap-2 flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
              <Mail size={18} class="text-gray-500" />
              <input
                type="email"
                id="newsletter-email"
                placeholder="Enter your email"
                class="flex-1 bg-transparent border-0 focus:outline-none text-sm text-gray-900"
                bind:value={newsletterEmail}
                on:keydown={handleNewsletterKeydown}
                disabled={newsletterLoading}
                aria-invalid={newsletterError ? 'true' : 'false'}
              />
            </div>
            <button
              class="inline-flex items-center justify-center h-8 px-3 rounded-md text-sm leading-tight font-semibold text-white bg-gradient-to-r from-cyan-500 to-pink-500 shadow-sm hover:shadow-md transition min-h-0 sm:self-center"
              type="button"
              on:click={handleNewsletterSubscribe}
              disabled={newsletterLoading || !newsletterEmailValid}
            >
              {newsletterLoading ? 'Sending...' : 'Subscribe'}
            </button>
          </div>
          {#if newsletterError}
            <p class="text-xs text-red-700">{newsletterError}</p>
          {/if}
          {#if newsletterSuccess}
            <p class="text-xs text-green-700">{newsletterSuccess}</p>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <Footer />

  {#if data.error}
    <div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
      <p class="text-sm">{data.error}</p>
    </div>
  {/if}

  {#if showScrollTop}
    <button
      class="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg hover:bg-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label="Back to top"
      on:click={scrollToTop}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  {/if}
</div>
