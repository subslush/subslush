<script lang="ts">
	import { Bell, ChevronDown, Menu, X } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import UserMenu from './UserMenu.svelte';
	import { notificationService } from '$lib/api/notifications.js';
	import { currency } from '$lib/stores/currency.js';
	import { CURRENCY_OPTIONS, type SupportedCurrency } from '$lib/utils/currency.js';
	import type { Notification } from '$lib/types/notification.js';
	import type { User as AuthUser } from '$lib/types/auth.js';

	export let user: AuthUser | null = null;

	let notifications: Notification[] = [];
	let unreadCount = 0;
	let isNotificationsOpen = false;
	let isNotificationsLoading = false;
	let notificationError = '';
	let hasLoadedNotifications = false;
	let notificationMenu: HTMLDivElement | null = null;
	let currencyMenuOpen = false;
	let pendingCurrency: SupportedCurrency = 'USD';
	let currencyMenuRef: HTMLDivElement | null = null;
	let currencyMenuTriggerRef: HTMLButtonElement | null = null;
	let isMobileMenuOpen = false;

	const navItems = [
		{ label: 'Dashboard', href: '/dashboard' },
		{ label: 'Order history', href: '/dashboard/orders' },
		{ label: 'My subscriptions', href: '/dashboard/subscriptions' }
	];

	$: currentPath = $page.url.pathname;

	// Intelligent route matching function that handles navigation hierarchy properly
	function isActivePath(itemHref: string, currentPath: string): boolean {
		// Exact match for dashboard root
		if (itemHref === '/dashboard') {
			return currentPath === '/dashboard';
		}

		// Match for Order history (includes pagination/query)
		if (itemHref === '/dashboard/orders') {
			return currentPath.startsWith('/dashboard/orders');
		}

		// Match for Your subscriptions (specific child route)
		if (itemHref === '/dashboard/subscriptions') {
			return currentPath.startsWith('/dashboard/subscriptions');
		}

		// Fallback to exact match for any other routes
		return currentPath === itemHref;
	}

	// Proper reactive function that generates CSS classes based on current path
	$: getNavClass = (itemHref: string) => {
		const isActive = isActivePath(itemHref, currentPath);
		return isActive
			? 'bg-white/10 border border-white/20 text-white'
			: 'text-white/70 hover:text-white hover:bg-white/10';
	};

	// Mobile navigation class function
	$: getMobileNavClass = (itemHref: string) => {
		const isActive = isActivePath(itemHref, currentPath);
		return isActive
			? 'bg-white/10 border border-white/20 text-white'
			: 'text-white/70 hover:text-white hover:bg-white/10';
	};

	$: notificationsEnabled = Boolean(user?.id);
	$: if (!currencyMenuOpen) {
		pendingCurrency = $currency as SupportedCurrency;
	}

	function formatNotificationTime(value?: string | null): string {
		if (!value) return '';
		const createdAt = new Date(value);
		const diffMs = Date.now() - createdAt.getTime();
		const diffMinutes = Math.floor(diffMs / 60000);
		if (diffMinutes < 1) return 'Just now';
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function resolveNotificationLink(notification: Notification): string | null {
		const metadata = notification.metadata;
		if (metadata && typeof metadata === 'object' && 'link' in metadata) {
			const link = (metadata as Record<string, unknown>).link;
			if (typeof link === 'string') {
				return link;
			}
		}
		return null;
	}

	async function loadNotifications() {
		if (!notificationsEnabled || !browser) return;
		isNotificationsLoading = true;
		notificationError = '';
		try {
			const result = await notificationService.listNotifications({
				limit: 6,
				offset: 0
			});
			notifications = result.notifications;
			unreadCount = result.unread_count;
		} catch (error) {
			console.warn('Failed to load notifications:', error);
			notificationError = 'Unable to load notifications.';
		} finally {
			isNotificationsLoading = false;
		}
	}

	async function markAllNotificationsRead() {
		if (!notificationsEnabled || unreadCount === 0) return;
		try {
			await notificationService.markRead();
			notifications = notifications.map(notification => ({
				...notification,
				read_at: notification.read_at || new Date().toISOString()
			}));
			unreadCount = 0;
		} catch (error) {
			console.warn('Failed to mark notifications read:', error);
		}
	}

	async function clearAllNotifications() {
		if (!notificationsEnabled || notifications.length === 0) return;
		try {
			await notificationService.clearAll();
			notifications = [];
			unreadCount = 0;
		} catch (error) {
			console.warn('Failed to clear notifications:', error);
		}
	}

	async function markNotificationRead(notification: Notification) {
		if (!notificationsEnabled || notification.read_at) return;
		try {
			await notificationService.markRead([notification.id]);
			notifications = notifications.map(item =>
				item.id === notification.id
					? { ...item, read_at: new Date().toISOString() }
					: item
			);
			unreadCount = Math.max(0, unreadCount - 1);
		} catch (error) {
			console.warn('Failed to mark notification read:', error);
		}
	}

	function toggleNotifications() {
		if (!notificationsEnabled) return;
		isNotificationsOpen = !isNotificationsOpen;
		if (isNotificationsOpen) {
			void loadNotifications();
		}
	}

	function handleNotificationClick(notification: Notification) {
		void markNotificationRead(notification);
		isNotificationsOpen = false;
	}

	const toggleCurrencyMenu = () => {
		currencyMenuOpen = !currencyMenuOpen;
	};

	const handlePendingCurrencyChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement | null;
		const nextCurrency = target?.value as SupportedCurrency | undefined;
		if (!nextCurrency) return;
		pendingCurrency = nextCurrency;
	};

	async function applyCurrencySelection() {
		currency.set(pendingCurrency);
		const currentUrl = `${$page.url.pathname}${$page.url.search ? `?${$page.url.searchParams.toString()}` : ''}`;
		await goto(currentUrl, { replaceState: true });
		await invalidateAll();
		currencyMenuOpen = false;
	}

	onMount(() => {
		const handleDocumentClick = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (notificationMenu && target && !notificationMenu.contains(target)) {
				isNotificationsOpen = false;
			}
			const clickedCurrencyMenu =
				currencyMenuRef?.contains(target as Node) || currencyMenuTriggerRef?.contains(target as Node);
			if (!clickedCurrencyMenu) {
				currencyMenuOpen = false;
			}
		};

		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	$: if (browser && notificationsEnabled && !hasLoadedNotifications) {
		hasLoadedNotifications = true;
		void loadNotifications();
	}
</script>

<nav
	class="sticky z-50 h-16 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white border-b border-slate-800"
	style="top: var(--promo-banner-height, 0px);"
>
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16">

			<!-- LEFT: SubSlush Text Branding -->
			<a href="/" class="flex items-center">
				<span class="text-2xl font-extrabold bg-gradient-to-r from-purple-700 to-pink-600 bg-clip-text text-transparent">
					SubSlush
				</span>
			</a>


			<!-- CENTER: Navigation Links -->
			<div class="hidden md:flex items-center space-x-1">
				{#each navItems as item}
					<a
						href={item.href}
						data-sveltekit-preload-data="hover"
						class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {getNavClass(item.href)}"
					>
						{item.label}
					</a>
				{/each}
			</div>

			<!-- Right section: Balance, Notifications and User Menu -->
			<div class="flex items-center gap-2 md:gap-4">
				<!-- Language/Currency Selector -->
				<div class="hidden md:flex items-center">
					<div class="relative currency-menu-anchor">
						<button
							type="button"
							class={`currency-trigger ${currencyMenuOpen ? 'is-open' : ''}`}
							aria-haspopup="dialog"
							aria-expanded={currencyMenuOpen}
							on:click|stopPropagation={toggleCurrencyMenu}
							bind:this={currencyMenuTriggerRef}
						>
							<span class="currency-trigger-value">EN</span>
							<span class="currency-trigger-divider" aria-hidden="true"></span>
							<span class="currency-trigger-value">{$currency}</span>
							<ChevronDown
								size={14}
								class={`currency-trigger-chevron ${currencyMenuOpen ? 'rotate-180' : ''}`}
								aria-hidden="true"
							/>
						</button>

						{#if currencyMenuOpen}
							<div class="currency-menu-dropdown" bind:this={currencyMenuRef}>
								<div class="currency-menu-panel" role="dialog" aria-label="Language and currency">
									<p class="currency-menu-label">Languages</p>
									<button
										type="button"
										class="currency-menu-field"
										aria-label="Selected language"
										aria-disabled="true"
									>
										<span class="currency-menu-flag">EN</span>
										<span class="currency-menu-field-value">English</span>
										<ChevronDown size={16} class="currency-menu-caret currency-menu-caret-select" aria-hidden="true" />
									</button>

									<p class="currency-menu-label currency-menu-label-gap">Currencies</p>
									<div class="currency-menu-field currency-menu-select-wrap">
										<span class="currency-menu-currency-prefix">€</span>
										<select
											class="currency-menu-select"
											aria-label="Select currency"
											bind:value={pendingCurrency}
											on:change={handlePendingCurrencyChange}
										>
											{#each CURRENCY_OPTIONS as option}
												<option value={option.value}>{option.value}</option>
											{/each}
										</select>
										<ChevronDown size={16} class="currency-menu-caret" aria-hidden="true" />
									</div>

									<button
										type="button"
										class="currency-menu-accept"
										on:click={applyCurrencySelection}
									>
										ACCEPT
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Notifications -->
				<div class="relative" bind:this={notificationMenu}>
					<button
						class="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-60"
						aria-label="Notifications"
						on:click={toggleNotifications}
						disabled={!notificationsEnabled}
					>
						<Bell size={20} />

						{#if unreadCount > 0}
							<span class="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
								{unreadCount > 9 ? '9+' : unreadCount}
							</span>
						{/if}
					</button>

					{#if isNotificationsOpen}
						<div class="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
							<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
								<span class="text-sm font-semibold text-gray-900">Notifications</span>
								<div class="flex items-center gap-2">
									{#if notifications.length > 0}
										<button
											class="text-xs font-medium text-gray-600 hover:text-gray-900"
											on:click={clearAllNotifications}
										>
											Clear all
										</button>
									{/if}
									{#if unreadCount > 0}
										<button
											class="text-xs font-medium text-gray-600 hover:text-gray-900"
											on:click={markAllNotificationsRead}
										>
											Mark all read
										</button>
									{/if}
								</div>
							</div>

							<div class="max-h-80 overflow-y-auto">
								{#if isNotificationsLoading}
									<div class="px-4 py-4 text-sm text-gray-500">Loading notifications...</div>
								{:else if notificationError}
									<div class="px-4 py-4 text-sm text-red-600">{notificationError}</div>
								{:else if notifications.length === 0}
									<div class="px-4 py-6 text-sm text-gray-500">No notifications yet.</div>
								{:else}
									{#each notifications as notification}
										{#if resolveNotificationLink(notification)}
											<a
												href={resolveNotificationLink(notification)}
												class="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
												on:click={() => handleNotificationClick(notification)}
											>
												<p class="text-sm font-medium text-gray-900">{notification.title}</p>
												<p class="text-xs text-gray-600 mt-1">{notification.message}</p>
												<div class="mt-2 flex items-center justify-between text-xs text-gray-400">
													<span>{formatNotificationTime(notification.created_at)}</span>
													{#if !notification.read_at}
														<span class="text-gray-700">Unread</span>
													{/if}
												</div>
											</a>
										{:else}
											<button
												type="button"
												class="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
												on:click={() => handleNotificationClick(notification)}
											>
												<p class="text-sm font-medium text-gray-900">{notification.title}</p>
												<p class="text-xs text-gray-600 mt-1">{notification.message}</p>
												<div class="mt-2 flex items-center justify-between text-xs text-gray-400">
													<span>{formatNotificationTime(notification.created_at)}</span>
													{#if !notification.read_at}
														<span class="text-gray-700">Unread</span>
													{/if}
												</div>
											</button>
										{/if}
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- User Menu -->
				<UserMenu {user} variant="dark" />
				<button
					type="button"
					class="md:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
					aria-label="Open menu"
					aria-controls="mobile-dashboard-menu"
					aria-expanded={isMobileMenuOpen}
					on:click={() => (isMobileMenuOpen = true)}
				>
					<Menu size={20} />
				</button>
			</div>
		</div>

		{#if isMobileMenuOpen}
			<div class="fixed inset-0 z-[60] md:hidden">
				<button
					type="button"
					class="absolute inset-0 bg-slate-900/70 backdrop-blur-sm border-0 p-0"
					aria-label="Close menu"
					on:click={() => (isMobileMenuOpen = false)}
					transition:fade={{ duration: 150 }}
				></button>
				<div
					id="mobile-dashboard-menu"
					class="absolute right-0 top-0 h-full w-[82%] max-w-xs bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 border-l border-slate-700 shadow-2xl p-4 flex flex-col"
					role="dialog"
					aria-modal="true"
					aria-labelledby="mobile-dashboard-menu-title"
					transition:fly={{ x: 28, duration: 180 }}
				>
					<div class="flex items-center justify-between pb-4 border-b border-slate-700">
						<span id="mobile-dashboard-menu-title" class="text-sm font-semibold text-white">Menu</span>
						<button
							type="button"
							class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
							aria-label="Close menu"
							on:click={() => (isMobileMenuOpen = false)}
						>
							<X size={18} />
						</button>
					</div>

					<div class="mt-4 space-y-2">
						{#each navItems as item}
							<a
								href={item.href}
								data-sveltekit-preload-data="hover"
								class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors {getMobileNavClass(item.href)}"
								on:click={() => (isMobileMenuOpen = false)}
							>
								<span>{item.label}</span>
							</a>
						{/each}
					</div>

					<div class="mt-4 border-t border-slate-700 pt-4 space-y-3">
						<div class="relative">
							<select
								class="lang-select w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition-colors duration-150 hover:border-slate-300"
								aria-label="Language and currency"
								bind:value={pendingCurrency}
								on:change={handlePendingCurrencyChange}
							>
								{#each CURRENCY_OPTIONS as option}
									<option value={option.value}>{option.value}</option>
								{/each}
							</select>
							<ChevronDown
								class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
								size={14}
								aria-hidden="true"
							/>
						</div>
						<button
							type="button"
							class="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-xs font-semibold text-white"
							on:click={() => {
								void applyCurrencySelection();
								isMobileMenuOpen = false;
							}}
						>
							ACCEPT
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</nav>

<style>
	.currency-menu-anchor {
		min-width: 118px;
		height: 2.5rem;
	}

	.currency-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.46rem;
		min-height: 2.12rem;
		border: 1px solid #cbd5e1;
		border-radius: 0.88rem;
		background: #ffffff;
		color: #0f172a;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1;
		padding: 0.46rem 0.7rem;
		transition: border-color 140ms ease, background 140ms ease;
	}

	.currency-trigger:hover {
		border: 1px solid transparent;
		background:
			linear-gradient(#ffffff, #ffffff) padding-box,
			linear-gradient(90deg, #7e22ce 0%, #db2777 100%) border-box;
	}

	.currency-trigger:focus-visible {
		border: 1px solid transparent;
		background:
			linear-gradient(#ffffff, #ffffff) padding-box,
			linear-gradient(90deg, #7e22ce 0%, #db2777 100%) border-box;
		outline: none;
	}

	.currency-trigger.is-open {
		border-color: #cbd5e1;
		background: #ffffff;
	}

	.currency-trigger-value {
		white-space: nowrap;
	}

	.currency-trigger-divider {
		width: 1px;
		height: 0.85rem;
		background: #d1d5db;
	}

	.currency-trigger-chevron {
		margin-left: 0.22rem;
		color: #64748b;
	}

	.currency-menu-dropdown {
		position: absolute;
		left: 0;
		top: calc(100% + 0.38rem);
		width: 208px;
		z-index: 82;
	}

	.currency-menu-panel {
		border: 1px solid #cbd5e1;
		border-radius: 0.98rem;
		background: #ffffff;
		box-shadow: 0 18px 34px rgba(15, 23, 42, 0.16);
		padding: 0.88rem 0.86rem 0.86rem;
	}

	.currency-menu-label {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: #4b5563;
	}

	.currency-menu-label-gap {
		margin-top: 0.7rem;
	}

	.currency-menu-field {
		width: 100%;
		height: 2.02rem;
		margin-top: 0.45rem;
		border: 1px solid #d1d5db;
		border-radius: 9999px;
		background: #f8fafc;
		color: #0f172a;
		display: flex;
		align-items: center;
		gap: 0.52rem;
		padding: 0 0.78rem;
		font-size: 0.94rem;
		font-weight: 700;
	}

	.currency-menu-flag {
		width: 1.38rem;
		height: 1rem;
		border-radius: 0.2rem;
		border: 1px solid #d1d5db;
		background:
			linear-gradient(0deg, transparent 42%, #ef4444 42%, #ef4444 58%, transparent 58%),
			linear-gradient(90deg, transparent 42%, #1d4ed8 42%, #1d4ed8 58%, transparent 58%),
			#ffffff;
		color: transparent;
		flex: 0 0 auto;
	}

	.currency-menu-field-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: #111827;
	}

	.currency-menu-select-wrap {
		position: relative;
		padding-right: 2rem;
	}

	.currency-menu-currency-prefix {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.12rem;
		height: 1.12rem;
		border-radius: 9999px;
		background: #e5e7eb;
		color: #111827;
		font-size: 0.75rem;
		font-weight: 700;
		flex: 0 0 auto;
	}

	.currency-menu-select {
		appearance: none;
		border: 0;
		background: transparent;
		color: #111827;
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		width: 100%;
		padding-right: 0;
		cursor: pointer;
	}

	.currency-menu-select:focus {
		outline: none;
	}

	.currency-menu-caret {
		margin-left: auto;
		color: #4b5563;
		flex: 0 0 auto;
	}

	.currency-menu-caret-select {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
	}

	.currency-menu-accept {
		width: 100%;
		margin-top: 0.88rem;
		border: 0;
		border-radius: 9999px;
		background: linear-gradient(90deg, #7e22ce 0%, #db2777 100%);
		color: #ffffff;
		font-size: 0.88rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		height: 2.1rem;
		cursor: pointer;
	}
</style>
