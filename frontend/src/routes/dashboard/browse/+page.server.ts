import type { PageServerLoad } from './$types';
import { createApiClient } from '$lib/api/client.js';
import type { BrowsePageData, CategoryOption, BrowseSubscription } from '$lib/types/browse.js';
import type { ServiceType, ServicePlan } from '$lib/types/subscription.js';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  try {
    console.log('📦 [BROWSE SERVER] Loading browse page data');

    // Create API client with SSR fetch
    const apiClient = createApiClient(fetch);

    // Fetch available subscription plans
    const response = await apiClient.get('/subscriptions/available');
    const availablePlans = response.data.data;

    // Transform backend data into browse format
    const subscriptions = transformPlansToSubscriptions(availablePlans);

    // Generate category counts
    const categories = generateCategoryOptions(subscriptions);

    // Get user credits if authenticated
    let userBalance = 0;
    if (locals.user?.id) {
      try {
        const balanceResponse = await apiClient.get(`/credits/balance/${locals.user.id}`);
        userBalance = balanceResponse.data.balance || 0;
      } catch (error) {
        console.warn('📦 [BROWSE SERVER] Failed to fetch user balance:', error);
      }
    }

    const browseData: BrowsePageData = {
      subscriptions,
      totalCount: subscriptions.length,
      userBalance,
      categories
    };

    console.log('📦 [BROWSE SERVER] Successfully loaded:', {
      subscriptions: subscriptions.length,
      categories: categories.length,
      userBalance
    });

    return browseData;

  } catch (error: any) {
    console.error('❌ [BROWSE SERVER] Failed to load browse data:', error);

    // Return graceful fallback data
    return {
      subscriptions: [],
      totalCount: 0,
      userBalance: 0,
      categories: getDefaultCategories(),
      error: 'Failed to load subscriptions. Please try refreshing the page.'
    } as BrowsePageData;
  }
};

function transformPlansToSubscriptions(availablePlans: Record<string, unknown>): BrowseSubscription[] {
  const subscriptions: BrowseSubscription[] = [];

  // Process each service type
  Object.entries((availablePlans.services as Record<string, unknown[]>) || {}).forEach(([serviceType, plans]) => {
    plans.forEach((planData, index) => {
      const plan = planData as Record<string, unknown>;
      const planPrice = (plan.price as number) || 0;
      const monthlySavings = planPrice * 0.4; // Simulate 40% average savings
      const originalPrice = planPrice + monthlySavings;
      const savingsPercentage = Math.round((monthlySavings / originalPrice) * 100);

      const subscription: BrowseSubscription = {
        id: `${serviceType}-${plan.plan as string}-${index}`,
        serviceType: serviceType as ServiceType,
        serviceName: getServiceDisplayName(serviceType),
        planName: (plan.display_name as string) || (plan.plan as string),
        planType: (plan.plan as string) as ServicePlan,
        description: (plan.description as string) || `${getServiceDisplayName(serviceType)} ${plan.plan as string} plan`,
        price: planPrice,
        originalPrice,
        currency: 'EUR',
        features: (plan.features as string[]) || [],
        ratings: {
          average: 4.2 + Math.random() * 0.6, // Simulate ratings 4.2-4.8
          count: Math.floor(Math.random() * 1000) + 100
        },
        host: {
          id: `host-${serviceType}-${index}`,
          name: `${getServiceDisplayName(serviceType)} Partner`,
          isVerified: Math.random() > 0.3, // 70% verified
          joinDate: '2023-01-15',
          lastUpdated: new Date().toISOString()
        },
        availability: {
          totalSeats: 6,
          occupiedSeats: Math.floor(Math.random() * 5) + 1,
          availableSeats: 6 - (Math.floor(Math.random() * 5) + 1)
        },
        badges: generateBadges(serviceType, savingsPercentage),
        category: mapServiceTypeToCategory(serviceType),
        logoUrl: getServiceLogoUrl(serviceType),
        monthlySavings,
        savingsPercentage
      };

      subscriptions.push(subscription);
    });
  });

  return subscriptions;
}

function getServiceDisplayName(serviceType: string): string {
  const displayNames: Record<string, string> = {
    'netflix': 'Netflix',
    'spotify': 'Spotify',
    'tradingview': 'TradingView',
    'adobe': 'Adobe Creative Cloud',
    'youtube': 'YouTube Premium',
    'disney': 'Disney+',
    'hulu': 'Hulu',
    'amazon': 'Amazon Prime',
    'figma': 'Figma',
    'canva': 'Canva',
    'notion': 'Notion',
    'slack': 'Slack'
  };

  return displayNames[serviceType] || serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
}

function mapServiceTypeToCategory(serviceType: string): string {
  const categoryMap: Record<string, string> = {
    'netflix': 'streaming',
    'disney': 'streaming',
    'hulu': 'streaming',
    'amazon': 'streaming',
    'youtube': 'streaming',
    'spotify': 'music',
    'tradingview': 'finance',
    'adobe': 'design',
    'figma': 'design',
    'canva': 'design',
    'notion': 'productivity',
    'slack': 'productivity'
  };

  return categoryMap[serviceType] || 'other';
}

function getServiceLogoUrl(serviceType: string): string {
  return `/images/services/${serviceType}.png`;
}

function generateBadges(serviceType: string, savingsPercentage: number): string[] {
  const badges: string[] = [];

  // Popular services
  if (['netflix', 'spotify', 'adobe'].includes(serviceType)) {
    badges.push('popular');
  }

  // High savings
  if (savingsPercentage > 50) {
    badges.push('best_value');
  }

  // Verified partners
  if (Math.random() > 0.3) {
    badges.push('verified');
  }

  // New services (random)
  if (Math.random() > 0.8) {
    badges.push('new');
  }

  return badges;
}

function generateCategoryOptions(subscriptions: BrowseSubscription[]): CategoryOption[] {
  const categoryCounts: Record<string, number> = {};

  // Count subscriptions per category
  subscriptions.forEach(sub => {
    categoryCounts[sub.category] = (categoryCounts[sub.category] || 0) + 1;
  });

  const categories: CategoryOption[] = [
    { id: 'all', name: 'All Services', icon: '🎯', count: subscriptions.length }
  ];

  // Add categories with counts
  const categoryConfig = [
    { id: 'streaming', name: 'Streaming', icon: '🎬' },
    { id: 'music', name: 'Music', icon: '🎵' },
    { id: 'productivity', name: 'Productivity', icon: '📊' },
    { id: 'design', name: 'Design', icon: '🎨' },
    { id: 'finance', name: 'Finance', icon: '💰' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'other', name: 'Other', icon: '🔧' }
  ];

  categoryConfig.forEach(config => {
    const count = categoryCounts[config.id] || 0;
    if (count > 0) {
      categories.push({
        ...config,
        count
      });
    }
  });

  return categories;
}

function getDefaultCategories(): CategoryOption[] {
  return [
    { id: 'all', name: 'All Services', icon: '🎯', count: 0 },
    { id: 'streaming', name: 'Streaming', icon: '🎬', count: 0 },
    { id: 'music', name: 'Music', icon: '🎵', count: 0 },
    { id: 'productivity', name: 'Productivity', icon: '📊', count: 0 },
    { id: 'design', name: 'Design', icon: '🎨', count: 0 },
    { id: 'finance', name: 'Finance', icon: '💰', count: 0 }
  ];
}