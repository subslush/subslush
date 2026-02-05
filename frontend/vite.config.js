import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
	plugins: [
		imagetools({
			defaultDirectives: (url) => {
				if (!url.searchParams.has('picture')) {
					return new URLSearchParams();
				}

				if (url.searchParams.has('w') || url.searchParams.has('format')) {
					return new URLSearchParams();
				}

				const heroCardImages = new Set(['netflixny.jpg', 'spotifyny.jpg', 'chatgptny.jpg']);
				const params = new URLSearchParams();
				if (url.pathname.endsWith('pandabearny.webp')) {
					params.set('w', '640;960;1280;1600;1920');
				} else if ([...heroCardImages].some((name) => url.pathname.endsWith(name))) {
					params.set('w', '360;480;720;960;1200');
				} else {
					params.set('w', '64;128;256;384;512;768');
				}
				params.set('format', 'avif;webp');
				params.set('as', 'picture');
				return params;
			}
		}),
		sveltekit()
	],
	server: {
		port: 3000,
		host: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			}
		}
	}
});
