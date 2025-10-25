
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
		RouteId(): "/" | "/auth" | "/auth/login" | "/auth/register" | "/browse" | "/browse/subscriptions" | "/browse/subscriptions/[serviceType]" | "/browse/subscriptions/[serviceType]/[planId]" | "/dashboard" | "/dashboard/credits" | "/dashboard/subscriptions" | "/dashboard/subscriptions/active" | "/dashboard/subscriptions/[subscriptionId]" | "/profile";
		RouteParams(): {
			"/browse/subscriptions/[serviceType]": { serviceType: string };
			"/browse/subscriptions/[serviceType]/[planId]": { serviceType: string; planId: string };
			"/dashboard/subscriptions/[subscriptionId]": { subscriptionId: string }
		};
		LayoutParams(): {
			"/": { serviceType?: string; planId?: string; subscriptionId?: string };
			"/auth": Record<string, never>;
			"/auth/login": Record<string, never>;
			"/auth/register": Record<string, never>;
			"/browse": { serviceType?: string; planId?: string };
			"/browse/subscriptions": { serviceType?: string; planId?: string };
			"/browse/subscriptions/[serviceType]": { serviceType: string; planId?: string };
			"/browse/subscriptions/[serviceType]/[planId]": { serviceType: string; planId: string };
			"/dashboard": { subscriptionId?: string };
			"/dashboard/credits": Record<string, never>;
			"/dashboard/subscriptions": { subscriptionId?: string };
			"/dashboard/subscriptions/active": Record<string, never>;
			"/dashboard/subscriptions/[subscriptionId]": { subscriptionId: string };
			"/profile": Record<string, never>
		};
		Pathname(): "/" | "/auth" | "/auth/" | "/auth/login" | "/auth/login/" | "/auth/register" | "/auth/register/" | "/browse" | "/browse/" | "/browse/subscriptions" | "/browse/subscriptions/" | `/browse/subscriptions/${string}` & {} | `/browse/subscriptions/${string}/` & {} | `/browse/subscriptions/${string}/${string}` & {} | `/browse/subscriptions/${string}/${string}/` & {} | "/dashboard" | "/dashboard/" | "/dashboard/credits" | "/dashboard/credits/" | "/dashboard/subscriptions" | "/dashboard/subscriptions/" | "/dashboard/subscriptions/active" | "/dashboard/subscriptions/active/" | `/dashboard/subscriptions/${string}` & {} | `/dashboard/subscriptions/${string}/` & {} | "/profile" | "/profile/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): string & {};
	}
}