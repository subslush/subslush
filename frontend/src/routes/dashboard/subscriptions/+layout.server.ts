import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async () => {
  throw redirect(303, '/dashboard/orders');
};
