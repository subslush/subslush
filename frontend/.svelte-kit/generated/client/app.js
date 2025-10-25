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
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14')
];

export const server_loads = [0,3];

export const dictionary = {
		"/": [4],
		"/auth/login": [~5,[2]],
		"/auth/register": [6,[2]],
		"/browse": [7],
		"/browse/subscriptions/[serviceType]/[planId]": [8],
		"/dashboard": [9,[3]],
		"/dashboard/credits": [10,[3]],
		"/dashboard/subscriptions": [11,[3]],
		"/dashboard/subscriptions/active": [13,[3]],
		"/dashboard/subscriptions/[subscriptionId]": [12,[3]],
		"/profile": [14]
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