import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { SubscriptionDetail, RelatedPlan } from '$lib/types/subscription';

export const load: PageLoad = async ({ params, fetch }) => {
  const { serviceType, planId } = params;

  try {
    // Fetch subscription details
    const subscriptionResponse = await fetch(
      `/api/v1/subscriptions/${serviceType}/${planId}`
    );

    if (!subscriptionResponse.ok) {
      if (subscriptionResponse.status === 404) {
        throw error(404, 'Subscription plan not found');
      }
      throw error(subscriptionResponse.status, 'Failed to load subscription details');
    }

    const subscription: SubscriptionDetail = await subscriptionResponse.json();

    // Fetch related plans
    const relatedPlansResponse = await fetch(
      `/api/v1/subscriptions/related/${serviceType}?limit=4&exclude=${planId}`
    );

    let relatedPlans: RelatedPlan[] = [];
    if (relatedPlansResponse.ok) {
      relatedPlans = await relatedPlansResponse.json();
    }

    return {
      subscription,
      relatedPlans
    };

  } catch (err) {
    console.error('Error loading subscription details:', err);

    // Return mock data for development if API is not available
    if (process.env.NODE_ENV === 'development') {
      return {
        subscription: getMockSubscription(serviceType, planId),
        relatedPlans: getMockRelatedPlans(serviceType)
      };
    }

    throw error(500, 'Failed to load subscription details');
  }
};

// Mock data for development
function getMockSubscription(serviceType: string, planId: string): SubscriptionDetail {
  const mockData = {
    spotify: {
      id: planId,
      serviceType: 'spotify' as const,
      serviceName: 'Spotify',
      planName: 'Premium Family',
      planType: 'family' as const,
      description: 'Premium music streaming with ad-free listening, offline downloads, and high-quality audio for up to 6 family members.',
      longDescription: `Experience Spotify at its finest with our Premium Family shared plan. Get access to over 100 million songs without ads, plus the ability to download music for offline listening.

This plan includes high-quality audio streaming up to 320 kbps, unlimited skips, and the ability to play any song on-demand. Perfect for families or groups who want to share the cost while enjoying individual accounts.

Each member gets their own personalized experience with Spotify's advanced recommendation algorithms, curated playlists, and the ability to create and share their own playlists. The plan also includes access to Spotify's exclusive podcasts and audiobooks.`,
      price: 6.99,
      originalPrice: 15.99,
      currency: 'EUR',
      features: [
        'Ad-free music streaming',
        'Offline downloads',
        'High-quality audio (320 kbps)',
        'Unlimited skips',
        'Individual accounts for 6 members',
        'Access to exclusive podcasts',
        'Spotify Connect (play on any device)',
        'Custom playlists and recommendations'
      ],
      ratings: { average: 4.6, count: 247 },
      host: {
        id: 'host-123',
        name: 'Emily Chen',
        isVerified: true,
        joinDate: '2023-03-15T00:00:00Z'
      },
      availability: {
        totalSeats: 6,
        occupiedSeats: 3,
        availableSeats: 3
      },
      reviews: [
        {
          id: 'review-1',
          author: 'Alex Thompson',
          isVerified: true,
          rating: 5,
          comment: 'Excellent quality and reliability. The host is very responsive and the service has been working perfectly for months.',
          createdAt: '2024-01-15T10:30:00Z'
        },
        {
          id: 'review-2',
          author: 'Sarah Martinez',
          isVerified: false,
          rating: 4,
          comment: 'Great value for money. Sometimes there are minor hiccups but overall very satisfied with the service.',
          createdAt: '2024-01-10T14:20:00Z'
        },
        {
          id: 'review-3',
          author: 'Michael Johnson',
          isVerified: true,
          rating: 5,
          comment: 'Been using this for 6 months now. No issues at all and significant savings compared to individual plan.',
          createdAt: '2024-01-05T09:15:00Z'
        }
      ],
      durationOptions: [
        { months: 1, totalPrice: 6.99, isRecommended: false },
        { months: 3, totalPrice: 18.99, discount: 10, isRecommended: true },
        { months: 6, totalPrice: 35.99, discount: 15, isRecommended: false },
        { months: 12, totalPrice: 67.99, discount: 20, isRecommended: false }
      ],
      relatedPlans: [],
      badges: ['streaming', 'shared_plan', 'verified', 'popular']
    },
    netflix: {
      id: planId,
      serviceType: 'netflix' as const,
      serviceName: 'Netflix',
      planName: 'Premium 4K',
      planType: 'premium' as const,
      description: 'Premium 4K streaming with ad-free content, offline viewing, and support for 4 simultaneous screens.',
      longDescription: `Enjoy Netflix Premium with stunning 4K Ultra HD resolution and HDR support on compatible devices. This premium plan offers the best Netflix experience with crystal-clear picture quality and immersive audio.

Stream on up to 4 devices simultaneously, making it perfect for families or shared households. Download your favorite shows and movies for offline viewing when you're on the go or have limited internet connectivity.

Access Netflix's entire catalog including exclusive originals, international content, and the latest releases. The plan includes Dolby Atmos support for premium audio and works across all your devices - from smart TVs to mobile phones.`,
      price: 8.99,
      originalPrice: 17.99,
      currency: 'EUR',
      features: [
        '4K Ultra HD resolution',
        'HDR and Dolby Vision support',
        'Dolby Atmos audio',
        '4 simultaneous screens',
        'Offline downloads',
        'Ad-free experience',
        'All Netflix content libraries',
        'Watch on any device'
      ],
      ratings: { average: 4.8, count: 342 },
      host: {
        id: 'host-456',
        name: 'David Rodriguez',
        isVerified: true,
        joinDate: '2023-01-20T00:00:00Z'
      },
      availability: {
        totalSeats: 4,
        occupiedSeats: 3,
        availableSeats: 1
      },
      reviews: [
        {
          id: 'review-4',
          author: 'Jennifer Kim',
          isVerified: true,
          rating: 5,
          comment: 'Perfect 4K quality and the host manages everything professionally. Highly recommended!',
          createdAt: '2024-01-20T16:45:00Z'
        },
        {
          id: 'review-5',
          author: 'Robert Wilson',
          isVerified: true,
          rating: 5,
          comment: 'Been using this for over a year. No downtime and excellent customer service from the host.',
          createdAt: '2024-01-18T11:30:00Z'
        }
      ],
      durationOptions: [
        { months: 1, totalPrice: 8.99, isRecommended: false },
        { months: 3, totalPrice: 24.99, discount: 8, isRecommended: true },
        { months: 6, totalPrice: 47.99, discount: 12, isRecommended: false },
        { months: 12, totalPrice: 89.99, discount: 18, isRecommended: false }
      ],
      relatedPlans: [],
      badges: ['streaming', 'shared_plan', 'verified']
    },
    tradingview: {
      id: planId,
      serviceType: 'tradingview' as const,
      serviceName: 'TradingView',
      planName: 'Pro Plan',
      planType: 'pro' as const,
      description: 'Professional trading platform with advanced charting tools, indicators, and real-time market data.',
      longDescription: `TradingView Pro gives you access to professional-grade trading tools used by millions of traders worldwide. Get real-time data from global markets, advanced charting capabilities, and powerful technical analysis tools.

The Pro plan includes premium indicators, alerts, and the ability to save unlimited charts and layouts. Access to higher timeframes and extended market hours data helps you make informed trading decisions.

Connect with the trading community through ideas sharing, follow top traders, and get market insights from professionals. The platform supports multiple asset classes including stocks, forex, crypto, and commodities.`,
      price: 24.99,
      originalPrice: 59.95,
      currency: 'EUR',
      features: [
        'Real-time market data',
        'Advanced charting tools',
        'Premium indicators',
        'Price alerts',
        'Extended trading hours',
        'Multiple timeframes',
        'Social trading features',
        'Mobile and desktop apps'
      ],
      ratings: { average: 4.4, count: 189 },
      host: {
        id: 'host-789',
        name: 'Maria Gonzalez',
        isVerified: true,
        joinDate: '2023-05-10T00:00:00Z'
      },
      availability: {
        totalSeats: 3,
        occupiedSeats: 2,
        availableSeats: 1
      },
      reviews: [
        {
          id: 'review-6',
          author: 'Trading Pro',
          isVerified: true,
          rating: 4,
          comment: 'Great for technical analysis. The real-time data is accurate and the charting tools are excellent.',
          createdAt: '2024-01-12T08:20:00Z'
        }
      ],
      durationOptions: [
        { months: 1, totalPrice: 24.99, isRecommended: false },
        { months: 3, totalPrice: 69.99, discount: 7, isRecommended: true },
        { months: 12, totalPrice: 259.99, discount: 15, isRecommended: false }
      ],
      relatedPlans: [],
      badges: ['shared_plan', 'verified', 'business']
    }
  };

  return mockData[serviceType as keyof typeof mockData] || mockData.spotify;
}

function getMockRelatedPlans(currentServiceType: string): RelatedPlan[] {
  const allPlans = [
    { id: 'spotify-family', serviceType: 'spotify', serviceName: 'Spotify', planName: 'Family Plan', price: 6.99 },
    { id: 'netflix-premium', serviceType: 'netflix', serviceName: 'Netflix', planName: 'Premium 4K', price: 8.99 },
    { id: 'disney-premium', serviceType: 'disney', serviceName: 'Disney+', planName: 'Premium Bundle', price: 5.99 },
    { id: 'tradingview-pro', serviceType: 'tradingview', serviceName: 'TradingView', planName: 'Pro Plan', price: 24.99 }
  ];

  // Return plans that don't match current service type
  return allPlans.filter(plan => plan.serviceType !== currentServiceType).slice(0, 4) as RelatedPlan[];
}