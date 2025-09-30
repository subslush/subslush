import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
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