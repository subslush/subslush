<script lang="ts">
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>Third-Party Platform Disclaimer - SubSlush</title>
	<meta name="description" content="SubSlush third-party platform and trademark disclaimer." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
	<HomeNav />

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
		<header class="border-b border-gray-300 pb-6 mb-8">
			<h1 class="text-2xl font-semibold tracking-wide">Third-Party Platform Disclaimer</h1>
			<p class="mt-1 text-xs text-gray-600">Last updated: June 13, 2026</p>
		</header>

		<div class="space-y-8 text-sm leading-relaxed">
			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">1. Platform relationship</h2>
				<p class="mt-2">
					SubSlush is not affiliated with, endorsed by, sponsored by, or officially partnered with
					any third-party platform unless expressly stated.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">2. Trademarks</h2>
				<p class="mt-2">
					All third-party names, logos, product names, and trademarks are the property of their
					respective owners and are used only to identify the relevant product or platform.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">3. Third-party rules</h2>
				<p class="mt-2">
					Third-party platforms may have their own terms, account rules, access policies,
					catalogues, technical requirements, and service restrictions. Customers are responsible
					for using products lawfully.
				</p>
			</section>
		</div>
	</div>

	<Footer />
</div>
