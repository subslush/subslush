<script lang="ts">
  import { Play, Music, Bot, Briefcase, GraduationCap, Dumbbell, PenTool, ChevronDown, Mail } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { apiClient } from '$lib/api/client.js';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Hero from '$lib/components/home/Hero.svelte';
  import HomeCategoryRail from '$lib/components/home/HomeCategoryRail.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import TrustSignals from '$lib/components/home/TrustSignals.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { API_ENDPOINTS } from '$lib/utils/constants.js';
  import { isValidEmail } from '$lib/utils/validators.js';
  import type { ProductListing } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  type CuratedProductRule = {
    subCategory?: string;
    slug?: string;
    aliases?: string[];
  };

  type HomeShowcaseSection = {
    key: string;
    title: string;
    description: string;
    listName: string;
    emptyState: string;
    products: ProductListing[];
    subCategoryDiscounts: Record<string, number>;
  };

  let searchQuery = '';
  const categories = [
    { key: 'streaming', label: 'Streaming', icon: Play },
    { key: 'music', label: 'Music', icon: Music },
    { key: 'ai', label: 'AI', icon: Bot },
    { key: 'productivity', label: 'Productivity', icon: Briefcase },
    { key: 'design', label: 'Design', icon: PenTool },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'fitness', label: 'Fitness', icon: Dumbbell }
  ];

  const curatedProductsByCategory: Record<string, CuratedProductRule[]> = {
    streaming: [
      { subCategory: 'netflix', slug: 'netflix', aliases: ['netflix'] },
      {
        subCategory: 'amazon prime video',
        slug: 'amazon-prime-video',
        aliases: ['amazon prime video', 'amazon']
      },
      { subCategory: 'youtube', slug: 'youtube', aliases: ['youtube'] },
      { subCategory: 'apple tv', slug: 'apple-tv', aliases: ['apple tv'] },
      {
        subCategory: 'crunchyroll',
        slug: 'crunchyroll',
        aliases: ['crunchy roll', 'crunchyroll']
      }
    ],
    music: [
      { subCategory: 'spotify', slug: 'spotify', aliases: ['spotify'] },
      { subCategory: 'youtube', slug: 'youtube', aliases: ['youtube'] },
      { subCategory: 'deezer', slug: 'deezer', aliases: ['deezer'] },
      { subCategory: 'apple music', slug: 'apple-music', aliases: ['apple music', 'apple'] }
    ],
    ai: [
      { subCategory: 'chatgpt', slug: 'chatgpt', aliases: ['chatgpt'] },
      { subCategory: 'google', slug: 'google', aliases: ['google ai', 'google'] },
      { subCategory: 'perplexity', slug: 'perplexity', aliases: ['perplexity'] },
      { subCategory: 'lovable', slug: 'lovable', aliases: ['loveable', 'lovable'] },
      { subCategory: 'n8n', slug: 'n8n', aliases: ['n8n'] },
      { subCategory: 'boltnew', slug: 'boltnew', aliases: ['bolt.new', 'bolt new', 'bolt'] }
    ],
    productivity: [{ subCategory: 'notion', slug: 'notion', aliases: ['notion'] }],
    design: [
      {
        subCategory: 'adobe creative cloud',
        slug: 'adobe-creative-cloud',
        aliases: ['adobe creative cloud', 'adobe']
      },
      { subCategory: 'canva', slug: 'canva', aliases: ['canva'] },
      { subCategory: 'figma', slug: 'figma', aliases: ['figma'] }
    ],
    education: [{ subCategory: 'duolingo', slug: 'duolingo', aliases: ['duolingo'] }],
    fitness: [
      {
        subCategory: 'myfitnesspal',
        slug: 'myfitnesspal',
        aliases: ['myfitnesspal', 'my fitness pal']
      }
    ]
  };
  const HOME_SECTION_PRODUCT_CAP = 6;

  const normalizeText = (value?: string | null): string =>
    (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const normalizeCategory = (value?: string | null): string => normalizeText(value);

  const matchesByAlias = (product: ProductListing, aliases: string[]): boolean => {
    const normalizedName = normalizeText(product.name);
    const normalizedSlug = normalizeText(product.slug);
    const normalizedServiceType = normalizeText(product.service_type);
    const normalizedSubCategory = normalizeText(product.sub_category);
    const normalizedLogoKey = normalizeText(product.logo_key ?? product.logoKey);

    return aliases.some(alias => {
      const normalizedAlias = normalizeText(alias);
      return (
        normalizedAlias.length > 0 &&
        (normalizedName === normalizedAlias ||
          normalizedSlug === normalizedAlias ||
          normalizedServiceType === normalizedAlias ||
          normalizedSubCategory === normalizedAlias ||
          normalizedLogoKey === normalizedAlias ||
          normalizedName.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedName) ||
          normalizedSlug.includes(normalizedAlias) ||
          normalizedAlias.includes(normalizedSlug))
      );
    });
  };

  const pickCuratedProducts = (
    products: ProductListing[],
    rules: CuratedProductRule[],
    fallbackCategory?: string,
    limit = rules.length
  ): ProductListing[] => {
    const selected: ProductListing[] = [];
    const usedIds = new Set<string>();
    const normalizedFallbackCategory = normalizeCategory(fallbackCategory);

    const getComparablePrice = (product: ProductListing): number =>
      Number.isFinite(product.from_price) ? product.from_price : Number.POSITIVE_INFINITY;

    const matchesRule = (
      product: ProductListing,
      rule: CuratedProductRule
    ): boolean => {
      const subCategoryMatch =
        typeof rule.subCategory === 'string' &&
        normalizeText(product.sub_category) === normalizeText(rule.subCategory);
      if (subCategoryMatch) {
        return true;
      }

      const slugMatch =
        typeof rule.slug === 'string' &&
        normalizeText(product.slug) === normalizeText(rule.slug);
      if (slugMatch) {
        return true;
      }

      if (Array.isArray(rule.aliases) && rule.aliases.length > 0) {
        return matchesByAlias(product, rule.aliases);
      }

      return false;
    };

    for (const rule of rules) {
      const candidate = products.reduce<ProductListing | null>((best, product) => {
        if (
          usedIds.has(product.product_id) ||
          !matchesRule(product, rule) ||
          (normalizedFallbackCategory &&
            normalizeCategory(product.category) !== normalizedFallbackCategory)
        ) {
          return best;
        }
        if (!best) {
          return product;
        }
        return getComparablePrice(product) < getComparablePrice(best)
          ? product
          : best;
      }, null);

      if (candidate) {
        selected.push(candidate);
        usedIds.add(candidate.product_id);
      }
    }

    if (!fallbackCategory) {
      return selected.slice(0, limit);
    }

    const categoryFallback = products.filter(product =>
      normalizeCategory(product.category) === normalizeCategory(fallbackCategory)
      && !usedIds.has(product.product_id)
    );
    return [...selected, ...categoryFallback].slice(0, limit);
  };

  const resolveListingDiscountPercent = (product: ProductListing): number => {
    let best = 0;

    const maxDiscountPercent = Number(product.max_discount_percent);
    if (Number.isFinite(maxDiscountPercent) && maxDiscountPercent > 0) {
      best = Math.max(best, maxDiscountPercent);
    }

    const fromDiscountPercent = Number(product.from_discount_percent);
    if (Number.isFinite(fromDiscountPercent) && fromDiscountPercent > 0) {
      best = Math.max(best, fromDiscountPercent);
    }

    const fromPrice = Number(product.from_price);
    const comparisonPrice = Number(product.comparison_price);
    if (
      Number.isFinite(fromPrice) &&
      fromPrice > 0 &&
      Number.isFinite(comparisonPrice) &&
      comparisonPrice > fromPrice
    ) {
      const comparisonDiscount = Math.round(
        ((comparisonPrice - fromPrice) / comparisonPrice) * 100
      );
      if (comparisonDiscount > 0) {
        best = Math.max(best, comparisonDiscount);
      }
    }

    return best;
  };

  const buildSubCategoryDiscountMap = (
    products: ProductListing[],
    categoryKey: string
  ): Record<string, number> => {
    const discounts: Record<string, number> = {};
    const normalizedCategory = normalizeCategory(categoryKey);

    for (const product of products) {
      if (normalizeCategory(product.category) !== normalizedCategory) {
        continue;
      }
      const subCategoryKey = normalizeText(product.sub_category);
      if (!subCategoryKey) {
        continue;
      }
      const discountPercent = resolveListingDiscountPercent(product);
      if (discountPercent <= 0) {
        continue;
      }
      discounts[subCategoryKey] = Math.max(
        discounts[subCategoryKey] ?? 0,
        discountPercent
      );
    }

    return discounts;
  };

  let allProducts: ProductListing[] = [];
  let streamingProducts: ProductListing[] = [];
  let musicProducts: ProductListing[] = [];
  let aiProducts: ProductListing[] = [];
  let productivityProducts: ProductListing[] = [];
  let designProducts: ProductListing[] = [];
  let educationProducts: ProductListing[] = [];
  let fitnessProducts: ProductListing[] = [];
  let homeShowcaseSections: HomeShowcaseSection[] = [];

  $: allProducts = Array.isArray(data.products) ? (data.products as ProductListing[]) : [];
  $: streamingProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.streaming,
    'streaming',
    HOME_SECTION_PRODUCT_CAP
  );
  $: musicProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.music,
    'music',
    HOME_SECTION_PRODUCT_CAP
  );
  $: aiProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.ai,
    'ai',
    HOME_SECTION_PRODUCT_CAP
  );
  $: productivityProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.productivity,
    'productivity',
    HOME_SECTION_PRODUCT_CAP
  );
  $: designProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.design,
    'design',
    HOME_SECTION_PRODUCT_CAP
  );
  $: educationProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.education,
    'education',
    HOME_SECTION_PRODUCT_CAP
  );
  $: fitnessProducts = pickCuratedProducts(
    allProducts,
    curatedProductsByCategory.fitness,
    'fitness',
    HOME_SECTION_PRODUCT_CAP
  );
  $: homeShowcaseSections = [
    {
      key: 'streaming',
      title: 'Streaming',
      description: 'Binge-ready subscriptions with verified access and flexible terms.',
      listName: 'Streaming',
      emptyState: 'No streaming products yet. Check back soon.',
      products: streamingProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'streaming')
    },
    {
      key: 'music',
      title: 'Music',
      description: 'Hi-fi streaming, curated playlists, and premium listening perks.',
      listName: 'Music',
      emptyState: 'No music products yet. Check back soon.',
      products: musicProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'music')
    },
    {
      key: 'ai',
      title: 'AI',
      description: 'Upgrade your workflows with leading AI tools and copilots.',
      listName: 'AI',
      emptyState: 'No AI products yet. Check back soon.',
      products: aiProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'ai')
    },
    {
      key: 'productivity',
      title: 'Productivity',
      description: 'Core work tools that keep teams fast, focused, and organized.',
      listName: 'Productivity',
      emptyState: 'No productivity products yet. Check back soon.',
      products: productivityProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'productivity')
    },
    {
      key: 'design',
      title: 'Design',
      description: 'Professional design stacks for creatives, teams, and solo builders.',
      listName: 'Design',
      emptyState: 'No design products yet. Check back soon.',
      products: designProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'design')
    },
    {
      key: 'education',
      title: 'Education',
      description: 'Learn faster with premium language and study subscriptions.',
      listName: 'Education',
      emptyState: 'No education products yet. Check back soon.',
      products: educationProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'education')
    },
    {
      key: 'fitness',
      title: 'Fitness',
      description: 'Build consistency with premium training and nutrition tools.',
      listName: 'Fitness',
      emptyState: 'No fitness products yet. Check back soon.',
      products: fitnessProducts,
      subCategoryDiscounts: buildSubCategoryDiscountMap(allProducts, 'fitness')
    }
  ];

  function goToCategory(categoryKey: string) {
    const params = new URLSearchParams();
    params.set('category', categoryKey);
    goto(`/browse?${params.toString()}`);
  }

  let showNewsletterDetails = false;
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
  <HomeNav bind:searchQuery catalogProducts={allProducts} />

  <!-- Hero Section -->
  <Hero />

  <!-- Categories rail -->
  <section class="bg-white py-3">
    <div class="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
      <HomeCategoryRail
        {categories}
        on:select={(event) => goToCategory(event.detail)}
      />
    </div>
  </section>

  <!-- Spacer -->
  <div class="h-6 bg-white"></div>

  {#each homeShowcaseSections as section, sectionIndex (section.key)}
    <section class={`py-12 bg-white ${sectionIndex > 0 ? 'content-visibility-auto' : ''}`}>
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">{section.title}</h2>
            <p class="text-sm text-gray-600 mt-1">{section.description}</p>
          </div>
        </div>

        {#if section.products.length > 0}
          <div class="flex items-stretch gap-2">
            <div class="min-w-0 flex-1">
              <SubscriptionGrid
                products={section.products}
                listName={section.listName}
                linkMode="subcategory"
                subCategoryDiscounts={section.subCategoryDiscounts}
              />
            </div>
            <a
              href={`/browse?category=${encodeURIComponent(section.key)}`}
              class="inline-flex shrink-0 items-center justify-center self-stretch min-h-[15rem] w-12 rounded-2xl bg-white text-4xl font-semibold leading-none text-fuchsia-600 transition-colors hover:text-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
              aria-label={`Browse ${section.title} category`}
              title={`Browse ${section.title}`}
            >
              &gt;
            </a>
          </div>
        {:else}
          <div class="border border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-600">
            {section.emptyState}
          </div>
        {/if}
      </div>
    </section>
  {/each}

  <!-- Explore banner -->
  <section class="py-6 bg-white content-visibility-auto">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="rounded-2xl border border-gray-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-6 sm:p-8 shadow-sm">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Discover more</p>
            <h3 class="text-2xl font-bold text-gray-900 mt-2">Explore all products &amp; categories</h3>
            <p class="text-sm text-gray-600 mt-1">
              Browse streaming, AI, music, productivity, design, education, and fitness in one place.
            </p>
          </div>
          <a
            href="/browse"
            class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black"
          >
            Browse all products
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Trust Signals -->
  <TrustSignals />

  <!-- Newsletter CTA -->
  <div class="h-8 bg-white"></div>
  <section class="py-8 bg-blue-100 content-visibility-auto">
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
              class="inline-flex items-center justify-center h-8 px-3 rounded-md text-sm leading-tight font-semibold text-white bg-gradient-to-r from-purple-700 to-pink-600 shadow-sm hover:shadow-md transition min-h-0 sm:self-center"
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
</div>
