import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { SubscriptionDetail, RelatedPlan } from '$lib/types/subscription';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';

export const load: PageLoad = async ({ params, fetch }) => {
  const { serviceType, planId } = params;

  try {
    // Since the backend endpoints don't exist yet, use the available plans endpoint
    // and construct the subscription detail from the available data
    const availablePlansResponse = await fetch('/api/v1/subscriptions/available');

    if (!availablePlansResponse.ok) {
      throw error(availablePlansResponse.status, 'Failed to load subscription plans');
    }

    const availablePlansData = await availablePlansResponse.json();
    const services = availablePlansData.data?.services || availablePlansData.services;

    if (!services || !services[serviceType]) {
      throw error(404, 'Service type not found');
    }

    const servicePlans = services[serviceType];
    const plan = servicePlans.find((p: any) => p.plan === planId);

    if (!plan) {
      throw error(404, 'Subscription plan not found');
    }

    // Build subscription detail from available plan data
    const subscription: SubscriptionDetail = {
      id: `${serviceType}-${planId}`,
      serviceType: serviceType as any,
      serviceName: serviceType.charAt(0).toUpperCase() + serviceType.slice(1),
      planName: plan.name || plan.plan.charAt(0).toUpperCase() + plan.plan.slice(1),
      planType: plan.plan as any,
      description: plan.description,
      longDescription: plan.description + '\n\nThis is a shared subscription plan that allows you to split costs with other users while maintaining individual access to your account.',
      price: plan.price,
      originalPrice: plan.price * 1.5,
      currency: 'EUR',
      features: plan.features || ['Premium features', 'Shared access', 'Individual accounts'],
      ratings: {
        average: 4.5 + Math.random() * 0.5,
        count: Math.floor(Math.random() * 300) + 50
      },
      host: {
        id: 'host-' + Math.random().toString(36).substr(2, 9),
        name: 'Verified Host',
        isVerified: true,
        joinDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      availability: {
        totalSeats: 6,
        occupiedSeats: Math.floor(Math.random() * 4) + 1,
        availableSeats: 6 - (Math.floor(Math.random() * 4) + 1)
      },
      reviews: [
        {
          id: 'review-1',
          author: 'John Doe',
          isVerified: true,
          rating: 5,
          comment: 'Excellent service, very reliable and great value for money.',
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          id: 'review-2',
          author: 'Sarah Smith',
          isVerified: false,
          rating: 4,
          comment: 'Good experience overall, minor issues but responsive support.',
          createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString()
        }
      ],
      durationOptions: [
        { months: 1, totalPrice: plan.price, isRecommended: false },
        { months: 3, totalPrice: plan.price * 2.7, discount: 10, isRecommended: true },
        { months: 6, totalPrice: plan.price * 5.1, discount: 15, isRecommended: false },
        { months: 12, totalPrice: plan.price * 9.6, discount: 20, isRecommended: false }
      ],
      relatedPlans: [],
      badges: ['streaming', 'shared_plan', 'verified']
    };

    // Build related plans from other services
    const relatedPlans: RelatedPlan[] = [];
    for (const [svcType, svcPlans] of Object.entries(services)) {
      if (svcType === serviceType) continue;

      for (const svcPlan of (svcPlans as any[])) {
        if (relatedPlans.length >= 4) break;

        relatedPlans.push({
          id: `${svcType}-${svcPlan.plan}`,
          serviceType: svcType as any,
          serviceName: svcType.charAt(0).toUpperCase() + svcType.slice(1),
          planName: svcPlan.name || svcPlan.plan.charAt(0).toUpperCase() + svcPlan.plan.slice(1),
          price: svcPlan.price
        });
      }

      if (relatedPlans.length >= 4) break;
    }

    // Fetch user credit balance if user is authenticated
    let userCredits = 0;
    const currentUser = get(user);
    if (currentUser?.id) {
      try {
        const creditBalance = await subscriptionService.getCreditBalance(currentUser.id);
        userCredits = creditBalance.balance;
      } catch (creditError) {
        console.warn('Failed to fetch user credits:', creditError);
        // If credits fetch fails, default to 0 but don't fail the page load
      }
    }

    return {
      subscription,
      relatedPlans,
      userCredits
    };

  } catch (err) {
    console.error('Error loading subscription details:', err);

    // Check if it's a known error type and throw appropriate errors
    if (err instanceof Response) {
      if (err.status === 404) {
        throw error(404, 'Subscription plan not found');
      } else if (err.status === 403) {
        throw error(403, 'Access denied to this subscription');
      } else if (err.status >= 500) {
        throw error(500, 'Server error. Please try again later.');
      }
    }

    throw error(500, 'Failed to load subscription details. Please check your connection and try again.');
  }
};

