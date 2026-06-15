<script lang="ts">
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>Acceptable Use and Customer Conduct Policy - SubSlush</title>
	<meta name="description" content="SubSlush Acceptable Use and Customer Conduct Policy." />
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
	<HomeNav />

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
		<header class="border-b border-gray-300 pb-6 mb-8">
			<h1 class="text-2xl font-semibold tracking-wide">
				Acceptable Use and Customer Conduct Policy
			</h1>
			<p class="mt-1 text-xs text-gray-600">Last updated: June 13, 2026</p>
		</header>

		<div class="space-y-8 text-sm leading-relaxed">
			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">1. Responsible use</h2>
				<p class="mt-2">
					Customers must use SubSlush and purchased digital access products lawfully, honestly, and
					according to applicable product, checkout, and third-party platform rules.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">2. Prohibited conduct</h2>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li>fraud, payment abuse, stolen payment methods, or chargeback misuse;</li>
					<li>
						unauthorized resale, credential sharing beyond permitted use, or attempts to bypass
						product limits;
					</li>
					<li>harassment, threats, abusive support conduct, or knowingly false claims;</li>
					<li>
						unauthorized access, security probing, scraping, malware, phishing, or service
						disruption;
					</li>
					<li>use that violates applicable law or third-party platform terms.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">3. Enforcement</h2>
				<p class="mt-2">
					We may delay fulfilment, request verification, refuse service, suspend access, decline
					refunds, or provide dispute evidence where we identify fraud, abuse, or policy violations.
					Mandatory legal rights remain unaffected.
				</p>
			</section>
		</div>
	</div>

	<Footer />
</div>
