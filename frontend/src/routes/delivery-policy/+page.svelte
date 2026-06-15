<script lang="ts">
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>Delivery Policy - SubSlush</title>
	<meta name="description" content="SubSlush Delivery Policy for digital access products." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
	<HomeNav />

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
		<header class="border-b border-gray-300 pb-6 mb-8">
			<h1 class="text-2xl font-semibold tracking-wide">Delivery Policy</h1>
			<p class="mt-1 text-xs text-gray-600">Last updated: June 13, 2026</p>
		</header>

		<div class="space-y-8 text-sm leading-relaxed">
			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">1. Digital delivery</h2>
				<p class="mt-2">
					Products are delivered digitally by 3NITY Digital Limited, trading as SubSlush. Delivery
					may occur through account activation, provisioned account access, activation link,
					activation code, workspace invitation, dashboard delivery, email, or another digital
					method shown on the product page.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">
					2. When delivery is complete
				</h2>
				<p class="mt-2">
					A product is considered delivered once the relevant activation, access, code, link,
					invitation, credential, or dashboard item has been made available to the customer.
				</p>
				<p class="mt-2">
					Most orders are completed within 24 hours. Some may take up to 72 hours due to
					verification, supplier workflow, queue volume, or technical constraints.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">3. Delivery evidence</h2>
				<p class="mt-2">
					SubSlush may keep delivery evidence such as timestamps, order ID, product ID, email
					delivery logs, activation logs, dashboard access logs, support records, supplier
					confirmation, IP/device risk signals, and customer communication history.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">4. Support</h2>
				<p class="mt-2">
					If your order has not arrived within the stated delivery window, contact
					<a
						href="mailto:hello@subslush.com"
						class="underline underline-offset-2 text-gray-900 hover:text-gray-700"
						>hello@subslush.com</a
					>
					with your order ID and checkout email.
				</p>
			</section>
		</div>
	</div>

	<Footer />
</div>
