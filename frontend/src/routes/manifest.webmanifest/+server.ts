import type { RequestHandler } from '@sveltejs/kit';
import icon96 from '$lib/assets/icon1.png';
import icon192 from '$lib/assets/web-app-manifest-192x192.png';
import icon512 from '$lib/assets/web-app-manifest-512x512.png';

export const GET: RequestHandler = async () => {
  const manifest = {
    name: 'SubSlush',
    short_name: 'SubSlush',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#0F172A',
    icons: [
      {
        src: icon96,
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: icon192,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: icon512,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
