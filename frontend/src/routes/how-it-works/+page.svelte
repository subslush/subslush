<script lang="ts">
	import {
		BadgeCheck,
		CheckCircle2,
		ChevronDown,
		PackageCheck,
		ShieldCheck,
		ShoppingBag,
		Sparkles,
		Users,
		Zap
	} from 'lucide-svelte';
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
	import { TRUSTPILOT_PROFILE_URL } from '$lib/config/siteLinks.js';

	type IconCard = {
		icon: typeof ShoppingBag;
		title: string;
		body: string;
	};

	type AccordionItem = {
		title: string;
		body: string;
		linkHref?: string;
		linkText?: string;
	};

	const orderingSteps: IconCard[] = [
		{
			icon: ShoppingBag,
			title: 'Order in minutes',
			body:
				'Pick your plan and check out as a guest with just your email. Pay by card, Apple Pay, or Google Pay.'
		},
		{
			icon: PackageCheck,
			title: 'We prepare your access',
			body:
				"Our team fulfills and verifies your order, usually within 24–72 hours. We'll notify by email when your subscription has been activated."
		},
		{
			icon: ShieldCheck,
			title: 'Enjoy — fully covered',
			body:
				"Your subscription term starts when your access is delivered, not when you order. If anything doesn't work as described, we fix it or refund you."
		}
	];

	const priceCards: IconCard[] = [
		{
			icon: Users,
			title: 'Volume sourcing',
			body: 'We source subscription access in volume from suppliers we review and vet before listing.'
		},
		{
			icon: Zap,
			title: 'Lean and digital-only',
			body: 'No warehouses, no shipping, no big offices. Low overhead means lower prices.'
		},
		{
			icon: Sparkles,
			title: 'Savings passed to you',
			body: 'Same premium services — you simply pay less for them.'
		}
	];

	const legitFacts = [
		{
			text:
				'SubSlush is operated by 3NITY Digital Limited, a registered company (Hong Kong Business Registration No. 79886556).'
		},
		{
			before: 'Every order is covered by our ',
			linkText: 'money-back guarantee',
			href: '/returns',
			after: ' - read the full policy.'
		},
		{
			text:
				'Payments are processed by our PCI-DSS certified payment provider. Your card details never touch our servers.'
		},
		{
			before: 'Human support: ',
			linkText: 'live chat during published hours and 24/7 email support',
			href: '/help',
			after: '.'
		},
		{
			before: 'Read independent customer reviews on ',
			linkText: 'Trustpilot',
			href: TRUSTPILOT_PROFILE_URL,
			after: '.',
			external: true
		}
	];

	const deliveryDetails: AccordionItem[] = [
		{
			title: 'How long does delivery take?',
			body:
				'Manual account-based delivery is usually completed within 24 hours and can take up to 72 hours. Activation codes are delivered through dashboard reveal when inventory is available.'
		},
		{
			title: 'How do I receive my access?',
			body:
				'You receive an email notification after delivery. For account-based products, activation codes, and many links, the relevant credentials or access details are available from the specific order in your dashboard.'
		},
		{
			title: 'How do activation links and invites work?',
			body:
				'Activation links may be delivered by dashboard, email, or support after verification. Workspace or team invite products are sent to the email address you entered during checkout, so check spam or junk if the invite is not in your inbox.'
		},
		{
			title: 'When does my subscription term start?',
			body:
				'Your subscription term starts when your access is delivered, not when you order.'
		},
		{
			title: 'What if something does not work?',
			body:
				'Contact support with your order ID for faster verification and fulfillment help. If anything does not work as described, our team will fix it or refund you under the money-back guarantee.'
		},
		{
			title: 'What delivery evidence is kept?',
			body:
				'SubSlush may keep delivery evidence such as timestamps, order ID, product ID, email delivery logs, activation logs, dashboard access logs, support records, supplier confirmation, IP/device risk signals, and customer communication history.'
		}
	];

	const commonQuestions: AccordionItem[] = [
		{
			title: 'Can I cancel or refund an order?',
			body:
				'If fulfillment has not started, cancellation is available with full refund. After delivery, remedies may still be available if a product is faulty, not as described, not delivered, or mandatory law requires it.',
			linkHref: '/returns',
			linkText: 'Read the Refund Policy'
		},
		{
			title: 'What does the guarantee cover?',
			body:
				"The guarantee covers orders that do not work as described. Support will try to resolve the issue first, then replace or refund when eligible under the policy.",
			linkHref: '/returns',
			linkText: 'Read the Money-Back Guarantee'
		},
		{
			title: 'Do I need an existing account?',
			body:
				'It depends on the service. In most cases you can choose a new account or your existing account, while some services require us to create a new account and provide it to you.'
		},
		{
			title: 'Is my payment information stored by SubSlush?',
			body:
				'No. Card payments are handled by a hosted payment provider, and SubSlush only receives confirmation and transaction references.'
		},
		{
			title: 'How can I pay?',
			body:
				'Available payment methods are shown at checkout and may vary by country, currency, risk review, and provider availability.'
		},
		{
			title: 'Where can I track my order?',
			body:
				'You can see order updates in your dashboard and confirmation email. Email support is available 24/7 if you need help finding an update.',
			linkHref: '/help',
			linkText: 'Contact support'
		}
	];
</script>

<svelte:head>
	<title>How It Works - Why SubSlush Is Cheaper & 100% Legit | SubSlush</title>
	<meta
		name="description"
		content="Learn how SubSlush ordering works, why premium subscription prices are lower, and how every order is covered by our money-back guarantee."
	/>
</svelte:head>

<div class="min-h-screen bg-white">
	<HomeNav />

	<main>
		<section class="border-b border-slate-200 bg-slate-50 py-14 sm:py-16">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div class="max-w-3xl">
					<div
						class="inline-flex items-center gap-2 rounded-full border border-purple-100 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700 shadow-sm"
					>
						<ShieldCheck size={14} aria-hidden="true" />
						Ordering guide
					</div>
					<h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
						How SubSlush works
					</h1>
					<p class="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
						Real premium subscriptions, lower prices, and a money-back guarantee on every order.
						Here's exactly how it works — and why it's safe to order.
					</p>
				</div>
			</div>
		</section>

		<section class="py-12">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div class="mb-6 flex items-end justify-between gap-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Ordering in 3 steps</p>
						<h2 class="mt-2 text-2xl font-bold text-slate-950">Ordering in 3 steps</h2>
					</div>
				</div>
				<div class="grid gap-4 md:grid-cols-3">
					{#each orderingSteps as step, index}
						<article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
							<div class="flex items-center gap-3">
								<div
									class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 text-purple-700"
								>
									<svelte:component this={step.icon} size={21} strokeWidth={2.25} />
								</div>
								<span class="text-xs font-bold uppercase tracking-wide text-slate-400">
									Step {index + 1}
								</span>
							</div>
							<h3 class="mt-4 text-base font-semibold text-slate-950">{step.title}</h3>
							<p class="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<section class="bg-slate-50 py-12">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div class="mb-6">
					<p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Pricing</p>
					<h2 class="mt-2 text-2xl font-bold text-slate-950">Why are our prices so low?</h2>
				</div>
				<div class="grid grid-cols-1 gap-5 sm:grid-cols-3">
					{#each priceCards as card}
						<article class="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
							<div
								class="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 text-purple-700"
							>
								<svelte:component this={card.icon} size={22} strokeWidth={2.25} />
							</div>
							<h3 class="text-base font-semibold leading-snug text-gray-900">{card.title}</h3>
							<p class="mt-2 text-sm leading-relaxed text-gray-600">{card.body}</p>
						</article>
					{/each}
				</div>
				<div class="mt-6 rounded-lg border border-purple-100 bg-purple-50 px-5 py-4 text-sm leading-6 text-slate-700">
					If a price looks too good to be true, it's fair to be skeptical — we would be too. That's
					why every order is backed by our money-back guarantee: you never have to risk your money
					to find out.
				</div>
			</div>
		</section>

		<section class="py-12">
			<div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div class="grid gap-8 lg:grid-cols-[0.8fr,1.2fr] lg:items-start">
					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Trust</p>
						<h2 class="mt-2 text-2xl font-bold text-slate-950">Is SubSlush legit?</h2>
					</div>
					<div class="space-y-3">
						{#each legitFacts as fact}
							<div class="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
								<CheckCircle2 class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
								<p class="text-sm leading-6 text-slate-700">
									{#if fact.text}
										{fact.text}
									{:else}
										{fact.before}<a
											href={fact.href}
											target={fact.external ? '_blank' : undefined}
											rel={fact.external ? 'noopener noreferrer' : undefined}
											class="font-semibold text-cyan-700 underline-offset-2 hover:underline"
											>{fact.linkText}</a
										>{fact.after}
									{/if}
								</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section class="bg-slate-50 py-12">
			<div class="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
				<div>
					<p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Fulfillment</p>
					<h2 class="mt-2 text-2xl font-bold text-slate-950">Delivery details</h2>
					<div class="mt-5 space-y-3">
						{#each deliveryDetails as item}
							<details class="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
								<summary class="flex cursor-pointer list-none items-center justify-between gap-4">
									<span class="text-sm font-semibold text-slate-950">{item.title}</span>
									<ChevronDown
										size={16}
										class="shrink-0 text-slate-500 transition group-open:rotate-180"
										aria-hidden="true"
									/>
								</summary>
								<p class="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
							</details>
						{/each}
					</div>
				</div>

				<div>
					<p class="text-xs font-semibold uppercase tracking-wide text-cyan-600">Common questions</p>
					<h2 class="mt-2 text-2xl font-bold text-slate-950">Common questions</h2>
					<div class="mt-5 space-y-3">
						{#each commonQuestions as item}
							<details class="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
								<summary class="flex cursor-pointer list-none items-center justify-between gap-4">
									<span class="text-sm font-semibold text-slate-950">{item.title}</span>
									<ChevronDown
										size={16}
										class="shrink-0 text-slate-500 transition group-open:rotate-180"
										aria-hidden="true"
									/>
								</summary>
								<div class="mt-3 space-y-2 text-sm leading-6 text-slate-600">
									<p>{item.body}</p>
									{#if item.linkHref && item.linkText}
										<a
											href={item.linkHref}
											class="inline-flex font-semibold text-cyan-700 underline-offset-2 hover:underline"
										>
											{item.linkText}
										</a>
									{/if}
								</div>
							</details>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<section class="py-14">
			<div class="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
				<div
					class="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 text-purple-700"
				>
					<BadgeCheck size={24} strokeWidth={2.25} aria-hidden="true" />
				</div>
				<h2 class="mt-4 text-2xl font-bold text-slate-950">Ready to save on your subscriptions?</h2>
				<a
					href="/browse"
					class="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(126,34,206,0.28)] transition hover:opacity-95"
				>
					Browse all products
				</a>
				<p class="mt-3 text-xs font-medium text-slate-500">
					Money-back guarantee on every order.
				</p>
			</div>
		</section>
	</main>

	<Footer />
</div>
