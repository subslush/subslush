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
					blue: '#4FC3F7',
					'blue-light': '#81D4FA',
					'blue-dark': '#0288D1',
					pink: '#F06292',
					'pink-light': '#F8BBD0',
					'pink-dark': '#C2185B',
					purple: '#9C27B0',
					'purple-light': '#CE93D8',
					'purple-dark': '#7B1FA2',
				}
			},
			boxShadow: {
				'glow-blue': '0 0 20px rgba(79, 195, 247, 0.5)',
				'glow-pink': '0 0 20px rgba(240, 98, 146, 0.5)',
				'glow-purple': '0 0 20px rgba(156, 39, 176, 0.5)',
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