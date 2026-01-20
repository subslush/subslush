import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const [claimedReferralRewards, claimedPrelaunchRewards] = await Promise.all([
    adminService.listReferralRewards({ limit: 200, redeemed: 'true' }).catch(() => []),
    adminService.listPrelaunchRewards({ limit: 200, redeemed: 'true' }).catch(() => [])
  ]);

  return {
    claimedReferralRewards,
    claimedPrelaunchRewards
  };
};
