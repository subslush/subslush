<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import amexLogo from '$lib/assets/amex-logo.svg';
	import applePayLogo from '$lib/assets/apple-pay.svg';
	import sslSecuredBadge from '$lib/assets/256bit-ssl.webp';
	import dinersClubLogo from '$lib/assets/dinersclub-logo.svg';
	import discoverLogo from '$lib/assets/discover.webp';
	import googlePayLogo from '$lib/assets/google-pay.svg';
	import jcbLogo from '$lib/assets/jcb-logo.webp';
	import mastercardIdCheckBadge from '$lib/assets/mastercard-idcheck.svg';
	import mastercardLogo from '$lib/assets/mastercard-logo.webp';
	import monzoLogo from '$lib/assets/monzo-logo.webp';
	import paydoLogo from '$lib/assets/paydo-logo.webp';
	import payopLogo from '$lib/assets/payop-logo.svg';
	import revolutLogo from '$lib/assets/revolut-logo.webp';
	import sepaLogo from '$lib/assets/sepa-logo.webp';
	import swiftLogo from '$lib/assets/swift-logo.webp';
	import unionPayLogo from '$lib/assets/unionpay-logo.svg';
	import visaSecureBadge from '$lib/assets/visa-secure.webp';
	import visaLogo from '$lib/assets/visa.svg';
	import { resolveLogoKey, resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';
	import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
	import { checkoutService } from '$lib/api/checkout.js';
	import { auth } from '$lib/stores/auth.js';
	import type {
		CheckoutDraftLegalConsentState,
		CheckoutDraftState
	} from '$lib/utils/checkoutDraftState.js';
	import { loadCheckoutDraftState, saveCheckoutDraftState } from '$lib/utils/checkoutDraftState.js';
	import { openCrispChat } from '$lib/consent/thirdParty.js';
	import type {
		CheckoutAntomOptionQuote,
		CheckoutAntomResidence,
		CheckoutPayopMethodQuote
	} from '$lib/types/checkout.js';
	import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
	import { ArrowLeft, CreditCard, Globe2, Landmark, Loader2, MessageSquare, X } from 'lucide-svelte';

	const countryNames =
		browser && typeof Intl !== 'undefined' && 'DisplayNames' in Intl
			? new Intl.DisplayNames(['en'], { type: 'region' })
			: null;

	const defaultTaxResidence: CheckoutAntomResidence = {
		id: 'outside_eu',
		label: 'Outside the EU',
		rate_bps: 0
	};

	type CheckoutSummaryItem = {
		order_item_id: string;
		label: string;
		logo_key?: string | null;
		total_cents: number;
		currency: string;
	};

	let draftState: CheckoutDraftState | null = null;
	let checkoutSessionKey: string | null = null;
	let orderId: string | null = null;
	let draftEmail = '';
	let draftGuestIdentityId: string | null = null;
	let appliedCouponCode: string | null = null;
	let legalConsent: CheckoutDraftLegalConsentState = {
		immediateFulfillmentConsent: true,
		termsPolicyConsent: true
	};

	let loading = true;
	let refreshingMethods = false;
	let creatingSession = false;
	let loadError = '';
	let actionError = '';

	let displayCurrency = 'USD';
	let displayTotalCents = 0;
	let selectedCountry: string | null = null;
	let selectedTaxResidence = 'outside_eu';
	let countryOptions: string[] = [];
	let methods: CheckoutPayopMethodQuote[] = [];
	let antomOptions: CheckoutAntomOptionQuote[] = [];
	let taxResidences: CheckoutAntomResidence[] = [];
	let selectedTaxResidenceOption: CheckoutAntomResidence = defaultTaxResidence;
	let selectedTaxResidenceLabel = 'Outside the EU | 0%';
	let selectedProvider: 'antom' | 'payop' | null = null;
	let selectedAntomOptionId: CheckoutAntomOptionQuote['option_id'] | null = null;
	let selectedMethodId: number | null = null;
	let selectedAntomOption: CheckoutAntomOptionQuote | null = null;
	let selectedMethod: CheckoutPayopMethodQuote | null = null;
	let summaryCurrency = 'USD';
	let summarySubtotalCents = 0;
	let summaryFeeCents: number | null = null;
	let summaryTaxCents = 0;
	let summaryTotalCents = 0;
	let summaryItems: CheckoutSummaryItem[] = [];
	let checkoutContactEmail = '';
	let displayReferenceTotalCents: number | null = null;
	let showDisplayTotalReference = false;
	let requestCounter = 0;
	let taxModalOpen = false;
	let taxDialogElement: HTMLDivElement | null = null;
	let taxTriggerElement: HTMLButtonElement | null = null;

	const resolveCountryLabel = (countryCode: string | null | undefined): string => {
		const normalized = (countryCode || '').trim().toUpperCase();
		if (!normalized) {
			return 'Unknown';
		}
		return countryNames?.of(normalized) || normalized;
	};

	const formatCents = (amountCents: number, currencyCode: string): string =>
		formatCurrency(amountCents / 100, normalizeCurrencyCode(currencyCode) || 'USD');

	const formatTaxRate = (rateBps: number): string =>
		`${(rateBps / 100).toFixed(rateBps % 100 === 0 ? 0 : 1)}%`;

	const flagIconUrlForResidence = (residenceId: string): string => {
		const normalized = residenceId === 'outside_eu' ? 'eu' : residenceId.trim().toLowerCase();
		return /^[a-z]{2}$/.test(normalized) ? `https://flagcdn.com/w40/${normalized}.png` : '';
	};

	const resolveSummaryInitials = (label: string): string => {
		const normalized = label.trim();
		if (!normalized) {
			return 'SS';
		}
		const words = normalized.split(/\s+/).filter(Boolean);
		const initials = words
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('');
		return initials || normalized.slice(0, 2).toUpperCase();
	};

	const summaryItemNeedsDarkTile = (item: CheckoutSummaryItem): boolean =>
		[item.logo_key, item.label]
			.filter((value): value is string => typeof value === 'string')
			.some((value) =>
				value
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '')
					.includes('appletv')
			);

	const resolveTaxResidenceForDisplay = (
		currentProvider: 'antom' | 'payop' | null,
		currentAntomOption: CheckoutAntomOptionQuote | null,
		currentResidenceId: string,
		availableResidences: CheckoutAntomResidence[]
	): CheckoutAntomResidence => {
		if (
			currentProvider === 'antom' &&
			currentAntomOption &&
			currentAntomOption.tax_residence_id === currentResidenceId
		) {
			return {
				id: currentAntomOption.tax_residence_id,
				label: currentAntomOption.tax_residence_label,
				rate_bps: currentAntomOption.tax_rate_bps
			};
		}

		return (
			availableResidences.find((residence) => residence.id === currentResidenceId) ??
			(currentProvider === 'antom' && currentAntomOption
				? {
						id: currentAntomOption.tax_residence_id,
						label: currentAntomOption.tax_residence_label,
						rate_bps: currentAntomOption.tax_rate_bps
					}
				: defaultTaxResidence)
		);
	};

	const selectAntomOption = (option: CheckoutAntomOptionQuote): void => {
		selectedProvider = 'antom';
		selectedAntomOptionId = option.option_id;
		selectedMethodId = null;
		actionError = '';
		persistDraftState();
	};

	const selectPayopMethod = (method: CheckoutPayopMethodQuote): void => {
		selectedProvider = 'payop';
		selectedMethodId = method.method_id;
		selectedAntomOptionId = null;
		actionError = '';
		persistDraftState();
	};

	const openTaxModal = (): void => {
		taxModalOpen = true;
		if (browser) {
			requestAnimationFrame(() => {
				const activeButton = taxDialogElement?.querySelector<HTMLButtonElement>(
					`button[data-residence-id="${selectedTaxResidence}"]`
				);
				(activeButton || taxDialogElement)?.focus();
			});
		}
	};

	const closeTaxModal = (): void => {
		taxModalOpen = false;
		if (browser) {
			requestAnimationFrame(() => taxTriggerElement?.focus());
		}
	};

	const handleTaxModalKeydown = (event: KeyboardEvent): void => {
		if (!taxModalOpen || !taxDialogElement) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			closeTaxModal();
			return;
		}
		if (event.key !== 'Tab') {
			return;
		}

		const focusable = Array.from(
			taxDialogElement.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')
		).filter((element) => !element.hasAttribute('disabled'));
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) {
			return;
		}
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const paydoSupportLogos = [
		{ src: visaLogo, alt: 'Visa', className: 'h-5 w-full object-contain' },
		{
			src: mastercardLogo,
			alt: 'Mastercard',
			className: 'h-5 w-full object-contain'
		},
		{
			src: applePayLogo,
			alt: 'Apple Pay',
			className: 'h-5 w-full object-contain'
		},
		{ src: sepaLogo, alt: 'SEPA', className: 'h-8 w-full object-contain' },
		{ src: swiftLogo, alt: 'SWIFT', className: 'h-5 w-full object-contain' }
	] as const;

	const paymentTrustBadges = [
		{ src: visaSecureBadge, alt: 'Visa Secure', className: 'max-h-8 bg-white' },
		{ src: mastercardIdCheckBadge, alt: 'Mastercard ID Check', className: 'max-h-7' },
		{ src: sslSecuredBadge, alt: '256-bit SSL Secured', className: 'max-h-8' }
	] as const;

	const antomCardBrandLogos = [
		{ src: visaLogo, alt: 'Visa', className: 'h-5 w-full object-contain' },
		{ src: mastercardLogo, alt: 'Mastercard', className: 'h-5 w-full object-contain' },
		{ src: amexLogo, alt: 'American Express', className: 'h-7 w-full scale-125 object-contain' },
		{ src: discoverLogo, alt: 'Discover', className: 'h-7 w-full scale-125 object-contain' },
		{ src: dinersClubLogo, alt: 'Diners Club', className: 'h-5 w-full object-contain' },
		{ src: unionPayLogo, alt: 'UnionPay', className: 'h-7 w-full scale-125 object-contain' },
		{ src: jcbLogo, alt: 'JCB', className: 'h-5 w-full object-contain' }
	] as const;

	const resolveMethodLogo = (
		method: Pick<CheckoutPayopMethodQuote, 'method_id'>
	): string | null => {
		switch (method.method_id) {
			case 700001:
				return payopLogo;
			case 200002:
			case 210013:
				return paydoLogo;
			case 37000000:
				return revolutLogo;
			case 38000000:
				return monzoLogo;
			default:
				return null;
		}
	};

	const isPaydoMethod = (method: Pick<CheckoutPayopMethodQuote, 'method_id'>): boolean =>
		[700001, 200002, 210013].includes(method.method_id);

	const isPrimaryPaydoMethod = (method: Pick<CheckoutPayopMethodQuote, 'method_id'>): boolean =>
		method.method_id === 700001;

	const isBankIconMethod = (method: Pick<CheckoutPayopMethodQuote, 'method_id'>): boolean =>
		[30000018, 30001000].includes(method.method_id);

	const hasMethodSupportBadgeRow = (method: Pick<CheckoutPayopMethodQuote, 'method_id'>): boolean =>
		isPrimaryPaydoMethod(method);

	const resolveMethodLogoBoxClass = (
		method: Pick<CheckoutPayopMethodQuote, 'method_id'>
	): string =>
		isPaydoMethod(method)
			? 'flex h-12 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-1 py-1'
			: 'flex h-11 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-2';

	const resolveMethodLogoClass = (method: Pick<CheckoutPayopMethodQuote, 'method_id'>): string =>
		isPaydoMethod(method) ? 'h-full w-full object-contain' : 'max-h-6 w-auto object-contain';

	const persistDraftState = () => {
		if (!draftState?.email && !draftEmail) {
			return;
		}

		saveCheckoutDraftState({
			email: draftEmail || draftState?.email || '',
			guestIdentityId: draftGuestIdentityId,
			checkoutSessionKey,
			orderId,
			appliedCouponCode,
			selectedPaymentCountry: selectedCountry,
			selectedTaxResidence,
			selectedPaymentProvider: selectedProvider,
			selectedAntomOptionId,
			selectedPayopMethodId: selectedMethodId,
			legalConsent
		});
	};

	const getAccessPayload = (): { checkout_session_key: string } | { order_id: string } | null => {
		if (checkoutSessionKey) {
			return { checkout_session_key: checkoutSessionKey };
		}
		if (orderId) {
			return { order_id: orderId };
		}
		return null;
	};

	const resolvePreferredMethodId = (
		nextMethods: CheckoutPayopMethodQuote[],
		recommendedMethodId?: number | null
	): number | null => {
		const currentMatch = nextMethods.find((method) => method.method_id === selectedMethodId);
		if (currentMatch) {
			return currentMatch.method_id;
		}

		const recommendedMatch = nextMethods.find((method) => method.method_id === recommendedMethodId);
		if (recommendedMatch) {
			return recommendedMatch.method_id;
		}

		return nextMethods[0]?.method_id ?? null;
	};

	const loadPaymentOptions = async (options?: {
		countryCode?: string | null;
		taxResidenceId?: string | null;
		silent?: boolean;
	}): Promise<void> => {
		const accessPayload = getAccessPayload();
		if (!accessPayload) {
			await goto('/checkout');
			return;
		}

		const requestId = ++requestCounter;
		if (options?.silent) {
			refreshingMethods = true;
		} else {
			loading = true;
		}
		loadError = '';

		try {
			const [antomResult, payopResult] = await Promise.allSettled([
				checkoutService.getAntomOptions({
					...accessPayload,
					residence_id: options?.taxResidenceId ?? selectedTaxResidence
				}),
				checkoutService.getPayopOptions({
					...accessPayload,
					country_code: options?.countryCode ?? selectedCountry ?? null
				})
			]);

			if (requestId !== requestCounter) {
				return;
			}

			let antomLoaded = false;
			let payopLoaded = false;

			if (antomResult.status === 'fulfilled') {
				const response = antomResult.value;
				antomLoaded = true;
				antomOptions = response.options;
				taxResidences = response.residences;
				selectedTaxResidence =
					response.selected_residence_id || options?.taxResidenceId || selectedTaxResidence;
				orderId = response.order_id;
				displayCurrency = response.display_currency;
				displayTotalCents = response.display_total_cents;
				selectedTaxResidenceOption =
					response.residences.find((residence) => residence.id === selectedTaxResidence) ??
					selectedTaxResidenceOption;
			} else {
				antomOptions = [];
				if (taxResidences.length === 0) {
					taxResidences = [{ id: 'outside_eu', label: 'Outside the EU', rate_bps: 0 }];
				}
			}

			if (payopResult.status === 'fulfilled') {
				const response = payopResult.value;
				payopLoaded = true;
				orderId = response.order_id;
				if (!antomLoaded) {
					displayCurrency = response.display_currency;
					displayTotalCents = response.display_total_cents;
				}
				selectedCountry =
					response.selected_country ??
					options?.countryCode ??
					selectedCountry ??
					response.detected_country ??
					null;
				countryOptions = response.country_options;
				methods = response.methods;
				selectedMethodId = resolvePreferredMethodId(response.methods, response.selected_method_id);
			} else {
				methods = [];
				selectedMethodId = null;
			}

			const currentAntomSelection =
				selectedProvider === 'antom' &&
				antomOptions.some((option) => option.option_id === selectedAntomOptionId);
			const currentPayopSelection =
				selectedProvider === 'payop' &&
				methods.some((method) => method.method_id === selectedMethodId);

			if (!currentAntomSelection && !currentPayopSelection) {
				if (antomOptions.length > 0) {
					selectedProvider = 'antom';
					selectedAntomOptionId = antomOptions[0]?.option_id ?? null;
					selectedMethodId = null;
				} else if (methods.length > 0) {
					selectedProvider = 'payop';
					selectedMethodId = selectedMethodId ?? methods[0]?.method_id ?? null;
					selectedAntomOptionId = null;
				} else {
					selectedProvider = null;
					selectedAntomOptionId = null;
					selectedMethodId = null;
				}
			}

			if (!antomLoaded && !payopLoaded) {
				const antomMessage =
					antomResult.status === 'rejected' && antomResult.reason instanceof Error
						? antomResult.reason.message
						: null;
				const payopMessage =
					payopResult.status === 'rejected' && payopResult.reason instanceof Error
						? payopResult.reason.message
						: null;
				throw new Error(antomMessage || payopMessage || 'Unable to load payment methods.');
			}

			persistDraftState();
		} catch (error) {
			if (requestId !== requestCounter) {
				return;
			}
			loadError = error instanceof Error ? error.message : 'Unable to load payment methods.';
			methods = [];
			antomOptions = [];
			selectedMethodId = null;
			selectedAntomOptionId = null;
			selectedProvider = null;
		} finally {
			if (requestId === requestCounter) {
				loading = false;
				refreshingMethods = false;
			}
		}
	};

	const handleCountryChange = async (event: Event) => {
		const nextCountry = (event.currentTarget as HTMLSelectElement).value || null;
		selectedCountry = nextCountry;
		if (selectedProvider === 'payop') {
			selectedMethodId = null;
		}
		persistDraftState();
		await loadPaymentOptions({
			countryCode: nextCountry,
			silent: true
		});
	};

	const handleTaxResidenceSelect = async (residenceId: string) => {
		selectedTaxResidence = residenceId;
		selectedTaxResidenceOption =
			taxResidences.find((residence) => residence.id === residenceId) ?? selectedTaxResidenceOption;
		closeTaxModal();
		persistDraftState();
		await loadPaymentOptions({
			countryCode: selectedCountry,
			taxResidenceId: residenceId,
			silent: true
		});
	};

	const handleContinueToProvider = async () => {
		actionError = '';
		legalConsent = {
			immediateFulfillmentConsent: true,
			termsPolicyConsent: true
		};
		persistDraftState();

		const chosenAntomOption = antomOptions.find(
			(option) => option.option_id === selectedAntomOptionId
		);
		const chosenPayopMethod = methods.find((method) => method.method_id === selectedMethodId);
		if (
			(selectedProvider === 'antom' && !chosenAntomOption) ||
			(selectedProvider === 'payop' && !chosenPayopMethod) ||
			!selectedProvider
		) {
			actionError = 'Please choose an available payment method.';
			return;
		}

		const accessPayload = getAccessPayload();
		if (!accessPayload) {
			await goto('/checkout');
			return;
		}

		creatingSession = true;
		try {
			const legal_consent = {
				immediate_fulfillment_consent: legalConsent.immediateFulfillmentConsent,
				terms_policy_consent: legalConsent.termsPolicyConsent,
				consent_timestamp: new Date().toISOString(),
				checkout_session_key_snapshot: checkoutSessionKey,
				consent_source: 'checkout_payment_page'
			};
			const response =
				selectedProvider === 'antom' && chosenAntomOption
					? await checkoutService.createAntomSession({
							...accessPayload,
							option_id: chosenAntomOption.option_id,
							residence_id: selectedTaxResidence,
							legal_consent
						})
					: await checkoutService.createPayopSession({
							...accessPayload,
							method_id: chosenPayopMethod?.method_id ?? 0,
							country_code: selectedCountry,
							legal_consent
						});

			orderId = response.order_id;
			persistDraftState();
			window.location.assign(response.session_url);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Unable to start payment.';
		} finally {
			creatingSession = false;
		}
	};

	$: selectedAntomOption =
		antomOptions.find((option) => option.option_id === selectedAntomOptionId) ?? null;

	$: selectedTaxResidenceOption = resolveTaxResidenceForDisplay(
		selectedProvider,
		selectedAntomOption,
		selectedTaxResidence,
		taxResidences
	);

	$: selectedTaxResidenceLabel = `${selectedTaxResidenceOption.label} | ${formatTaxRate(
		selectedTaxResidenceOption.rate_bps
	)}`;

	$: selectedMethod = methods.find((method) => method.method_id === selectedMethodId) ?? null;

	$: summaryCurrency =
		selectedProvider === 'antom' && selectedAntomOption
			? selectedAntomOption.currency
			: selectedMethod?.processing_currency || displayCurrency;

	$: summarySubtotalCents =
		selectedProvider === 'antom' && selectedAntomOption
			? selectedAntomOption.subtotal_cents
			: selectedMethod?.processing_subtotal_cents ?? displayTotalCents;

	$: summaryFeeCents =
		selectedProvider === 'antom' && selectedAntomOption
			? selectedAntomOption.service_fee_cents
			: selectedMethod?.processing_fee_cents ?? null;

	$: summaryTaxCents =
		selectedProvider === 'antom' && selectedAntomOption ? selectedAntomOption.tax_cents : 0;

	$: summaryTotalCents =
		selectedProvider === 'antom' && selectedAntomOption
			? selectedAntomOption.total_cents
			: selectedMethod?.processing_total_cents ?? displayTotalCents;

	$: summaryItems =
		selectedProvider === 'antom' && selectedAntomOption
			? selectedAntomOption.items.map((item) => ({
					...item,
					currency: selectedAntomOption.currency
				}))
			: selectedMethod
				? selectedMethod.items.map((item) => ({
						...item,
						currency: selectedMethod.processing_currency
					}))
				: [];

	$: checkoutContactEmail = $auth.user?.email?.trim() || draftEmail || draftState?.email || '';

	$: displayReferenceTotalCents = selectedMethod?.display_total_cents ?? null;

	$: showDisplayTotalReference =
		selectedProvider === 'payop' &&
		Boolean(selectedMethod?.converted_from_display_currency) &&
		displayReferenceTotalCents !== null &&
		Boolean(normalizeCurrencyCode(displayCurrency)) &&
		normalizeCurrencyCode(displayCurrency) !== normalizeCurrencyCode(summaryCurrency);

	onMount(async () => {
		draftState = loadCheckoutDraftState();
		checkoutSessionKey = draftState?.checkoutSessionKey ?? null;
		orderId = draftState?.orderId ?? null;
		draftEmail = draftState?.email ?? '';
		draftGuestIdentityId = draftState?.guestIdentityId ?? null;
		appliedCouponCode = draftState?.appliedCouponCode ?? null;
		legalConsent = {
			immediateFulfillmentConsent: true,
			termsPolicyConsent: true
		};
		selectedCountry = draftState?.selectedPaymentCountry ?? null;
		selectedTaxResidence = draftState?.selectedTaxResidence ?? 'outside_eu';
		selectedProvider = draftState?.selectedPaymentProvider ?? null;
		selectedAntomOptionId = draftState?.selectedAntomOptionId ?? null;
		selectedMethodId = draftState?.selectedPayopMethodId ?? null;

		if (!checkoutSessionKey && !orderId) {
			await goto('/checkout');
			return;
		}

		await loadPaymentOptions({
			countryCode: selectedCountry,
			taxResidenceId: selectedTaxResidence
		});
	});
</script>

<svelte:head>
	<title>Payment Methods - SubSlush</title>
	<meta
		name="description"
		content="Choose your payment method and review your final payment total."
	/>
</svelte:head>

<div class="min-h-screen bg-white">
	<HomeNav />

	<main class="relative overflow-hidden">
		<div class="payment-top-glow pointer-events-none absolute inset-x-0 top-0 h-56"></div>

		<section class="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
			<a
				href="/checkout"
				class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
			>
				<ArrowLeft class="h-4 w-4" />
				Back to checkout
			</a>

			<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-start">
				<section class="space-y-4">
					<div
						class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:p-6"
					>
						<h1 class="text-xl font-bold text-slate-900">Payment methods</h1>
						<div class="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
							<p class="text-sm text-slate-700">
								Choose your country to see the payment methods available to you.
							</p>
							<div class="mt-3 max-w-sm">
								<select
									class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
									bind:value={selectedCountry}
									on:change={handleCountryChange}
									disabled={loading || creatingSession}
								>
									<option value="" disabled={!selectedCountry}>Select country</option>
									{#each countryOptions as countryCode}
										<option value={countryCode}>{resolveCountryLabel(countryCode)}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="mt-4 rounded-2xl border border-slate-200 bg-white">
							<div class="border-b border-slate-200 px-4 py-3">
								<div class="flex items-center justify-between gap-3">
									<p class="text-sm font-semibold text-slate-900">Available methods</p>
									{#if refreshingMethods}
										<div class="inline-flex items-center gap-2 text-xs text-slate-500">
											<Loader2 class="h-4 w-4 animate-spin" />
											Updating...
										</div>
									{/if}
								</div>
							</div>

							{#if loading}
								<div class="space-y-3 p-4">
									{#each Array.from({ length: 3 }) as _, index}
										<div
											class="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
											aria-hidden="true"
										>
											<div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
											<div class="mt-3 h-3 w-56 animate-pulse rounded bg-slate-100"></div>
										</div>
									{/each}
								</div>
							{:else if loadError}
								<div class="p-4">
									<div
										class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
									>
										{loadError}
									</div>
									<button
										type="button"
										class="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
										on:click={() => {
											void loadPaymentOptions({
												countryCode: selectedCountry
											});
										}}
									>
										Try again
									</button>
								</div>
							{:else if antomOptions.length === 0 && methods.length === 0}
								<div class="p-4">
									<div
										class="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600"
									>
										No payment methods are currently available for {selectedCountry
											? resolveCountryLabel(selectedCountry)
											: 'the selected country'}. Choose another country or return to checkout.
									</div>
								</div>
							{:else}
								<div class="p-4">
									<div class="space-y-3">
										{#each antomOptions as option}
											<button
												type="button"
												class={`w-full rounded-2xl border px-4 py-4 text-left transition ${
													selectedProvider === 'antom' &&
													selectedAntomOptionId === option.option_id
														? 'border-fuchsia-300 bg-fuchsia-50/40 shadow-sm'
														: 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
												}`}
												on:click={() => selectAntomOption(option)}
											>
												<div class="flex items-start gap-3">
													<div
														class={`mt-1 h-4 w-4 rounded-full border ${
															selectedProvider === 'antom' &&
															selectedAntomOptionId === option.option_id
																? 'border-fuchsia-500 ring-4 ring-fuchsia-100'
																: 'border-slate-300'
														}`}
													></div>
													<div class="min-w-0 flex-1">
														<div
															class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
														>
															<div class="min-w-0">
																<div class="flex items-start gap-3">
																	<div
																		class="flex h-11 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-2"
																	>
																		{#if option.option_id === 'apple_pay'}
																			<img
																				src={applePayLogo}
																				alt="Apple Pay"
																				class="h-5 w-full object-contain"
																				loading="lazy"
																			/>
																		{:else if option.option_id === 'google_pay'}
																			<img
																				src={googlePayLogo}
																				alt="Google Pay"
																				class="h-5 w-full object-contain"
																				loading="lazy"
																			/>
																		{:else}
																			<CreditCard class="h-6 w-6 text-slate-600" />
																		{/if}
																	</div>
																	<div class="min-w-0">
																		<p class="text-sm font-semibold text-slate-900">
																			{option.title}
																		</p>
																		<p class="mt-1 text-xs text-slate-500">{option.description}</p>
																		{#if option.option_id === 'cards'}
																			<div class="mt-2 flex flex-wrap items-center gap-1.5">
																				{#each antomCardBrandLogos as logo}
																					<div
																						class="flex h-9 w-12 items-center justify-center rounded-md border border-slate-200 bg-white px-1 py-1"
																					>
																						<img
																							src={logo.src}
																							alt={logo.alt}
																							class={logo.className}
																							loading="lazy"
																						/>
																					</div>
																				{/each}
																			</div>
																		{/if}
																	</div>
																</div>
															</div>
															<div class="shrink-0 text-left sm:text-right">
																<p class="text-sm font-semibold text-slate-900">
																	{formatCents(option.total_cents, option.currency)}
																</p>
																<p class="mt-1 text-xs text-slate-500">
																	Fee {formatCents(option.service_fee_cents, option.currency)}
																</p>
															</div>
														</div>
													</div>
												</div>
											</button>
										{/each}

										{#each methods as method}
											<button
												type="button"
												class={`w-full rounded-2xl border px-4 py-4 text-left transition ${
													selectedProvider === 'payop' && selectedMethodId === method.method_id
														? 'border-fuchsia-300 bg-fuchsia-50/40 shadow-sm'
														: 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
												}`}
												on:click={() => selectPayopMethod(method)}
											>
												<div class="flex items-start gap-3">
													<div
														class={`mt-1 h-4 w-4 rounded-full border ${
															selectedProvider === 'payop' && selectedMethodId === method.method_id
																? 'border-fuchsia-500 ring-4 ring-fuchsia-100'
																: 'border-slate-300'
														}`}
													></div>
													<div class="min-w-0 flex-1">
														<div
															class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
														>
															<div class="min-w-0">
																<div
																	class={`flex gap-3 ${
																		hasMethodSupportBadgeRow(method)
																			? 'items-start'
																			: 'items-center'
																	}`}
																>
																	{#if resolveMethodLogo(method) || isBankIconMethod(method)}
																		<div class={resolveMethodLogoBoxClass(method)}>
																			{#if resolveMethodLogo(method)}
																				<img
																					src={resolveMethodLogo(method) || undefined}
																					alt={isPrimaryPaydoMethod(method) ? 'Pay via PayDo (Payop)' : method.title}
																					class={resolveMethodLogoClass(method)}
																					loading="lazy"
																				/>
																			{:else if isBankIconMethod(method)}
																				<Landmark class="h-6 w-6 text-slate-500" />
																			{/if}
																		</div>
																	{/if}
																	<div class="min-w-0">
																		<p class="text-sm font-semibold text-slate-900">
																			{#if isPrimaryPaydoMethod(method)}
																				<span>
																					Pay via PayDo
																					<span
																						class="relative -top-1 ml-1 inline-block text-[0.65rem] font-bold leading-none text-slate-700"
																					>
																						(Payop)
																					</span>
																				</span>
																			{:else}
																				{method.title}
																			{/if}
																		</p>
																		{#if hasMethodSupportBadgeRow(method)}
																			<div class="mt-2 flex flex-wrap items-center gap-1.5">
																				{#each paydoSupportLogos as logo}
																					<div
																						class="flex h-9 w-12 items-center justify-center rounded-md border border-slate-200 bg-white px-1 py-1"
																					>
																						<img
																							src={logo.src}
																							alt={logo.alt}
																							class={logo.className}
																							loading="lazy"
																						/>
																					</div>
																				{/each}
																			</div>
																		{/if}
																	</div>
																</div>
															</div>
															<div class="shrink-0 text-left sm:text-right">
																<p class="text-sm font-semibold text-slate-900">
																	{formatCents(
																		method.processing_total_cents,
																		method.processing_currency
																	)}
																</p>
																<p class="mt-1 text-xs text-slate-500">
																	Fee {formatCents(
																		method.processing_fee_cents,
																		method.processing_currency
																	)}
																</p>
															</div>
														</div>
													</div>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<div class="mt-3 flex justify-start">
							<button
								type="button"
								class="inline-flex max-w-full items-center gap-2 rounded-md px-0 py-1 text-left text-xs text-slate-600 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
								on:click={openTaxModal}
								bind:this={taxTriggerElement}
								disabled={loading || creatingSession}
							>
								<Globe2 class="h-3.5 w-3.5 shrink-0 text-slate-500" />
								<span class="font-semibold text-slate-800">Tax residence</span>
								<span class="truncate">{selectedTaxResidenceLabel}</span>
							</button>
						</div>
					</div>
				</section>

				<aside class="lg:sticky lg:top-24">
					<div
						class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:p-6"
					>
						{#if summaryItems.length > 0}
							<div class="space-y-2.5">
								{#each summaryItems as item (item.order_item_id)}
									{@const itemLogo =
										resolveLogoKey(item.logo_key || null) || resolveLogoKeyFromName(item.label)}
									{@const needsDarkTile = summaryItemNeedsDarkTile(item)}
									<div
										class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
									>
										<div class="flex min-w-0 items-center gap-3">
											<div
												class={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${
													needsDarkTile ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'
												}`}
											>
												{#if itemLogo}
													<ResponsiveImage
														image={itemLogo}
														alt={`${item.label} logo`}
														sizes="48px"
														pictureClass="block h-full w-full"
														imgClass={needsDarkTile
															? 'h-full w-full object-contain object-center p-1.5'
															: 'h-full w-full object-cover object-center'}
														loading="lazy"
														decoding="async"
													/>
												{:else}
													<span class="text-xs font-black uppercase text-slate-800">
														{resolveSummaryInitials(item.label)}
													</span>
												{/if}
											</div>
											<p class="min-w-0 truncate text-sm font-semibold text-slate-900">
												{item.label}
											</p>
										</div>
										<div class="flex min-h-12 shrink-0 items-center justify-end text-sm font-semibold text-slate-900">
											{formatCents(item.total_cents, item.currency)}
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<div class={`${summaryItems.length > 0 ? 'mt-4' : ''} space-y-3 text-sm text-slate-600`}>
							<div class="flex items-center justify-between gap-4">
								<span>Subtotal</span>
								<span class="font-semibold text-slate-900">
									{formatCents(summarySubtotalCents, summaryCurrency)}
								</span>
							</div>
							<div class="flex items-center justify-between gap-4">
								<span>Service fee</span>
								<span class="font-semibold text-slate-900">
									{#if summaryFeeCents !== null}
										{formatCents(summaryFeeCents, summaryCurrency)}
									{:else}
										--
									{/if}
								</span>
							</div>
							<div class="flex items-center justify-between gap-4">
								<span>Tax included</span>
								<span class="font-semibold text-slate-900">
									{formatCents(summaryTaxCents, summaryCurrency)}
								</span>
							</div>
						</div>

						<div class="mx-1 mt-4 border-t border-slate-200"></div>

						<p class="mt-3 text-[11px] leading-5 text-slate-500">
							Your e-mail: {checkoutContactEmail || 'Not provided'}
						</p>

						<div class="mt-3 space-y-1">
							<div class="flex items-center justify-between gap-4 text-base font-bold text-slate-900">
								<span>Total</span>
								<span class="text-2xl font-black leading-none tracking-tight text-slate-900">
									{formatCents(summaryTotalCents, summaryCurrency)}
								</span>
							</div>
							{#if showDisplayTotalReference}
								<p class="text-right text-xs font-medium text-slate-500">
									({formatCents(displayReferenceTotalCents ?? 0, displayCurrency)})
								</p>
							{/if}
						</div>

						{#if actionError}
							<div
								class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
							>
								{actionError}
							</div>
						{/if}

						<button
							type="button"
							class="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-slate-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
							on:click={openCrispChat}
						>
							<MessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
							Questions? Chat with us — we're happy to help.
						</button>

						<div class="mt-5 grid grid-cols-3 items-center gap-3">
							{#each paymentTrustBadges as badge}
								<div class="flex min-w-0 items-center justify-center">
									<img
										src={badge.src}
										alt={badge.alt}
										class={`h-auto w-auto max-w-full object-contain ${badge.className}`}
										loading="lazy"
									/>
								</div>
							{/each}
						</div>

						<button
							type="button"
							class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(126,34,206,0.28)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
							on:click={() => {
								void handleContinueToProvider();
							}}
							disabled={
								!(selectedAntomOption || selectedMethod) ||
								creatingSession ||
								refreshingMethods ||
								loading
							}
						>
							{#if creatingSession}
								<Loader2 class="h-4 w-4 animate-spin" />
							{/if}
							PAY
						</button>

						<p class="mt-3 text-[11px] leading-5 text-slate-500">
							By clicking PAY I confirm I have read and agreed to the
							<a href="/terms" class="underline underline-offset-2 hover:text-slate-900"
								>Terms and Conditions</a
							>,
							<a href="/returns" class="underline underline-offset-2 hover:text-slate-900"
								>Refund Policy</a
							>, and
							<a href="/privacy" class="underline underline-offset-2 hover:text-slate-900"
								>Privacy Policy</a
							>.
						</p>
					</div>
				</aside>
			</div>
		</section>
	</main>

	{#if taxModalOpen}
		<div
			class="fixed inset-0 z-50 flex items-end bg-slate-900/45 px-4 py-4 sm:items-center sm:justify-center"
			role="presentation"
			on:click={closeTaxModal}
		>
			<div
				class="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-none"
				role="dialog"
				aria-modal="true"
				aria-labelledby="tax-residence-title"
				tabindex="-1"
				bind:this={taxDialogElement}
				on:keydown={handleTaxModalKeydown}
				on:click|stopPropagation
			>
				<div class="flex items-center justify-between gap-4 px-6 py-5">
					<h2 id="tax-residence-title" class="text-base font-semibold text-slate-900">
						Place of residence
					</h2>
					<button
						type="button"
						class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
						on:click={closeTaxModal}
						aria-label="Close"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<div class="mx-6 border-t border-slate-200"></div>
				<div class="px-6 py-3">
					{#each taxResidences.filter((residence) => residence.id === 'outside_eu') as residence}
						{@const flagUrl = flagIconUrlForResidence(residence.id)}
						<button
							type="button"
							data-residence-id={residence.id}
							class={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
								selectedTaxResidence === residence.id
									? 'font-semibold text-fuchsia-700'
									: 'text-slate-700 hover:text-slate-950'
							}`}
							on:click={() => {
								void handleTaxResidenceSelect(residence.id);
							}}
						>
							{#if flagUrl}
								<img
									src={flagUrl}
									alt=""
									class="h-4 w-6 shrink-0 rounded-sm object-cover"
									loading="lazy"
									aria-hidden="true"
								/>
							{/if}
							<span>{residence.label}</span>
							<span class="text-slate-500">{formatTaxRate(residence.rate_bps)}</span>
						</button>
					{/each}
				</div>
				<div class="mx-6 border-t border-slate-200"></div>
				<div class="max-h-[58vh] overflow-y-auto px-6 py-4 sm:max-h-none sm:overflow-visible">
					<div class="grid gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
						{#each taxResidences.filter((residence) => residence.id !== 'outside_eu') as residence}
							{@const flagUrl = flagIconUrlForResidence(residence.id)}
							<button
								type="button"
								data-residence-id={residence.id}
								class={`flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
									selectedTaxResidence === residence.id
										? 'font-semibold text-fuchsia-700'
										: 'text-slate-700 hover:text-slate-950'
								}`}
								on:click={() => {
									void handleTaxResidenceSelect(residence.id);
								}}
							>
								{#if flagUrl}
									<img
										src={flagUrl}
										alt=""
										class="h-4 w-6 shrink-0 rounded-sm object-cover"
										loading="lazy"
										aria-hidden="true"
									/>
								{/if}
								<span class="truncate">{residence.label}</span>
								<span class="shrink-0 text-slate-500">{formatTaxRate(residence.rate_bps)}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<Footer />
</div>

<style>
	.payment-top-glow {
		background:
			radial-gradient(70% 120% at 8% 0%, rgba(192, 132, 252, 0.22), transparent 68%),
			radial-gradient(65% 100% at 92% 0%, rgba(244, 114, 182, 0.2), transparent 64%);
	}
</style>
