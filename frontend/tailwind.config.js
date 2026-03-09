import { join } from 'path';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import { skeleton } from '@skeletonlabs/tw-plugin';

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],
	theme: {
		extend: {
			colors: {
				subslush: {
					blue: '#7E22CE',
					'blue-light': '#A855F7',
					'blue-dark': '#6B21A8',
					pink: '#DB2777',
					'pink-light': '#EC4899',
					'pink-dark': '#BE185D',
					purple: '#9333EA',
					'purple-light': '#C084FC',
					'purple-dark': '#6B21A8',
				}
			},
			boxShadow: {
				'glow-blue': '0 0 20px rgba(126, 34, 206, 0.5)',
				'glow-pink': '0 0 20px rgba(219, 39, 119, 0.5)',
				'glow-purple': '0 0 20px rgba(168, 85, 247, 0.5)',
			},
			animation: {
				'blob': 'blob 20s infinite ease-in-out',
				'float': 'float 6s ease-in-out infinite',
			},
			keyframes: {
				blob: {
					'0%, 100%': { transform: 'translate(0, 0) scale(1)' },
					'33%': { transform: 'translate(30px, -50px) scale(1.1)' },
					'66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
				},
				float: {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-20px)' },
				},
			},
		}
	},
	plugins: [
		forms,
		typography,
		skeleton({
			themes: {
				preset: [
					{
						name: 'skeleton',
						enhancements: true
					}
				]
			}
		})
	]
};
