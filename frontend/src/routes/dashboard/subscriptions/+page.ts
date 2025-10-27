import type { PageLoad } from './$types';

// Simplified client-side load function
// Heavy data loading is now done server-side for better performance
export const load: PageLoad = async ({ data }) => {
  console.log('📦 [SUBSCRIPTIONS CLIENT] Receiving server data:', {
    plansCount: data.plans?.length || 0,
    userBalance: data.userBalance,
    serverLoaded: data.serverLoaded
  });

  // Server data is already processed and optimized
  // Just pass it through with any client-side enhancements if needed
  return {
    ...data,
    // Add any client-side specific properties here if needed
    clientLoaded: true
  };
};