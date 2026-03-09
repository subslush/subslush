<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Search,
    User,
    Menu,
    ChevronDown,
    ChevronRight,
    Headphones,
    ShoppingCart,
    LogIn,
    LogOut,
    UserPlus,
    LayoutDashboard,
    History,
    Settings,
    Play,
    Music,
    Bot,
    Briefcase,
    GraduationCap,
    Dumbbell,
    PenTool
  } from 'lucide-svelte';
  import { auth } from '$lib/stores/auth.js';
  import { cart, cartAddPulse } from '$lib/stores/cart.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import { currency } from '$lib/stores/currency.js';
  import {
    CURRENCY_OPTIONS,
    formatCurrency,
    normalizeCurrencyCode,
    type SupportedCurrency
  } from '$lib/utils/currency.js';
  import { trackSearch } from '$lib/utils/analytics.js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import CartSidebar from '$lib/components/cart/CartSidebar.svelte';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import { resolveLogoKey, resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';
  import type { ProductListing } from '$lib/types/subscription.js';
  import type { Picture } from 'imagetools-core';
  import netflixNYImage from '$lib/assets/netflixny.jpg';
  import spotifyNYImage from '$lib/assets/spotifyny.jpg';
  import chatgptNYImage from '$lib/assets/chatgptny.jpg';

  export let searchQuery = '';
  export let catalogProducts: ProductListing[] = [];

  type MenuLink = {
    label: string;
    href: string;
    slug?: string;
    aliases?: string[];
  };

  type FeaturedCard = {
    title: string;
    description: string;
    cta: string;
    href: string;
  };

  type MegaCategory = {
    key: string;
    label: string;
    href: string;
    icon: typeof Search;
    popular: MenuLink[];
    explore: MenuLink[];
    featured: FeaturedCard;
  };

  type OfferImage =
    | { kind: 'picture'; value: Picture }
    | { kind: 'url'; value: string };

  const normalizeText = (value?: string | null): string =>
    (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const quickLinks: MenuLink[] = [
    { label: 'ChatGPT', href: '/browse/products/chatgpt' },
    { label: 'Google AI', href: '/browse?search=google%20ai' },
    { label: 'Spotify', href: '/browse/products/spotify' },
    { label: 'Adobe Creative Cloud', href: '/browse?search=adobe%20creative%20cloud' },
    { label: 'Netflix', href: '/browse/products/netflix' },
    { label: 'Amazon Prime Video', href: '/browse?search=amazon%20prime%20video' }
  ];

  const megaCategories: MegaCategory[] = [
    {
      key: 'streaming',
      label: 'Streaming',
      href: '/browse?category=streaming',
      icon: Play,
      popular: [
        { label: 'Netflix', href: '/browse/products/netflix', slug: 'netflix', aliases: ['netflix'] },
        { label: 'Amazon Prime Video', href: '/browse/products/amazon-prime-video', slug: 'amazon-prime-video', aliases: ['amazon prime video', 'amazon'] },
        { label: 'YouTube', href: '/browse/products/youtube', slug: 'youtube', aliases: ['youtube'] },
        { label: 'Apple TV', href: '/browse/products/apple-tv', slug: 'apple-tv', aliases: ['apple tv'] },
        { label: 'Crunchyroll', href: '/browse/products/crunchyroll', slug: 'crunchyroll', aliases: ['crunchy roll', 'crunchyroll'] }
      ],
      explore: [
        { label: 'All streaming products', href: '/browse?category=streaming' },
        { label: 'Monthly plans', href: '/browse?search=monthly%20streaming' },
        { label: 'Family plans', href: '/browse?search=family%20plan' },
        { label: '4K plans', href: '/browse?search=4k' }
      ],
      featured: {
        title: 'Streaming Deals',
        description: 'Find high-demand entertainment subscriptions with instant delivery.',
        cta: 'Browse streaming',
        href: '/browse?category=streaming'
      }
    },
    {
      key: 'music',
      label: 'Music',
      href: '/browse?category=music',
      icon: Music,
      popular: [
        { label: 'Spotify', href: '/browse/products/spotify', slug: 'spotify', aliases: ['spotify'] },
        { label: 'YouTube', href: '/browse/products/youtube', slug: 'youtube', aliases: ['youtube'] },
        { label: 'Deezer', href: '/browse/products/deezer', slug: 'deezer', aliases: ['deezer'] },
        { label: 'Apple', href: '/browse/products/apple-music', slug: 'apple-music', aliases: ['apple', 'apple music'] }
      ],
      explore: [
        { label: 'All music subscriptions', href: '/browse?category=music' },
        { label: 'Hi-Fi audio plans', href: '/browse?search=hi-fi' },
        { label: 'Student offers', href: '/browse?search=student%20music' },
        { label: 'Offline listening', href: '/browse?search=offline%20music' }
      ],
      featured: {
        title: 'Music Picks',
        description: 'Ad-free listening plans and curated subscriptions at lower prices.',
        cta: 'Browse music',
        href: '/browse?category=music'
      }
    },
    {
      key: 'ai',
      label: 'AI',
      href: '/browse?category=ai',
      icon: Bot,
      popular: [
        { label: 'ChatGPT', href: '/browse/products/chatgpt', slug: 'chatgpt', aliases: ['chatgpt'] },
        { label: 'Google AI', href: '/browse/products/google', slug: 'google', aliases: ['google ai', 'google'] },
        { label: 'Perplexity', href: '/browse/products/perplexity', slug: 'perplexity', aliases: ['perplexity'] },
        { label: 'Loveable', href: '/browse/products/lovable', slug: 'lovable', aliases: ['loveable', 'lovable'] },
        { label: 'n8n', href: '/browse/products/n8n', slug: 'n8n', aliases: ['n8n'] },
        { label: 'Bolt.new', href: '/browse/products/boltnew', slug: 'boltnew', aliases: ['bolt.new', 'bolt new', 'bolt'] }
      ],
      explore: [
        { label: 'All AI tools', href: '/browse?category=ai' },
        { label: 'Writing assistants', href: '/browse?search=writing%20ai' },
        { label: 'Image generation', href: '/browse?search=image%20generation' },
        { label: 'Developer copilots', href: '/browse?search=copilot' }
      ],
      featured: {
        title: 'AI Essentials',
        description: 'Priority-access AI plans for work, study, and content creation.',
        cta: 'Browse AI',
        href: '/browse?category=ai'
      }
    },
    {
      key: 'productivity',
      label: 'Productivity',
      href: '/browse?category=productivity',
      icon: Briefcase,
      popular: [
        { label: 'Notion', href: '/browse/products/notion', slug: 'notion', aliases: ['notion'] }
      ],
      explore: [
        { label: 'All productivity tools', href: '/browse?category=productivity' },
        { label: 'Team workspaces', href: '/browse?search=team%20workspace' },
        { label: 'Document tools', href: '/browse?search=document%20tools' },
        { label: 'Task management', href: '/browse?search=task%20management' }
      ],
      featured: {
        title: 'Productivity Stack',
        description: 'Get daily workflow tools with verified access and flexible pricing.',
        cta: 'Browse productivity',
        href: '/browse?category=productivity'
      }
    },
    {
      key: 'design',
      label: 'Design',
      href: '/browse?category=design',
      icon: PenTool,
      popular: [
        { label: 'Adobe Creative Cloud', href: '/browse/products/adobe-creative-cloud', slug: 'adobe-creative-cloud', aliases: ['adobe creative cloud', 'adobe'] },
        { label: 'Canva', href: '/browse/products/canva', slug: 'canva', aliases: ['canva'] },
        { label: 'Figma', href: '/browse/products/figma', slug: 'figma', aliases: ['figma'] }
      ],
      explore: [
        { label: 'All design subscriptions', href: '/browse?category=design' },
        { label: 'UI/UX tools', href: '/browse?search=ui%20ux' },
        { label: 'Video editing', href: '/browse?search=video%20editing' },
        { label: 'Asset libraries', href: '/browse?search=asset%20library' }
      ],
      featured: {
        title: 'Design Toolkit',
        description: 'Creative software and design resources with instant account access.',
        cta: 'Browse design',
        href: '/browse?category=design'
      }
    },
    {
      key: 'education',
      label: 'Education',
      href: '/browse?category=education',
      icon: GraduationCap,
      popular: [
        { label: 'Duolingo', href: '/browse/products/duolingo', slug: 'duolingo', aliases: ['duolingo'] }
      ],
      explore: [
        { label: 'All education plans', href: '/browse?category=education' },
        { label: 'Tech courses', href: '/browse?search=tech%20courses' },
        { label: 'Language learning', href: '/browse?search=language%20learning' },
        { label: 'Business learning', href: '/browse?search=business%20learning' }
      ],
      featured: {
        title: 'Learning Plans',
        description: 'Grow skills faster with premium learning subscriptions.',
        cta: 'Browse education',
        href: '/browse?category=education'
      }
    },
    {
      key: 'fitness',
      label: 'Fitness',
      href: '/browse?category=fitness',
      icon: Dumbbell,
      popular: [
        { label: 'MyFitnessPal', href: '/browse/products/myfitnesspal', slug: 'myfitnesspal', aliases: ['myfitnesspal', 'my fitness pal'] }
      ],
      explore: [
        { label: 'All fitness tools', href: '/browse?category=fitness' },
        { label: 'Workout apps', href: '/browse?search=workout%20app' },
        { label: 'Nutrition apps', href: '/browse?search=nutrition' },
        { label: 'Coaching plans', href: '/browse?search=coaching' }
      ],
      featured: {
        title: 'Fitness Memberships',
        description: 'Training, nutrition, and wellness services in one marketplace.',
        cta: 'Browse fitness',
        href: '/browse?category=fitness'
      }
    }
  ];

  const megaMenuCategoryKeys = [
    'streaming',
    'music',
    'ai',
    'productivity',
    'design',
    'education',
    'fitness'
  ];
  const megaMenuCategories = megaCategories.filter(category =>
    megaMenuCategoryKeys.includes(category.key)
  );

  const categoryOfferImages: Record<string, string> = {
    streaming: netflixNYImage,
    music: spotifyNYImage,
    ai: chatgptNYImage,
    productivity: chatgptNYImage,
    design: spotifyNYImage,
    education: netflixNYImage,
    fitness: chatgptNYImage
  };

  const productLogoAliases: Record<string, string> = {
    'adobe-creative-cloud': 'adobecc-logo',
    'amazon-prime-video': 'amazonprimevideo-logo',
    'apple-music': 'applemusic-logo',
    'apple-tv': 'appletv-logo',
    'boltnew': 'bolt-logo',
    'chatgpt': 'chatgpt-logo',
    'crunchyroll': 'crunchyroll-logo',
    'deezer': 'deezer-logo',
    'duolingo': 'duolingo-logo',
    'figma': 'figma-logo',
    'google': 'googleai-logo',
    'lovable': 'lovable-logo',
    'myfitnesspal': 'myfitnesspal-logo',
    'n8n': 'n8n-logo',
    'notion': 'notion-logo',
    'perplexity': 'perplexity-logo',
    'youtube': 'youtube-logo'
  };

  const resolveProductLogo = (product: ProductListing | null): Picture | null => {
    if (!product) return null;
    const normalizedSlug = (product.slug || '').trim().toLowerCase();
    const aliasedLogoKey =
      normalizedSlug in productLogoAliases
        ? productLogoAliases[normalizedSlug]
        : null;
    const logoFromKey =
      resolveLogoKey(product.logoKey || product.logo_key || product.slug)
      || resolveLogoKey(aliasedLogoKey)
      || resolveLogoKeyFromName(product.name);
    return logoFromKey || null;
  };

  const resolveCategoryFallbackImage = (categoryKey?: string): OfferImage => ({
    kind: 'url',
    value: categoryOfferImages[categoryKey || ''] || chatgptNYImage
  });

  const resolveCatalogProductForLink = (
    link: MenuLink | undefined,
    categoryKey?: string
  ): ProductListing | null => {
    if (!link || effectiveCatalogProducts.length === 0) {
      return null;
    }

    const bySlug =
      typeof link.slug === 'string'
        ? effectiveCatalogProducts.find(
          product => normalizeText(product.slug) === normalizeText(link.slug)
        )
        : null;
    if (bySlug) return bySlug;

    const aliases = [link.label, ...(link.aliases || [])]
      .map(value => normalizeText(value))
      .filter(value => value.length > 0);
    if (aliases.length > 0) {
      const aliasMatch = effectiveCatalogProducts.find(product => {
        const normalizedName = normalizeText(product.name);
        const normalizedSlug = normalizeText(product.slug);
        return aliases.some(alias =>
          normalizedName === alias
          || normalizedSlug === alias
          || normalizedName.includes(alias)
          || alias.includes(normalizedName)
        );
      });
      if (aliasMatch) return aliasMatch;
    }

    if (!categoryKey) return null;

    return (
      effectiveCatalogProducts.find(
        product => normalizeText(product.category) === normalizeText(categoryKey)
      ) || null
    );
  };

  const resolveOfferImage = (
    product: ProductListing | null,
    categoryKey?: string
  ): OfferImage => {
    const logo = resolveProductLogo(product);
    if (logo) {
      return { kind: 'picture', value: logo };
    }
    return resolveCategoryFallbackImage(categoryKey);
  };

  const resolveOfferHref = (
    product: ProductListing | null,
    fallbackHref?: string
  ): string => {
    if (product?.slug) {
      return `/browse/products/${encodeURIComponent(product.slug)}`;
    }
    return fallbackHref || '/browse';
  };

  const resolveOfferPriceLabel = (product: ProductListing | null): string | null => {
    if (!product || !Number.isFinite(product.from_price)) {
      return null;
    }
    const displayCurrency =
      normalizeCurrencyCode(product.currency) || ($currency as SupportedCurrency);
    return formatCurrency(product.from_price, displayCurrency);
  };

  const shouldLoadFallbackCatalog = (): boolean => catalogProducts.length === 0;

  const loadFallbackCatalogProducts = async (force = false): Promise<void> => {
    if (!shouldLoadFallbackCatalog()) {
      fallbackCatalogProducts = [];
      fallbackCatalogLoaded = false;
      fallbackCatalogLoading = false;
      lastFallbackCurrency = null;
      return;
    }

    const activeCurrency = $currency as SupportedCurrency;
    if (
      !force &&
      fallbackCatalogLoaded &&
      lastFallbackCurrency === activeCurrency &&
      fallbackCatalogProducts.length > 0
    ) {
      return;
    }
    if (fallbackCatalogLoading) {
      return;
    }

    fallbackCatalogLoading = true;
    try {
      const response = await subscriptionService.getAvailableProducts();
      fallbackCatalogProducts = Array.isArray(response?.products)
        ? response.products
        : [];
      fallbackCatalogLoaded = true;
      lastFallbackCurrency = activeCurrency;
    } catch (error) {
      console.error('Failed to load fallback catalog products for mega menu', error);
      fallbackCatalogProducts = [];
      fallbackCatalogLoaded = true;
      lastFallbackCurrency = activeCurrency;
    } finally {
      fallbackCatalogLoading = false;
    }
  };

  const defaultPopularIndexByCategory = Object.fromEntries(
    megaCategories.map(category => [category.key, 0])
  ) as Record<string, number>;

  let megaMenuOpen = false;
  let megaMenuPinned = false;
  let activeMegaCategoryKey = megaMenuCategories[0]?.key ?? 'streaming';
  let activePopularIndexByCategory = defaultPopularIndexByCategory;
  let megaMenuRef: HTMLDivElement | null = null;
  let megaMenuTriggerRef: HTMLButtonElement | null = null;
  let megaMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let currencyMenuOpen = false;
  let pendingCurrency: SupportedCurrency = 'USD';
  let currencyMenuRef: HTMLDivElement | null = null;
  let currencyMenuTriggerRef: HTMLButtonElement | null = null;
  let userMenuOpen = false;
  let userMenuRef: HTMLDivElement | null = null;
  let userMenuTriggerRef: HTMLButtonElement | null = null;
  let cartAnimating = false;
  let lastCartPulseSeen = 0;
  let cartAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let cartQueryOpenKey = '';
  let fallbackCatalogProducts: ProductListing[] = [];
  let fallbackCatalogLoading = false;
  let fallbackCatalogLoaded = false;
  let lastFallbackCurrency: SupportedCurrency | null = null;
  let hasExternalCatalogProducts = false;
  let effectiveCatalogProducts: ProductListing[] = [];
  let activeOfferImage: OfferImage = resolveCategoryFallbackImage('streaming');
  let activeOfferProduct: ProductListing | null = null;
  let activeOfferHref = '/browse?category=streaming';
  let activeOfferTitle = 'Streaming Deals';
  let activeOfferPriceLabel: string | null = null;
  $: isLoggedIn = $auth.isAuthenticated;
  $: userEmail = $auth.user?.email;
  $: activeMegaCategory =
    megaCategories.find(category => category.key === activeMegaCategoryKey) || megaCategories[0];
  $: if (!currencyMenuOpen) {
    pendingCurrency = $currency as SupportedCurrency;
  }
  $: activePopularIndex = Math.min(
    Math.max(activePopularIndexByCategory[activeMegaCategoryKey] ?? 0, 0),
    Math.max((activeMegaCategory?.popular.length ?? 1) - 1, 0)
  );
  $: activePopularLink =
    activeMegaCategory?.popular[activePopularIndex] ?? activeMegaCategory?.popular[0];
  $: activeOfferProduct = resolveCatalogProductForLink(
    activePopularLink,
    activeMegaCategory?.key
  );
  $: activeOfferImage = resolveOfferImage(activeOfferProduct, activeMegaCategory?.key);
  $: activeOfferHref = resolveOfferHref(
    activeOfferProduct,
    activePopularLink?.href || activeMegaCategory?.featured.href
  );
  $: activeOfferTitle =
    activeOfferProduct?.name
    || activePopularLink?.label
    || activeMegaCategory?.featured.title
    || 'Featured product';
  $: activeOfferPriceLabel = resolveOfferPriceLabel(activeOfferProduct);
  $: hasExternalCatalogProducts = catalogProducts.length > 0;
  $: effectiveCatalogProducts = hasExternalCatalogProducts
    ? catalogProducts
    : fallbackCatalogProducts;
  $: if (
    megaMenuOpen &&
    shouldLoadFallbackCatalog() &&
    lastFallbackCurrency !== ($currency as SupportedCurrency)
  ) {
    void loadFallbackCatalogProducts(true);
  }

  const closeMenuOnOutsideClick = (event: MouseEvent) => {
    const target = event.target as Node;
    const clickedMegaMenu = megaMenuRef?.contains(target) || megaMenuTriggerRef?.contains(target);
    const clickedCurrencyMenu =
      currencyMenuRef?.contains(target) || currencyMenuTriggerRef?.contains(target);
    const clickedUserMenu = userMenuRef?.contains(target) || userMenuTriggerRef?.contains(target);

    if (!clickedMegaMenu) {
      closeMegaMenuImmediately();
    }

    if (!clickedCurrencyMenu) {
      currencyMenuOpen = false;
    }

    if (!clickedUserMenu) {
      userMenuOpen = false;
    }
  };

  const openMegaMenu = (pinnedOrEvent: boolean | Event = false) => {
    if (megaMenuCloseTimer) {
      clearTimeout(megaMenuCloseTimer);
      megaMenuCloseTimer = null;
    }
    megaMenuOpen = true;
    if (shouldLoadFallbackCatalog()) {
      void loadFallbackCatalogProducts();
    }
    if (pinnedOrEvent === true) {
      megaMenuPinned = true;
    }
  };

  const scheduleMegaMenuClose = () => {
    if (megaMenuPinned) {
      return;
    }
    if (megaMenuCloseTimer) {
      clearTimeout(megaMenuCloseTimer);
    }
    megaMenuCloseTimer = setTimeout(() => {
      megaMenuOpen = false;
      megaMenuCloseTimer = null;
    }, 220);
  };

  const closeMegaMenuImmediately = () => {
    if (megaMenuCloseTimer) {
      clearTimeout(megaMenuCloseTimer);
      megaMenuCloseTimer = null;
    }
    megaMenuOpen = false;
    megaMenuPinned = false;
  };

  const toggleMegaMenu = () => {
    if (!megaMenuOpen) {
      openMegaMenu(true);
      return;
    }

    if (megaMenuPinned) {
      closeMegaMenuImmediately();
      return;
    }
    megaMenuPinned = true;
  };

  const setActiveMegaCategory = (key: string) => {
    activeMegaCategoryKey = key;
  };

  const setActivePopularItem = (index: number) => {
    activePopularIndexByCategory = {
      ...activePopularIndexByCategory,
      [activeMegaCategoryKey]: index
    };
  };

  const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const handleQuickMegaAddToCart = () => {
    if (!activeMegaCategory || !activeOfferProduct) return;
    const selectedLabel = activeOfferProduct.name;
    const selectedHref = activeOfferHref;
    const selectedCurrency =
      normalizeCurrencyCode(activeOfferProduct.currency) || ($currency as SupportedCurrency);

    cart.addItem({
      id: `mega-offer-${activeMegaCategory.key}-${slugify(selectedLabel)}`,
      serviceType: activeMegaCategory.key,
      serviceName: selectedLabel,
      plan: 'Monthly',
      price: activeOfferProduct.from_price,
      currency: selectedCurrency,
      quantity: 1,
      description: `Quick add from ${activeMegaCategory.label} mega menu`,
      features: [`Source: ${selectedHref}`]
    });
    cartSidebar.open();
  };

  const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    closeMegaMenuImmediately();
    currencyMenuOpen = false;
    userMenuOpen = false;
  };

  onMount(() => {
    if (shouldLoadFallbackCatalog()) {
      void loadFallbackCatalogProducts();
    }

    document.addEventListener('click', closeMenuOnOutsideClick);
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('click', closeMenuOnOutsideClick);
      document.removeEventListener('keydown', handleGlobalKeydown);
      document.body.classList.remove('mega-menu-open');
      if (megaMenuCloseTimer) {
        clearTimeout(megaMenuCloseTimer);
        megaMenuCloseTimer = null;
      }
      if (cartAnimationTimer) {
        clearTimeout(cartAnimationTimer);
        cartAnimationTimer = null;
      }
    };
  });

  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
  }

  async function handleLogout() {
    await auth.logout();
    userMenuOpen = false;
  }

  const toggleCurrencyMenu = () => {
    currencyMenuOpen = !currencyMenuOpen;
  };

  const handlePendingCurrencyChange = (event: Event) => {
    const target = event.currentTarget as HTMLSelectElement | null;
    const nextCurrency = target?.value as SupportedCurrency | undefined;
    if (!nextCurrency) return;
    pendingCurrency = nextCurrency;
  };

  async function applyCurrencySelection() {
    currency.set(pendingCurrency);
    const currentUrl = `${$page.url.pathname}${$page.url.search ? `?${$page.url.searchParams.toString()}` : ''}`;
    await goto(currentUrl, { replaceState: true });
    await invalidateAll();
    currencyMenuOpen = false;
  }

  function performSearch() {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      const externalId = getOrCreateGuestId();
      const eventId = buildSearchEventId(trimmedQuery);
      trackSearch(trimmedQuery, [], eventId);
      void subscriptionService.trackTikTokEvent({
        event: 'search',
        searchString: trimmedQuery,
        externalId,
        eventId
      });
    }
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set('search', trimmedQuery);
    }

    const query = params.toString();
    const destination = query ? `/browse?${query}` : '/browse';
    goto(destination);
  }

  const getOrCreateGuestId = (): string => {
    if (typeof window === 'undefined') return 'guest';
    try {
      const key = 'tiktok_guest_id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return 'guest';
    }
  };

  const buildSearchEventId = (query: string): string => {
    const ownerId = getOrCreateGuestId();
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '_');
    return `search_${ownerId}_${normalizedQuery}_${Date.now()}`;
  };

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    performSearch();
  }

  $: if ($cartAddPulse > 0 && $cartAddPulse !== lastCartPulseSeen) {
    lastCartPulseSeen = $cartAddPulse;
    cartAnimating = false;
    if (cartAnimationTimer) {
      clearTimeout(cartAnimationTimer);
      cartAnimationTimer = null;
    }

    void requestAnimationFrame(() => {
      cartAnimating = true;
      cartAnimationTimer = setTimeout(() => {
        cartAnimating = false;
        cartAnimationTimer = null;
      }, 700);
    });
  }

  $: {
    const cartQuery = $page.url.searchParams.get('cart');
    if (cartQuery !== 'open') {
      cartQueryOpenKey = '';
    } else {
      const queryKey = `${$page.url.pathname}${$page.url.search}`;
      if (queryKey !== cartQueryOpenKey) {
        cartQueryOpenKey = queryKey;
        cartSidebar.open();
      }
    }
  }

  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('mega-menu-open', megaMenuOpen);
  }
</script>

<nav class="relative border-b border-slate-200 bg-white text-slate-900">
  <svg aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden">
    <defs>
      <linearGradient id="subslush-search-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7e22ce"></stop>
        <stop offset="100%" stop-color="#db2777"></stop>
      </linearGradient>
    </defs>
  </svg>

  <div class="relative z-50 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 gap-3 py-4 lg:grid-cols-[auto,minmax(0,500px),auto] lg:items-center lg:gap-4">
      <a
        href="/"
        class="flex w-fit items-center rounded-lg px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
      >
        <span class="text-2xl font-extrabold bg-gradient-to-r from-purple-700 to-pink-600 bg-clip-text text-transparent">
          SubSlush
        </span>
      </a>

      <div class="w-full">
        <label class="sr-only" for="nav-search">Search</label>
        <div class="relative w-full">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            size={18}
            stroke="url(#subslush-search-gradient)"
            aria-hidden="true"
          />
          <input
            id="nav-search"
            type="search"
            placeholder="Search"
            class="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
            bind:value={searchQuery}
            on:keydown={handleSearchKeydown}
          />
          <button
            type="button"
            class="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
            aria-label="Search"
            on:click={performSearch}
          >
            <Search size={16} stroke="url(#subslush-search-gradient)" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 text-slate-900">
        <div class="relative currency-menu-anchor">
          <button
            type="button"
            class={`currency-trigger ${currencyMenuOpen ? 'is-open' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={currencyMenuOpen}
            on:click|stopPropagation={toggleCurrencyMenu}
            bind:this={currencyMenuTriggerRef}
          >
            <span class="currency-trigger-value">EN</span>
            <span class="currency-trigger-divider" aria-hidden="true"></span>
            <span class="currency-trigger-value">{$currency}</span>
            <ChevronDown size={14} class={`currency-trigger-chevron ${currencyMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {#if currencyMenuOpen}
            <div class="currency-menu-dropdown" bind:this={currencyMenuRef}>
              <div class="currency-menu-panel" role="dialog" aria-label="Language and currency">
                <p class="currency-menu-label">Languages</p>
                <button type="button" class="currency-menu-field" aria-label="Selected language" aria-disabled="true">
                  <span class="currency-menu-flag">EN</span>
                  <span class="currency-menu-field-value">English</span>
                  <ChevronDown size={16} class="currency-menu-caret" aria-hidden="true" />
                </button>

                <p class="currency-menu-label currency-menu-label-gap">Currencies</p>
                <div class="currency-menu-field currency-menu-select-wrap">
                  <span class="currency-menu-currency-prefix">€</span>
                  <select
                    class="currency-menu-select"
                    aria-label="Select currency"
                    bind:value={pendingCurrency}
                    on:change={handlePendingCurrencyChange}
                  >
                    {#each CURRENCY_OPTIONS as option}
                      <option value={option.value}>{option.value}</option>
                    {/each}
                  </select>
                  <ChevronDown size={16} class="currency-menu-caret" aria-hidden="true" />
                </div>

                <button
                  type="button"
                  class="currency-menu-accept"
                  on:click={applyCurrencySelection}
                >
                  ACCEPT
                </button>
              </div>
            </div>
          {/if}
        </div>
        <div class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40 md:px-3 md:text-sm"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            on:click={toggleUserMenu}
            bind:this={userMenuTriggerRef}
          >
            <User size={18} class="text-slate-800" aria-hidden="true" />
            {#if !isLoggedIn}
              <span class="hidden md:inline">Login/Register</span>
            {/if}
            <ChevronDown size={16} class={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {#if userMenuOpen}
            <div
              class="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white text-gray-900 shadow-2xl"
              role="menu"
              bind:this={userMenuRef}
            >
              {#if isLoggedIn}
                <div class="border-b border-gray-100 px-4 py-3">
                  <p class="text-sm font-semibold text-gray-900">{userEmail}</p>
                </div>
                <div class="space-y-2 px-3 py-3">
                  <a
                    href="/dashboard"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <LayoutDashboard size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Dashboard</span>
                  </a>
                  <a
                    href="/dashboard/orders"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <History size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Order History</span>
                  </a>
                  <a
                    href="/dashboard/settings"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <Settings size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Settings</span>
                  </a>
                  <button
                    class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    type="button"
                    on:click={handleLogout}
                    role="menuitem"
                  >
                    <LogOut size={16} class="text-red-600" aria-hidden="true" />
                    <span>Logout</span>
                  </button>
                </div>
              {:else}
                <div class="border-b border-gray-100 px-4 py-3">
                  <p class="text-sm font-semibold text-gray-900">Welcome!</p>
                </div>
                <div class="space-y-2 px-4 py-3">
                  <a
                    href="/auth/login"
                    class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <LogIn size={16} aria-hidden="true" />
                    <span>Sign in</span>
                  </a>
                  <p class="text-xs text-gray-500">Don't have an account?</p>
                  <a
                    href="/auth/register"
                    class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    <span>Register</span>
                  </a>
                </div>
              {/if}
            </div>
          {/if}
        </div>
        <a
          href="/help"
          class="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40 md:px-3 md:text-sm"
          aria-label="Help"
        >
          <Headphones size={18} class="text-slate-800" aria-hidden="true" />
          <span class="hidden md:inline">Help</span>
        </a>
        <button
          type="button"
          class={`relative inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-900 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40 md:px-3 md:text-sm ${cartAnimating ? 'cart-bounce' : ''}`}
          aria-label={$cart.length > 0 ? `Cart with ${$cart.length} item(s)` : 'Cart'}
          on:click={() => cartSidebar.open()}
        >
          <ShoppingCart size={18} class="text-slate-800" aria-hidden="true" />
          <span class="hidden md:inline">Cart</span>
          {#if $cart.length > 0}
            <span class={`absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-purple-700 px-1 text-[10px] font-semibold text-white ${cartAnimating ? 'cart-badge-flash' : ''}`}>
              {$cart.length > 99 ? '99+' : $cart.length}
            </span>
          {/if}
        </button>
      </div>
    </div>
  </div>

  <div class="relative border-t border-slate-200 bg-[#f2f2f2] text-slate-900 shadow-[0_7px_18px_rgba(15,23,42,0.12)]">
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center gap-3 py-2">
        <div
          class="relative w-[10.75rem] shrink-0 mega-menu-anchor"
          role="presentation"
          on:mouseenter={openMegaMenu}
          on:mouseleave={scheduleMegaMenuClose}
        >
          {#if megaMenuOpen && activeMegaCategory}
            <div
              class="mega-shell absolute left-0 top-0 z-[84] w-[min(860px,calc(100vw-2rem))]"
              role="presentation"
              bind:this={megaMenuRef}
              on:mouseenter={openMegaMenu}
              on:mouseleave={scheduleMegaMenuClose}
            >
              <button
                type="button"
                class="mega-shell-trigger flex w-fit items-center gap-2 border px-4 py-2 text-[0.98rem] font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
                aria-haspopup="menu"
                aria-expanded={megaMenuOpen}
                on:click={toggleMegaMenu}
                bind:this={megaMenuTriggerRef}
              >
                <Menu size={18} aria-hidden="true" />
                <span>Categories</span>
              </button>

              <div class="mega-panel">
                <div class="mega-grid">
                  <div class="mega-left">
                    {#each megaMenuCategories as category}
                      <a
                        href={category.href}
                        class={`mega-category-item ${activeMegaCategoryKey === category.key ? 'is-active' : ''}`}
                        on:mouseenter={() => setActiveMegaCategory(category.key)}
                        on:focus={() => setActiveMegaCategory(category.key)}
                        on:click={closeMegaMenuImmediately}
                      >
                        <svelte:component this={category.icon} size={20} aria-hidden="true" />
                        <span>{category.label}</span>
                        <ChevronRight size={18} class="ml-auto text-slate-500" aria-hidden="true" />
                      </a>
                    {/each}
                    <a
                      href="/browse"
                      class="mega-all-products-link"
                      on:click={closeMegaMenuImmediately}
                    >
                      All products
                    </a>
                  </div>

                  <div class="mega-middle">
                    <div class="mega-middle-head">
                      <p class="mega-middle-title">{activeMegaCategory.label}</p>
                      <a
                        href={activeMegaCategory.href}
                        class="mega-show-all"
                        on:click={closeMegaMenuImmediately}
                      >
                        Show all
                      </a>
                    </div>
                    <div class="mega-middle-list">
                      {#each activeMegaCategory.popular.slice(0, 6) as link, linkIndex}
                        <a
                          href={link.href}
                          class={`mega-sub-link ${activePopularIndex === linkIndex ? 'is-highlighted' : ''}`}
                          on:mouseenter={() => setActivePopularItem(linkIndex)}
                          on:focus={() => setActivePopularItem(linkIndex)}
                          on:click={closeMegaMenuImmediately}
                        >
                          {link.label}
                        </a>
                      {/each}
                    </div>
                  </div>

                  <div class="mega-right">
                    <p class="mega-right-head">Seal the deal!</p>
                    <a href={activeOfferHref} class="mega-offer-image-wrap" on:click={closeMegaMenuImmediately}>
                      {#if activeOfferImage.kind === 'picture'}
                        <ResponsiveImage
                          image={activeOfferImage.value}
                          alt={activeOfferTitle}
                          sizes="(min-width: 1024px) 280px, 92vw"
                          pictureClass="block"
                          imgClass="mega-offer-image"
                          loading="lazy"
                          decoding="async"
                        />
                      {:else}
                        <img
                          src={activeOfferImage.value}
                          alt={activeOfferTitle}
                          class="mega-offer-image"
                          loading="lazy"
                        />
                      {/if}
                    </a>
                    <p class="mega-offer-title">
                      {activeOfferTitle}
                    </p>
                    <div class="mega-offer-price-row">
                      <div class="mega-offer-price">
                        {#if activeOfferPriceLabel}
                          {activeOfferPriceLabel} /month
                        {:else}
                          View details
                        {/if}
                      </div>
                      <button
                        type="button"
                        class={`mega-offer-quick-cart ${activeOfferProduct ? '' : 'is-disabled'}`}
                        aria-label={`Quick add ${activeOfferTitle} to cart`}
                        on:click|stopPropagation={handleQuickMegaAddToCart}
                        title="Quick add to cart"
                        disabled={!activeOfferProduct}
                      >
                        <ShoppingCart size={17} aria-hidden="true" />
                        <span class="mega-offer-quick-plus">+</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="mega-trigger-closed inline-flex w-full items-center gap-2 border px-4 py-2 text-[0.98rem] font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
              aria-haspopup="menu"
              aria-expanded={megaMenuOpen}
              on:focus={openMegaMenu}
              on:click={toggleMegaMenu}
              bind:this={megaMenuTriggerRef}
            >
              <Menu size={18} aria-hidden="true" />
              <span>Categories</span>
            </button>
          {/if}
        </div>

        <div class="min-w-0 flex-1 overflow-x-auto nav-quick-scroll">
          <div class="flex items-center gap-3 pl-1">
            {#each quickLinks as link}
              <a
                href={link.href}
                class="shrink-0 rounded-xl px-4 py-2 text-[0.98rem] font-semibold leading-none text-slate-800 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700/40"
              >
                {link.label}
              </a>
            {/each}
          </div>
        </div>
      </div>
    </div>

    {#if megaMenuOpen}
      <button
        type="button"
        class="fixed inset-0 z-[70] bg-slate-900/40"
        aria-label="Close categories menu"
        on:click={closeMegaMenuImmediately}
      ></button>
    {/if}
  </div>
</nav>
<CartSidebar />

<style>
  @keyframes cart-bounce {
    0% {
      transform: scale(1);
    }
    20% {
      transform: scale(1.15);
    }
    45% {
      transform: scale(0.96);
    }
    70% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes cart-badge-flash {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(126, 34, 206, 0.45);
    }
    40% {
      transform: scale(1.16);
      box-shadow: 0 0 0 8px rgba(126, 34, 206, 0);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(126, 34, 206, 0);
    }
  }

  .cart-bounce {
    animation: cart-bounce 0.7s ease;
  }

  .cart-badge-flash {
    animation: cart-badge-flash 0.7s ease;
  }

  .nav-quick-scroll {
    scrollbar-width: none;
  }

  .nav-quick-scroll::-webkit-scrollbar {
    display: none;
  }

  .currency-menu-anchor {
    min-width: 118px;
    height: 2.5rem;
  }

  .currency-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.46rem;
    min-height: 2.12rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.88rem;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1;
    padding: 0.46rem 0.7rem;
    transition: border-color 140ms ease, background 140ms ease;
  }

  .currency-trigger:hover {
    border: 1px solid transparent;
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(90deg, #7e22ce 0%, #db2777 100%) border-box;
  }

  .currency-trigger:focus-visible {
    border: 1px solid transparent;
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(90deg, #7e22ce 0%, #db2777 100%) border-box;
    outline: none;
  }

  .currency-trigger.is-open {
    border-color: #cbd5e1;
    background: #ffffff;
  }

  .currency-trigger-value {
    white-space: nowrap;
  }

  .currency-trigger-divider {
    width: 1px;
    height: 0.85rem;
    background: #d1d5db;
  }

  .currency-trigger-chevron {
    margin-left: 0.22rem;
    color: #64748b;
  }

  .currency-menu-dropdown {
    position: absolute;
    left: 0;
    top: calc(100% + 0.38rem);
    width: 208px;
    z-index: 82;
  }

  .currency-menu-panel {
    border: 1px solid #cbd5e1;
    border-radius: 0.98rem;
    background: #ffffff;
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.16);
    padding: 0.88rem 0.86rem 0.86rem;
  }

  .currency-menu-label {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #4b5563;
  }

  .currency-menu-label-gap {
    margin-top: 0.7rem;
  }

  .currency-menu-field {
    width: 100%;
    height: 2.02rem;
    margin-top: 0.45rem;
    border: 1px solid #d1d5db;
    border-radius: 9999px;
    background: #f8fafc;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 0.52rem;
    padding: 0 0.78rem;
    font-size: 0.94rem;
    font-weight: 700;
  }

  .currency-menu-flag {
    width: 1.38rem;
    height: 1rem;
    border-radius: 0.2rem;
    border: 1px solid #d1d5db;
    background:
      linear-gradient(0deg, transparent 42%, #ef4444 42%, #ef4444 58%, transparent 58%),
      linear-gradient(90deg, transparent 42%, #1d4ed8 42%, #1d4ed8 58%, transparent 58%),
      #ffffff;
    color: transparent;
    flex: 0 0 auto;
  }

  .currency-menu-field-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
  }

  .currency-menu-select-wrap {
    position: relative;
    padding-right: 2rem;
  }

  .currency-menu-currency-prefix {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.12rem;
    height: 1.12rem;
    border-radius: 9999px;
    background: #e5e7eb;
    color: #111827;
    font-size: 0.75rem;
    font-weight: 700;
    flex: 0 0 auto;
  }

  .currency-menu-select {
    appearance: none;
    border: 0;
    background: transparent;
    color: #111827;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
    width: 100%;
    padding-right: 0;
    cursor: pointer;
  }

  .currency-menu-select:focus {
    outline: none;
  }

  .currency-menu-caret {
    margin-left: auto;
    color: #4b5563;
    flex: 0 0 auto;
  }

  .currency-menu-select-wrap .currency-menu-caret {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
  }

  .currency-menu-accept {
    width: 100%;
    margin-top: 0.88rem;
    border: 0;
    border-radius: 9999px;
    background: linear-gradient(90deg, #7e22ce 0%, #db2777 100%);
    color: #ffffff;
    font-size: 0.88rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    height: 2.1rem;
    cursor: pointer;
  }

  .mega-menu-anchor {
    overflow: visible;
    min-height: 2.7rem;
  }

  .mega-trigger-closed {
    border-color: transparent;
    border-radius: 0.78rem;
    background: #f3f4f6;
    transition: border-color 140ms ease, background-color 140ms ease;
  }

  .mega-trigger-closed:hover {
    border-color: #cbd5e1;
    background: #e6e8ee;
  }

  .mega-shell {
    overflow: visible;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .mega-shell-trigger {
    position: relative;
    display: flex;
    z-index: 2;
    margin-left: 0;
    margin-bottom: -1px;
    border-color: #d6dde8;
    border-bottom-color: #ffffff;
    border-top-left-radius: 0.92rem;
    border-top-right-radius: 0.92rem;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    background: #ffffff;
    box-shadow: none;
  }

  .mega-panel {
    position: relative;
    margin-top: -1px;
    width: 100%;
    overflow: hidden;
    border: 1px solid #d6dde8;
    border-top-left-radius: 0;
    border-top-right-radius: 0.9rem;
    border-bottom-right-radius: 0.9rem;
    border-bottom-left-radius: 0.9rem;
    background: #ffffff;
    box-shadow: 0 20px 40px rgba(2, 6, 23, 0.21);
  }

  .mega-panel::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    width: 10.75rem;
    height: 1px;
    background: #ffffff;
    pointer-events: none;
  }

  .mega-grid {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 190px;
    min-height: 395px;
  }

  .mega-left {
    background: #ffffff;
    border-right: 1px solid #e2e8f0;
    padding: 0.72rem;
  }

  .mega-middle {
    background: #ffffff;
    padding: 1rem 1rem 0.95rem;
  }

  .mega-middle-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.62rem;
  }

  .mega-middle-title {
    font-size: 1.02rem;
    font-weight: 700;
    line-height: 1;
    color: #0f172a;
  }

  .mega-show-all {
    font-size: 0.98rem;
    font-weight: 600;
    color: #64748b;
    white-space: nowrap;
  }

  .mega-show-all:hover {
    color: #0f172a;
  }

  .mega-middle-list {
    margin-top: 0.72rem;
    display: grid;
    gap: 0.46rem;
  }

  .mega-right {
    border-left: 1px solid #e2e8f0;
    background: #ffffff;
    padding: 0.92rem 0.72rem 0.9rem;
  }

  .mega-right-head {
    font-size: 1.02rem;
    font-weight: 600;
    color: #1e293b;
  }

  .mega-offer-image-wrap {
    display: block;
    margin-top: 0.55rem;
  }

  .mega-offer-image {
    width: 100%;
    height: 7.45rem;
    border-radius: 0.72rem;
    object-fit: cover;
  }

  .mega-offer-title {
    margin-top: 0.62rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.22;
  }

  .mega-offer-old-price {
    margin-top: 0.2rem;
    font-size: 0.74rem;
    color: #64748b;
    text-decoration: line-through;
  }

  .mega-offer-price {
    margin-top: 0.05rem;
    font-family: 'Manrope', 'Nunito Sans', 'Segoe UI', sans-serif;
    font-size: 1.18rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    line-height: 1.15;
    color: #0f172a;
  }

  .mega-offer-price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.08rem;
  }

  .mega-offer-quick-cart {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.34rem;
    height: 2.34rem;
    border-radius: 0.66rem;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #1e293b;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .mega-offer-quick-cart:hover {
    border-color: #0f172a;
    background: #f8fafc;
    color: #0f172a;
  }

  .mega-offer-quick-cart.is-disabled,
  .mega-offer-quick-cart:disabled {
    cursor: not-allowed;
    border-color: #e2e8f0;
    background: #f8fafc;
    color: #94a3b8;
  }

  .mega-offer-quick-plus {
    position: absolute;
    right: -0.28rem;
    top: -0.29rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.04rem;
    height: 1.04rem;
    border-radius: 9999px;
    background: #0f172a;
    color: #ffffff;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1;
  }

  .mega-category-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    border-radius: 0.72rem;
    padding: 0.62rem 0.66rem;
    font-size: 0.99rem;
    font-weight: 500;
    color: #0f172a;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .mega-category-item:hover {
    background-color: #f3f4f6;
  }

  .mega-category-item.is-active {
    background-color: #e7e9ef;
  }

  .mega-all-products-link {
    display: block;
    border-radius: 0.72rem;
    margin-top: 0.35rem;
    padding: 0.68rem 0.66rem;
    font-size: 0.99rem;
    font-weight: 500;
    color: #0f172a;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .mega-all-products-link:hover {
    background-color: #f3f4f6;
  }

  .mega-sub-link {
    display: block;
    border-radius: 0.4rem;
    padding: 0.5rem 0.14rem;
    font-size: 0.98rem;
    font-weight: 500;
    color: #1f2937;
    transition: background-color 120ms ease, color 120ms ease, padding 120ms ease;
    line-height: 1.25;
  }

  .mega-sub-link:hover {
    color: #111827;
  }

  .mega-sub-link.is-highlighted {
    background: linear-gradient(90deg, #7e22ce 0%, #db2777 100%);
    border-radius: 9999px;
    color: #ffffff;
    padding-left: 0.68rem;
    padding-right: 0.68rem;
  }

  @media (max-width: 767px) {
    .mega-grid {
      grid-template-columns: 1fr;
      min-height: 0;
    }

    .mega-left {
      border-right: 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .mega-right {
      border-left: 0;
      border-top: 1px solid #e2e8f0;
    }

    .mega-middle-title,
    .mega-show-all,
    .mega-right-head {
      font-size: 1rem;
    }

    .mega-offer-price {
      font-size: 1.06rem;
    }
  }

  :global(body.mega-menu-open) {
    overflow: hidden;
  }
</style>
