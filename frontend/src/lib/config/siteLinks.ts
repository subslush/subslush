import { env } from '$env/dynamic/public';

export const TRUSTPILOT_PROFILE_URL =
	env.PUBLIC_SUBSLUSH_TRUSTPILOT_URL?.trim() ||
	'https://www.trustpilot.com/review/subslush.com';

export const SITE_ORIGIN = env.PUBLIC_SITE_URL?.trim() || 'https://subslush.com';
