export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12')
];

export const server_loads = [0,3];

export const dictionary = {
		"/": [4],
		"/auth/login": [~5,[2]],
		"/auth/register": [6,[2]],
		"/dashboard": [7,[3]],
		"/dashboard/credits": [8,[3]],
		"/dashboard/subscriptions": [9,[3]],
		"/dashboard/subscriptions/active": [11,[3]],
		"/dashboard/subscriptions/[subscriptionId]": [10,[3]],
		"/profile": [12]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.svelte';