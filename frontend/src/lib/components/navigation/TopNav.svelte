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
	type SupportedLanguage =
		| 'en'
		| 'de'
		| 'es'
		| 'fr'
		| 'it'
		| 'pl'
		| 'ro'
		| 'sv'
		| 'no'
		| 'da'
		| 'fi';
	type LanguageOption = {
		value: SupportedLanguage;
		shortLabel: string;
		label: string;
		flagCode: 'gb' | 'de' | 'es' | 'fr' | 'it' | 'pl' | 'ro' | 'se' | 'no' | 'dk' | 'fi';
	};
	const LANGUAGE_OPTIONS: LanguageOption[] = [
		{ value: 'en', shortLabel: 'EN', label: 'English', flagCode: 'gb' },
		{ value: 'de', shortLabel: 'DE', label: 'Deutsch', flagCode: 'de' },
		{ value: 'es', shortLabel: 'ES', label: 'Espanol', flagCode: 'es' },
		{ value: 'fr', shortLabel: 'FR', label: 'Francais', flagCode: 'fr' },
		{ value: 'it', shortLabel: 'IT', label: 'Italiano', flagCode: 'it' },
		{ value: 'pl', shortLabel: 'PL', label: 'Polski', flagCode: 'pl' },
		{ value: 'ro', shortLabel: 'RO', label: 'Romana', flagCode: 'ro' },
		{ value: 'sv', shortLabel: 'SV', label: 'Svenska', flagCode: 'se' },
		{ value: 'no', shortLabel: 'NO', label: 'Norska', flagCode: 'no' },
		{ value: 'da', shortLabel: 'DA', label: 'Danska', flagCode: 'dk' },
		{ value: 'fi', shortLabel: 'FI', label: 'Finska', flagCode: 'fi' }
	];
	const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
	const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
		USD: '$',
		EUR: '€',
		AUD: 'A$',
		CAD: 'C$',
		CHF: 'CHF',
		CNY: '¥',
		CZK: 'Kc',
		DKK: 'kr',
		GBP: '£',
		HKD: 'HK$',
		HUF: 'Ft',
		JPY: '¥',
		MYR: 'RM',
		NOK: 'kr',
		PLN: 'zl',
		PHP: '₱',
		RON: 'lei',
		SEK: 'kr',
		SGD: 'S$',
		THB: '฿'
	};
	const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
		USD: 'USD',
		EUR: 'EURO',
		AUD: 'AUD',
		CAD: 'CAD',
		CHF: 'CHF',
		CNY: 'CNY',
		CZK: 'CZK',
		DKK: 'DKK',
		GBP: 'GBP',
		HKD: 'HKD',
		HUF: 'HUF',
		JPY: 'JPY',
		MYR: 'MYR',
		NOK: 'NOK',
		PLN: 'PLN',
		PHP: 'PHP',
		RON: 'RON',
		SEK: 'SEK',
		SGD: 'SGD',
		THB: 'THB'
	};
	let selectedLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
	let pendingLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
	let selectedLanguageOption: LanguageOption = LANGUAGE_OPTIONS[0];
	let pendingLanguageOption: LanguageOption = LANGUAGE_OPTIONS[0];
	let pendingCurrencySymbol = CURRENCY_SYMBOLS.USD;
	let pendingCurrencyLabel = CURRENCY_LABELS.USD;
	let currencyMenuRef: HTMLDivElement | null = null;
	let currencyMenuTriggerRef: HTMLButtonElement | null = null;
	let isMobileMenuOpen = false;

	const navItems = [
		{ label: 'Orders', href: '/dashboard/orders' },
		{ label: 'Settings', href: '/dashboard/settings' },
		{ label: 'Contact Support', href: '/help' }
	];
	const resolveLanguageOption = (value?: string | null): LanguageOption =>
		LANGUAGE_OPTIONS.find((option) => option.value === value) || LANGUAGE_OPTIONS[0];
	const resolveCurrencySymbol = (value: SupportedCurrency): string =>
		CURRENCY_SYMBOLS[value] || value;
	const resolveCurrencyLabel = (value: SupportedCurrency): string =>
		CURRENCY_LABELS[value] || value;

	$: currentPath = $page.url.pathname;

	// Intelligent route matching function that handles navigation hierarchy properly
	function isActivePath(itemHref: string, currentPath: string): boolean {
		// Match for Order history (includes pagination/query)
		if (itemHref === '/dashboard/orders') {
			return currentPath === '/dashboard' || currentPath.startsWith('/dashboard/orders');
		}

		if (itemHref === '/help') {
			return currentPath.startsWith('/help');
		}

		if (itemHref === '/dashboard/settings') {
			return currentPath.startsWith('/dashboard/settings');
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
		pendingLanguage = selectedLanguage;
	}
	$: selectedLanguageOption = resolveLanguageOption(selectedLanguage);
	$: pendingLanguageOption = resolveLanguageOption(pendingLanguage);
	$: pendingCurrencySymbol = resolveCurrencySymbol(pendingCurrency);
	$: pendingCurrencyLabel = resolveCurrencyLabel(pendingCurrency);

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
			notifications = notifications.map((notification) => ({
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
			notifications = notifications.map((item) =>
				item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
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
	const handlePendingLanguageChange = (event: Event) => {
		const target = event.currentTarget as HTMLSelectElement | null;
		const nextLanguage = target?.value as SupportedLanguage | undefined;
		if (!nextLanguage) return;
		pendingLanguage = nextLanguage;
	};

	async function applyCurrencySelection() {
		selectedLanguage = pendingLanguage;
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
				currencyMenuRef?.contains(target as Node) ||
				currencyMenuTriggerRef?.contains(target as Node);
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
				<span
					class="text-2xl font-extrabold bg-gradient-to-r from-purple-700 to-pink-600 bg-clip-text text-transparent"
				>
					SubSlush
				</span>
			</a>

			<!-- CENTER: Navigation Links -->
			<div class="hidden md:flex items-center space-x-1">
				{#each navItems as item}
					<a
						href={item.href}
						data-sveltekit-preload-data="hover"
						class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {getNavClass(
							item.href
						)}"
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
							<span class="currency-trigger-value">{selectedLanguageOption.shortLabel}</span>
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
									<div class="currency-menu-field currency-menu-select-wrap">
										<span
											class={`currency-menu-prefix currency-menu-language-prefix currency-menu-flag-image currency-menu-flag-${pendingLanguageOption.flagCode}`}
											aria-hidden="true"
										></span>
										<span class="currency-menu-separator" aria-hidden="true">|</span>
										<span class="currency-menu-field-value">{pendingLanguageOption.label}</span>
										<select
											class="currency-menu-select-overlay"
											aria-label="Select language"
											bind:value={pendingLanguage}
											on:change={handlePendingLanguageChange}
										>
											{#each LANGUAGE_OPTIONS as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
										<ChevronDown
											size={16}
											class="currency-menu-caret currency-menu-caret-select"
											aria-hidden="true"
										/>
									</div>

									<p class="currency-menu-label currency-menu-label-gap">Currencies</p>
									<div class="currency-menu-field currency-menu-select-wrap">
										<span class="currency-menu-prefix currency-menu-currency-prefix"
											>{pendingCurrencySymbol}</span
										>
										<span class="currency-menu-separator" aria-hidden="true">|</span>
										<span class="currency-menu-field-value">{pendingCurrencyLabel}</span>
										<select
											class="currency-menu-select-overlay"
											aria-label="Select currency"
											bind:value={pendingCurrency}
											on:change={handlePendingCurrencyChange}
										>
											{#each CURRENCY_OPTIONS as option}
												<option value={option.value}>
													{resolveCurrencySymbol(option.value)} | {resolveCurrencyLabel(
														option.value
													)}
												</option>
											{/each}
										</select>
										<ChevronDown
											size={16}
											class="currency-menu-caret currency-menu-caret-select"
											aria-hidden="true"
										/>
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
							<span
								class="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium"
							>
								{unreadCount > 9 ? '9+' : unreadCount}
							</span>
						{/if}
					</button>

					{#if isNotificationsOpen}
						<div
							class="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg z-50"
						>
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
						<span id="mobile-dashboard-menu-title" class="text-sm font-semibold text-white"
							>Menu</span
						>
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
								class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors {getMobileNavClass(
									item.href
								)}"
								on:click={() => (isMobileMenuOpen = false)}
							>
								<span>{item.label}</span>
							</a>
						{/each}
					</div>

					<div class="mt-4 border-t border-slate-700 pt-4 space-y-3">
							<div class="relative">
								<select
									class="lang-select w-full appearance-none rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors duration-150 hover:border-slate-500"
									aria-label="Language and currency"
									bind:value={pendingCurrency}
									on:change={handlePendingCurrencyChange}
							>
								{#each CURRENCY_OPTIONS as option}
									<option value={option.value}>
										{resolveCurrencySymbol(option.value)} | {resolveCurrencyLabel(option.value)}
									</option>
								{/each}
							</select>
								<ChevronDown
									class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-300"
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
		border: 1px solid #334155;
		border-radius: 0.88rem;
		background: rgba(15, 23, 42, 0.82);
		color: #f8fafc;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1;
		padding: 0.46rem 0.7rem;
		transition:
			border-color 140ms ease,
			background 140ms ease;
	}

	.currency-trigger:hover {
		border-color: #475569;
		background: rgba(15, 23, 42, 0.92);
	}

	.currency-trigger:focus-visible {
		border-color: #7e22ce;
		background: rgba(15, 23, 42, 0.96);
		outline: none;
	}

	.currency-trigger.is-open {
		border-color: #475569;
		background: rgba(15, 23, 42, 0.96);
	}

	.currency-trigger-value {
		white-space: nowrap;
	}

	.currency-trigger-divider {
		width: 1px;
		height: 0.85rem;
		background: #64748b;
	}

	.currency-trigger-chevron {
		margin-left: 0.22rem;
		color: #cbd5e1;
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
		background: #ffffff;
		color: #0f172a;
		display: flex;
		align-items: center;
		gap: 0.52rem;
		padding: 0 0.78rem;
		font-size: 0.94rem;
		font-weight: 700;
		position: relative;
		transition:
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.currency-menu-field:focus-within {
		border-color: #94a3b8;
		box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.18);
	}

	.currency-menu-prefix {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.08rem;
		color: #111827;
		line-height: 1;
		flex: 0 0 auto;
	}

	.currency-menu-language-prefix {
		min-width: 1.24rem;
	}

	.currency-menu-currency-prefix {
		font-size: 0.85rem;
		font-weight: 800;
	}

	.currency-menu-separator {
		color: #64748b;
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1;
	}

	.currency-menu-flag-image {
		width: 1.2rem;
		height: 0.9rem;
		border: 1px solid #cbd5e1;
		border-radius: 0.14rem;
		overflow: hidden;
		background-size: cover;
		background-position: center;
	}

	.currency-menu-flag-gb {
		background: url('/flags/gb.svg') center / cover no-repeat;
	}

	.currency-menu-flag-de {
		background: linear-gradient(
			180deg,
			#000000 0 33.33%,
			#dd0000 33.33% 66.66%,
			#ffce00 66.66% 100%
		);
	}

	.currency-menu-flag-es {
		background: linear-gradient(180deg, #aa151b 0 25%, #f1bf00 25% 75%, #aa151b 75% 100%);
	}

	.currency-menu-flag-fr {
		background: linear-gradient(
			90deg,
			#0055a4 0 33.33%,
			#ffffff 33.33% 66.66%,
			#ef4135 66.66% 100%
		);
	}

	.currency-menu-flag-it {
		background: linear-gradient(
			90deg,
			#009246 0 33.33%,
			#ffffff 33.33% 66.66%,
			#ce2b37 66.66% 100%
		);
	}

	.currency-menu-flag-pl {
		background: linear-gradient(180deg, #ffffff 0 50%, #dc143c 50% 100%);
	}

	.currency-menu-flag-ro {
		background: linear-gradient(
			90deg,
			#002b7f 0 33.33%,
			#fcd116 33.33% 66.66%,
			#ce1126 66.66% 100%
		);
	}

	.currency-menu-flag-se {
		background:
			linear-gradient(90deg, transparent 29%, #fecd00 29% 40%, transparent 40%),
			linear-gradient(180deg, transparent 43%, #fecd00 43% 57%, transparent 57%), #006aa7;
	}

	.currency-menu-flag-no {
		background: url('/flags/no.svg') center / cover no-repeat;
	}

	.currency-menu-flag-dk {
		background: url('/flags/dk.svg') center / cover no-repeat;
	}

	.currency-menu-flag-fi {
		background:
			linear-gradient(90deg, transparent 27.8%, #003580 27.8% 44.4%, transparent 44.4%),
			linear-gradient(180deg, transparent 36.4%, #003580 36.4% 63.6%, transparent 63.6%), #ffffff;
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

	.currency-menu-select-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		appearance: none;
		border: 0;
		background: transparent;
		opacity: 0;
		cursor: pointer;
	}

	.currency-menu-select-overlay:focus {
		outline: none;
	}

	.currency-menu-caret {
		color: #4b5563;
		flex: 0 0 auto;
		pointer-events: none;
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
