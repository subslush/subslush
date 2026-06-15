<script lang="ts">
	import {
		Building2,
		ShieldCheck,
		PackageCheck,
		Headphones,
		Globe,
		BadgeCheck
	} from 'lucide-svelte';
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>About Us - SubSlush</title>
	<meta
		name="description"
		content="Learn about SubSlush, operated by 3NITY Digital Limited, and how payments, support, and digital fulfilment are handled."
	/>
</svelte:head>

<div class="min-h-screen bg-white">
	<HomeNav />

	<section class="relative overflow-hidden py-12">
		<div
			class="absolute -top-24 right-0 h-64 w-64 rounded-full bg-cyan-100 blur-3xl opacity-60"
		></div>
		<div
			class="absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-pink-100 blur-3xl opacity-60"
		></div>

		<div class="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div
				class="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700"
			>
				<Building2 size={14} aria-hidden="true" />
				Company
			</div>
			<h1 class="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">About SubSlush</h1>
			<p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
				SubSlush is a digital goods and digital access platform operated by 3NITY Digital Limited, a
				company incorporated in Hong Kong.
			</p>
			<p class="mt-3 max-w-4xl text-sm leading-relaxed text-gray-600">
				SubSlush is not an open marketplace. Products are sold directly by 3NITY Digital Limited,
				trading as SubSlush.
			</p>
		</div>
	</section>

	<section class="pb-14">
		<div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid gap-5 md:grid-cols-2">
				<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
						<BadgeCheck size={18} class="text-cyan-600" aria-hidden="true" />
						Seller and merchant role
					</div>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						3NITY Digital Limited is the operator, contracting seller, merchant of record, refund
						party, payment-dispute party, and customer support party for purchases made through
						SubSlush.com.
					</p>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Your card statement may show 3NITY Digital Limited, SubSlush, or our payment processor
						descriptor.
					</p>
				</article>

				<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
						<PackageCheck size={18} class="text-cyan-600" aria-hidden="true" />
						Product model
					</div>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Products are fixed-term, prepaid digital access entitlements sold on a one-time purchase
						basis. No recurring billing or automatic renewal applies unless expressly stated on the
						product page.
					</p>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Delivery may use account activation, provisioned access, activation links or codes,
						workspace invitations, dashboard delivery, email, or another digital method shown before
						purchase.
					</p>
				</article>

				<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
						<ShieldCheck size={18} class="text-cyan-600" aria-hidden="true" />
						Product and pre-purchase clarity
					</div>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Product pages and checkout disclose core characteristics including duration, delivery
						method, activation method, region or account requirements where relevant, and refund
						limitations.
					</p>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Current categories include premium or upgraded-plan digital access for streaming, music,
						AI tools, design tools, productivity tools, and education tools.
					</p>
				</article>

				<article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
					<div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
						<Headphones size={18} class="text-cyan-600" aria-hidden="true" />
						Delivery, dashboard, and support
					</div>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Customers can track order status in the dashboard and receive email notifications when
						delivery is completed.
					</p>
					<p class="mt-3 text-sm leading-relaxed text-gray-700">
						Support is available via live chat during published hours and by email at
						<a href="mailto:hello@subslush.com" class="font-semibold text-cyan-700 hover:underline"
							>hello@subslush.com</a
						>. Legal and payment enquiries can be sent to
						<a
							href="mailto:compliance@subslush.com"
							class="font-semibold text-cyan-700 hover:underline">compliance@subslush.com</a
						>.
					</p>
				</article>
			</div>

			<div class="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
				<h2 class="text-base font-semibold text-gray-900">Legal company information</h2>
				<div class="mt-3 text-sm leading-relaxed text-gray-700">
					<p class="font-semibold text-gray-900">3NITY Digital Limited</p>
					<p>
						Role: Operator, contracting seller, merchant of record, fulfilment provider, refund
						party, and support party
					</p>
					<p>Business Registration No: 79886556</p>
					<p>
						Registered address: UNIT B, 12/F, HANG SENG CAUSEWAY BAY BUILDING, 28 YEE WO STREET,
						CAUSEWAY BAY, HONG KONG
					</p>
					<p>Email: compliance@subslush.com</p>
				</div>
			</div>

			<div
				class="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-r from-purple-50 via-white to-pink-50 p-5"
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-base font-semibold text-gray-900">Brand relationship disclosure</h2>
						<p class="mt-1 text-sm text-gray-600">
							SubSlush is not affiliated with, endorsed by, sponsored by, or officially partnered
							with any third-party platform unless expressly stated. All third-party names, logos,
							product names, and trademarks are the property of their respective owners and are used
							only to identify the relevant product or platform.
						</p>
					</div>
					<a
						href="/help"
						class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
					>
						<Globe size={16} aria-hidden="true" />
						Visit support
					</a>
				</div>
			</div>
		</div>
	</section>

	<Footer />
</div>
