import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions';

export const load: PageLoad = async ({ fetch }) => {
  try {
    // Fetch available plans from EXISTING backend API
    const plansResponse = await subscriptionService.getAvailablePlans();

    // Transform plans for easier use in components
    const allPlans: Array<{
      serviceType: string;
      serviceName: string;
      plan: string;
      price: number;
      features: string[];
      description: string;
    }> = [];
    if (plansResponse.services) {
      for (const [serviceType, plans] of Object.entries(plansResponse.services)) {
        plans.forEach(plan => {
          allPlans.push({
            serviceType,
            serviceName: plan.display_name || serviceType,
            plan: plan.plan,
            price: plan.price,
            features: plan.features || [],
            description: plan.description || ''
          });
        });
      }
    }

    return {
      plans: allPlans,
      totalPlans: allPlans.length
    };
  } catch (error) {
    console.error('Failed to load home page data:', error);
    return {
      plans: [],
      totalPlans: 0,
      error: 'Failed to load subscriptions'
    };
  }
};