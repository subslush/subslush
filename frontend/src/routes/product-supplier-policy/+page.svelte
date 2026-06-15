<script lang="ts">
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>Product and Supplier Policy - SubSlush</title>
	<meta
		name="description"
		content="SubSlush Product and Supplier Policy for digital access products sold by 3NITY Digital Limited."
	/>
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
	<HomeNav />

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
		<header class="border-b border-gray-300 pb-6 mb-8">
			<h1 class="text-2xl font-semibold tracking-wide">Product and Supplier Policy</h1>
			<p class="mt-1 text-xs text-gray-600">Last updated: June 13, 2026</p>
		</header>

		<div class="space-y-8 text-sm leading-relaxed">
			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">1. Operator</h2>
				<p class="mt-2">
					SubSlush is operated by 3NITY Digital Limited. Product sourcing, supplier review, customer
					delivery, refunds, payment disputes, and customer support are handled by or on behalf of
					3NITY Digital Limited.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">2. Product categories</h2>
				<p class="mt-2">
					Current product categories include fixed-term premium or upgraded-plan digital access for
					streaming, music, AI tools, design tools, productivity tools, and education tools.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">3. Prohibited products</h2>
				<p class="mt-2">SubSlush does not sell:</p>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li>counterfeit goods, stolen accounts, hacked accounts, or illegal access;</li>
					<li>malware, phishing tools, or products intended for unauthorized system access;</li>
					<li>
						financial accounts, identity documents, regulated weapons, drugs, gambling access, or
						adult sexual services/products;
					</li>
					<li>products prohibited by our payment partners or applicable law.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">4. Supplier review</h2>
				<p class="mt-2">
					Suppliers should be reviewed before use. Products should only be sold if the supplier
					model and payment partner model allow the category.
				</p>
				<p class="mt-2">
					Delivery evidence and supplier confirmation should be retained for support, refund review,
					dispute handling, fraud prevention, and chargeback defence.
				</p>
			</section>
		</div>
	</div>

	<Footer />
</div>
