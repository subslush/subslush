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
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24'),
	() => import('./nodes/25'),
	() => import('./nodes/26'),
	() => import('./nodes/27'),
	() => import('./nodes/28'),
	() => import('./nodes/29'),
	() => import('./nodes/30'),
	() => import('./nodes/31'),
	() => import('./nodes/32'),
	() => import('./nodes/33'),
	() => import('./nodes/34'),
	() => import('./nodes/35'),
	() => import('./nodes/36'),
	() => import('./nodes/37'),
	() => import('./nodes/38'),
	() => import('./nodes/39'),
	() => import('./nodes/40'),
	() => import('./nodes/41'),
	() => import('./nodes/42'),
	() => import('./nodes/43'),
	() => import('./nodes/44'),
	() => import('./nodes/45'),
	() => import('./nodes/46')
];

export const server_loads = [0,2,4];

export const dictionary = {
		"/": [5],
		"/admin": [~6,[2]],
		"/admin/bis": [~7,[2]],
		"/admin/bis/[inquiryId]": [~8,[2]],
		"/admin/coupons": [~9,[2]],
		"/admin/credits": [~10,[2]],
		"/admin/migration": [~11,[2]],
		"/admin/notifications": [12,[2]],
		"/admin/orders": [~13,[2]],
		"/admin/orders/[orderId]/fulfillment": [~14,[2]],
		"/admin/payments": [~15,[2]],
		"/admin/pin-reset": [16,[2]],
		"/admin/products": [~17,[2]],
		"/admin/products/[productId]": [~18,[2]],
		"/admin/rewards": [~19,[2]],
		"/admin/subscriptions": [~20,[2]],
		"/admin/subscriptions/[subscriptionId]/renewal": [~21,[2]],
		"/admin/tasks": [~22,[2]],
		"/admin/users": [~23,[2]],
		"/auth/confirm": [24,[3]],
		"/auth/login": [~25,[3]],
		"/auth/register": [26,[3]],
		"/browse": [27],
		"/browse/products/[slug]": [28],
		"/cart": [29],
		"/dashboard": [~30,[4]],
		"/dashboard/browse": [~31,[4]],
		"/dashboard/credits": [~32,[4]],
		"/dashboard/orders": [~33,[4]],
		"/dashboard/prelaunch-rewards": [~34,[4]],
		"/dashboard/settings": [35,[4]],
		"/dashboard/subscriptions": [~36,[4]],
		"/dashboard/subscriptions/active": [~40,[4]],
		"/dashboard/subscriptions/[subscriptionId]": [~37,[4]],
		"/dashboard/subscriptions/[subscriptionId]/billing": [38,[4]],
		"/dashboard/subscriptions/[subscriptionId]/renewal": [39,[4]],
		"/feedback": [41],
		"/help": [42],
		"/privacy": [43],
		"/profile": [44],
		"/returns": [45],
		"/terms": [46]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';