
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/admin" | "/admin/bis" | "/admin/bis/[inquiryId]" | "/admin/coupons" | "/admin/credits" | "/admin/migration" | "/admin/notifications" | "/admin/orders" | "/admin/orders/[orderId]" | "/admin/orders/[orderId]/fulfillment" | "/admin/payments" | "/admin/pin-reset" | "/admin/products" | "/admin/products/[productId]" | "/admin/rewards" | "/admin/subscriptions" | "/admin/subscriptions/[subscriptionId]" | "/admin/subscriptions/[subscriptionId]/renewal" | "/admin/tasks" | "/admin/users" | "/auth" | "/auth/confirm" | "/auth/login" | "/auth/register" | "/browse" | "/browse/products" | "/browse/products/[slug]" | "/browse/subscriptions" | "/browse/subscriptions/[serviceType]" | "/browse/subscriptions/[serviceType]/[planId]" | "/cart" | "/dashboard" | "/dashboard/browse" | "/dashboard/credits" | "/dashboard/orders" | "/dashboard/prelaunch-rewards" | "/dashboard/settings" | "/dashboard/subscriptions" | "/dashboard/subscriptions/active" | "/dashboard/subscriptions/[subscriptionId]" | "/dashboard/subscriptions/[subscriptionId]/billing" | "/dashboard/subscriptions/[subscriptionId]/renewal" | "/feedback" | "/help" | "/manifest.webmanifest" | "/privacy" | "/profile" | "/returns" | "/terms";
		RouteParams(): {
			"/admin/bis/[inquiryId]": { inquiryId: string };
			"/admin/orders/[orderId]": { orderId: string };
			"/admin/orders/[orderId]/fulfillment": { orderId: string };
			"/admin/products/[productId]": { productId: string };
			"/admin/subscriptions/[subscriptionId]": { subscriptionId: string };
			"/admin/subscriptions/[subscriptionId]/renewal": { subscriptionId: string };
			"/browse/products/[slug]": { slug: string };
			"/browse/subscriptions/[serviceType]": { serviceType: string };
			"/browse/subscriptions/[serviceType]/[planId]": { serviceType: string; planId: string };
			"/dashboard/subscriptions/[subscriptionId]": { subscriptionId: string };
			"/dashboard/subscriptions/[subscriptionId]/billing": { subscriptionId: string };
			"/dashboard/subscriptions/[subscriptionId]/renewal": { subscriptionId: string }
		};
		LayoutParams(): {
			"/": { inquiryId?: string; orderId?: string; productId?: string; subscriptionId?: string; slug?: string; serviceType?: string; planId?: string };
			"/admin": { inquiryId?: string; orderId?: string; productId?: string; subscriptionId?: string };
			"/admin/bis": { inquiryId?: string };
			"/admin/bis/[inquiryId]": { inquiryId: string };
			"/admin/coupons": Record<string, never>;
			"/admin/credits": Record<string, never>;
			"/admin/migration": Record<string, never>;
			"/admin/notifications": Record<string, never>;
			"/admin/orders": { orderId?: string };
			"/admin/orders/[orderId]": { orderId: string };
			"/admin/orders/[orderId]/fulfillment": { orderId: string };
			"/admin/payments": Record<string, never>;
			"/admin/pin-reset": Record<string, never>;
			"/admin/products": { productId?: string };
			"/admin/products/[productId]": { productId: string };
			"/admin/rewards": Record<string, never>;
			"/admin/subscriptions": { subscriptionId?: string };
			"/admin/subscriptions/[subscriptionId]": { subscriptionId: string };
			"/admin/subscriptions/[subscriptionId]/renewal": { subscriptionId: string };
			"/admin/tasks": Record<string, never>;
			"/admin/users": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/confirm": Record<string, never>;
			"/auth/login": Record<string, never>;
			"/auth/register": Record<string, never>;
			"/browse": { slug?: string; serviceType?: string; planId?: string };
			"/browse/products": { slug?: string };
			"/browse/products/[slug]": { slug: string };
			"/browse/subscriptions": { serviceType?: string; planId?: string };
			"/browse/subscriptions/[serviceType]": { serviceType: string; planId?: string };
			"/browse/subscriptions/[serviceType]/[planId]": { serviceType: string; planId: string };
			"/cart": Record<string, never>;
			"/dashboard": { subscriptionId?: string };
			"/dashboard/browse": Record<string, never>;
			"/dashboard/credits": Record<string, never>;
			"/dashboard/orders": Record<string, never>;
			"/dashboard/prelaunch-rewards": Record<string, never>;
			"/dashboard/settings": Record<string, never>;
			"/dashboard/subscriptions": { subscriptionId?: string };
			"/dashboard/subscriptions/active": Record<string, never>;
			"/dashboard/subscriptions/[subscriptionId]": { subscriptionId: string };
			"/dashboard/subscriptions/[subscriptionId]/billing": { subscriptionId: string };
			"/dashboard/subscriptions/[subscriptionId]/renewal": { subscriptionId: string };
			"/feedback": Record<string, never>;
			"/help": Record<string, never>;
			"/manifest.webmanifest": Record<string, never>;
			"/privacy": Record<string, never>;
			"/profile": Record<string, never>;
			"/returns": Record<string, never>;
			"/terms": Record<string, never>
		};
		Pathname(): "/" | "/admin" | "/admin/" | "/admin/bis" | "/admin/bis/" | `/admin/bis/${string}` & {} | `/admin/bis/${string}/` & {} | "/admin/coupons" | "/admin/coupons/" | "/admin/credits" | "/admin/credits/" | "/admin/migration" | "/admin/migration/" | "/admin/notifications" | "/admin/notifications/" | "/admin/orders" | "/admin/orders/" | `/admin/orders/${string}` & {} | `/admin/orders/${string}/` & {} | `/admin/orders/${string}/fulfillment` & {} | `/admin/orders/${string}/fulfillment/` & {} | "/admin/payments" | "/admin/payments/" | "/admin/pin-reset" | "/admin/pin-reset/" | "/admin/products" | "/admin/products/" | `/admin/products/${string}` & {} | `/admin/products/${string}/` & {} | "/admin/rewards" | "/admin/rewards/" | "/admin/subscriptions" | "/admin/subscriptions/" | `/admin/subscriptions/${string}` & {} | `/admin/subscriptions/${string}/` & {} | `/admin/subscriptions/${string}/renewal` & {} | `/admin/subscriptions/${string}/renewal/` & {} | "/admin/tasks" | "/admin/tasks/" | "/admin/users" | "/admin/users/" | "/auth" | "/auth/" | "/auth/confirm" | "/auth/confirm/" | "/auth/login" | "/auth/login/" | "/auth/register" | "/auth/register/" | "/browse" | "/browse/" | "/browse/products" | "/browse/products/" | `/browse/products/${string}` & {} | `/browse/products/${string}/` & {} | "/browse/subscriptions" | "/browse/subscriptions/" | `/browse/subscriptions/${string}` & {} | `/browse/subscriptions/${string}/` & {} | `/browse/subscriptions/${string}/${string}` & {} | `/browse/subscriptions/${string}/${string}/` & {} | "/cart" | "/cart/" | "/dashboard" | "/dashboard/" | "/dashboard/browse" | "/dashboard/browse/" | "/dashboard/credits" | "/dashboard/credits/" | "/dashboard/orders" | "/dashboard/orders/" | "/dashboard/prelaunch-rewards" | "/dashboard/prelaunch-rewards/" | "/dashboard/settings" | "/dashboard/settings/" | "/dashboard/subscriptions" | "/dashboard/subscriptions/" | "/dashboard/subscriptions/active" | "/dashboard/subscriptions/active/" | `/dashboard/subscriptions/${string}` & {} | `/dashboard/subscriptions/${string}/` & {} | `/dashboard/subscriptions/${string}/billing` & {} | `/dashboard/subscriptions/${string}/billing/` & {} | `/dashboard/subscriptions/${string}/renewal` & {} | `/dashboard/subscriptions/${string}/renewal/` & {} | "/feedback" | "/feedback/" | "/help" | "/help/" | "/manifest.webmanifest" | "/manifest.webmanifest/" | "/privacy" | "/privacy/" | "/profile" | "/profile/" | "/returns" | "/returns/" | "/terms" | "/terms/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}