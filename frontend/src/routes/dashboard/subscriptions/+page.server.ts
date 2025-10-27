import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';
import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';

export const load: PageServerLoad = async ({ locals, fetch, cookies }) => {
  // Server-side authentication check
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  console.log('📦 [SUBSCRIPTIONS SERVER] Loading plans for user:', locals.user.email);

  try {
    // Parallel data fetching for better performance
    const [plansResponse, balanceResponse] = await Promise.allSettled([
      // Fetch available plans
      fetch(`${API_CONFIG.BASE_URL}/subscriptions/available`, {
        headers: {
          'Cookie': cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
          'Cache-Control': 'no-cache',
        }
      }),
      // Fetch user balance
      fetch(`${API_CONFIG.BASE_URL}/credits/balance/${locals.user.id}`, {
        headers: {
          'Cookie': cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
          'Cache-Control': 'no-cache',
        }
      })
    ]);

    // Process plans data
    let plans: ServicePlanDetails[] = [];
    let groupedPlans = {};
    let totalPlans = 0;

    if (plansResponse.status === 'fulfilled' && plansResponse.value.ok) {
      const plansData = await plansResponse.value.json();
      const responseData = plansData.data;

      console.log('📦 [SUBSCRIPTIONS SERVER] Plans data loaded successfully');

      // Transform and flatten the plans from services object to a simple array
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
        groupedPlans = responseData.services;
        totalPlans = responseData.total_plans || plans.length;
      }
    } else {
      console.warn('⚠️ [SUBSCRIPTIONS SERVER] Failed to load plans:',
        plansResponse.status === 'rejected' ? plansResponse.reason : plansResponse.value.statusText);
    }

    // Process balance data
    let userBalance = 0;
    if (balanceResponse.status === 'fulfilled' && balanceResponse.value.ok) {
      const balanceData = await balanceResponse.value.json();
      console.log('📦 [SUBSCRIPTIONS SERVER] Balance data loaded successfully');

      // Extract the numeric balance
      if (typeof balanceData.balance === 'number') {
        userBalance = balanceData.balance;
      } else if (typeof balanceData.availableBalance === 'number') {
        userBalance = balanceData.availableBalance;
      } else if (typeof balanceData.totalBalance === 'number') {
        userBalance = balanceData.totalBalance;
      }
    } else {
      console.warn('⚠️ [SUBSCRIPTIONS SERVER] Failed to load balance:',
        balanceResponse.status === 'rejected' ? balanceResponse.reason : balanceResponse.value.statusText);
    }

    console.log('📦 [SUBSCRIPTIONS SERVER] Data loading completed:', {
      plansCount: plans.length,
      userBalance,
      totalPlans
    });

    return {
      plans,
      groupedPlans,
      userBalance,
      totalPlans,
      user: locals.user,
      // Indicate this data was loaded server-side
      serverLoaded: true
    };

  } catch (error) {
    console.error('❌ [SUBSCRIPTIONS SERVER] Error loading data:', error);

    // Return minimal data structure to prevent page crash
    return {
      plans: [],
      groupedPlans: {},
      userBalance: 0,
      totalPlans: 0,
      user: locals.user,
      serverLoaded: false,
      error: 'Failed to load subscription data. Please refresh the page.'
    };
  }
};