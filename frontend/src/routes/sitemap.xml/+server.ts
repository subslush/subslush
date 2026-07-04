import { SITE_ORIGIN } from '$lib/config/siteLinks.js';

const staticRoutes = [
	'/',
	'/browse',
	'/how-it-works',
	'/about',
	'/help',
	'/delivery-policy',
	'/payment-security',
	'/returns',
	'/privacy',
	'/terms'
] as const;

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

export const GET = () => {
	const origin = SITE_ORIGIN.replace(/\/+$/, '');
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticRoutes
	.map((route) => `  <url><loc>${escapeXml(`${origin}${route}`)}</loc></url>`)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
