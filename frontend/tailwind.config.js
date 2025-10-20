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
			}
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