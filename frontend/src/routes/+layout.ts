import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
  console.log('🔐 [LAYOUT] Client load, user from server:', data?.user?.email);

  // Pass server data to client
  return {
    user: data?.user || null,
  };
};