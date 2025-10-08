import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { error } from '@sveltejs/kit';
import type { ServicePlanDetails } from '$lib/types/subscription.js';

export const load: PageLoad = async ({ fetch }) => {
  try {
    // Load available subscription plans
    const plansResponse = await subscriptionService.getAvailablePlans();

    // Flatten the plans from services object to a simple array
    const plans: ServicePlanDetails[] = [];
    for (const [serviceType, servicePlans] of Object.entries(plansResponse.services)) {
      plans.push(...servicePlans);
    }

    // Get user credit balance if possible (will handle auth checks in component)
    let userBalance = 0;
    try {
      // This would need user ID - we'll handle this in the component with auth store
      // const balanceResponse = await subscriptionService.getCreditBalance(userId);
      // userBalance = balanceResponse.balance;
    } catch (err) {
      // Ignore balance errors for now - component will handle
      console.warn('Could not load user balance:', err);
    }

    return {
      plans,
      groupedPlans: plansResponse.services,
      userBalance,
      totalPlans: plansResponse.total_plans
    };
  } catch (err) {
    console.error('Failed to load subscription plans:', err);
    throw error(500, 'Failed to load subscription plans. Please try again.');
  }
};