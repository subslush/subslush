import type { PageLoad } from './$types';
import { createApiClient } from '$lib/api/client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';
import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';

export const load: PageLoad = async ({ fetch, parent }) => {
  try {
    // Wait for parent data (includes authenticated user)
    const parentData = await parent();

    if (!parentData.user) {
      console.error('❌ [SUBSCRIPTIONS PAGE] No authenticated user');
      throw error(401, 'Authentication required');
    }

    console.log('📦 [SUBSCRIPTIONS PAGE] Loading plans for user:', parentData.user.email);

    // Create API client with SvelteKit's fetch for SSR support
    const apiClient = createApiClient(fetch);

    // Fetch available plans (using custom fetch for SSR)
    const plansResponse = await apiClient.get(API_ENDPOINTS.SUBSCRIPTIONS.AVAILABLE);

    console.log('📦 [SUBSCRIPTIONS PAGE] API Response:', plansResponse.data);

    // Backend wraps response in data property, extract it
    const responseData = plansResponse.data.data;

    // Transform and flatten the plans from services object to a simple array
    const plans: ServicePlanDetails[] = [];

    if (responseData.services) {
      for (const [serviceType, servicePlans] of Object.entries(responseData.services)) {
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

    // Fetch user credit balance using SSR-compatible API client
    let userBalance = 0;
    try {
      const balanceResponse = await apiClient.get(`${API_ENDPOINTS.CREDITS.BALANCE}/${parentData.user.id}`);

      // CRITICAL: Extract the numeric balance, not the whole object
      const balanceData = balanceResponse.data.data || balanceResponse.data;
      userBalance = typeof balanceData.balance === 'number'
        ? balanceData.balance
        : (typeof balanceData === 'number' ? balanceData : 0);

      console.log('📦 [SUBSCRIPTIONS PAGE] User balance:', userBalance);
    } catch (err) {
      console.warn('⚠️ [SUBSCRIPTIONS PAGE] Could not load user balance:', err);
      // Don't fail the page load if balance fetch fails
      userBalance = 0;
    }

    return {
      plans,
      groupedPlans: responseData.services,
      userBalance, // Now guaranteed to be a number, not an object
      totalPlans: responseData.total_plans || plans.length,
      user: parentData.user, // Pass user through
    };
  } catch (err: any) {
    console.error('❌ [SUBSCRIPTIONS PAGE] Failed to load subscription plans:', err);
    console.error('❌ [SUBSCRIPTIONS PAGE] Error details:', {
      message: err.message,
      statusCode: err.statusCode,
      error: err.error
    });

    throw error(500, 'Failed to load subscription plans. Please try again.');
  }
};