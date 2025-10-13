import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { error } from '@sveltejs/kit';
import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';

export const load: PageLoad = async ({ parent }) => {
  try {
    // Wait for parent data (includes authenticated user)
    const parentData = await parent();

    console.log('📦 [SUBSCRIPTIONS PAGE] Loading subscription plans...');

    // Load available subscription plans
    const plansResponse = await subscriptionService.getAvailablePlans();

    console.log('📦 [SUBSCRIPTIONS PAGE] API Response:', plansResponse);

    // Transform and flatten the plans from services object to a simple array
    const plans: ServicePlanDetails[] = [];

    if (plansResponse.services) {
      for (const [serviceType, servicePlans] of Object.entries(plansResponse.services)) {
        if (Array.isArray(servicePlans)) {
          // Transform each plan to match ServicePlanDetails interface
          const transformedPlans = servicePlans.map((plan: any) => ({
            service_type: serviceType as ServiceType,
            plan: plan.plan,
            price: plan.price,
            features: plan.features || [],
            display_name: plan.name || `${serviceType} ${plan.plan}`,
            description: plan.description || ''
          }));
          plans.push(...transformedPlans);
        }
      }
    }

    console.log('📦 [SUBSCRIPTIONS PAGE] Transformed plans count:', plans.length);

    // Get user credit balance if user is authenticated
    let userBalance = 0;
    if ((parentData as any).user?.id) {
      try {
        const balanceResponse = await subscriptionService.getCreditBalance((parentData as any).user.id);
        userBalance = balanceResponse.balance;
        console.log('📦 [SUBSCRIPTIONS PAGE] User balance:', userBalance);
      } catch (err) {
        console.warn('⚠️ [SUBSCRIPTIONS PAGE] Could not load user balance:', err);
        // Don't fail the page load if balance fetch fails
      }
    }

    return {
      plans,
      groupedPlans: plansResponse.services,
      userBalance,
      totalPlans: plansResponse.total_plans || plans.length
    };
  } catch (err: any) {
    console.error('❌ [SUBSCRIPTIONS PAGE] Failed to load subscription plans:', err);
    console.error('❌ [SUBSCRIPTIONS PAGE] Error details:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });

    throw error(500, 'Failed to load subscription plans. Please try again.');
  }
};