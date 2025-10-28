import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, data }) => {
  // Wait for parent layout data
  const parentData = await parent();

  // Return server data combined with parent data
  return {
    ...data,
    user: parentData.user || null,
    serverLoaded: true
  };
};