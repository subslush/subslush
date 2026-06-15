<script lang="ts">
	import HomeNav from '$lib/components/home/HomeNav.svelte';
	import Footer from '$lib/components/home/Footer.svelte';
</script>

<svelte:head>
	<title>Refund Policy and Money Back Guarantee - SubSlush</title>
	<meta
		name="description"
		content="SubSlush Refund Policy for digital access products sold by 3NITY Digital Limited."
	/>
</svelte:head>

<div class="min-h-screen bg-white text-gray-900">
	<HomeNav />

	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-serif">
		<header class="border-b border-gray-300 pb-6 mb-8">
			<h1 class="text-2xl font-semibold tracking-wide">Refund Policy and Money Back Guarantee</h1>
			<p class="mt-1 text-xs text-gray-600">Last updated: June 13, 2026</p>
		</header>

		<div class="space-y-8 text-sm leading-relaxed">
			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">1. Scope</h2>
				<p class="mt-2">
					This policy applies to digital access products purchased from 3NITY Digital Limited
					through SubSlush.com. 3NITY Digital Limited is the seller, merchant of record, refund
					party, dispute party, and customer support party.
				</p>
				<p class="mt-2">
					Your purchase is a one-time prepaid digital access entitlement. No recurring billing or
					automatic renewal applies unless expressly stated on the product page.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">2. Digital product delivery</h2>
				<p class="mt-2">
					Products are delivered digitally. Once a product has been delivered, activated, redeemed,
					claimed, provisioned, or made available, it may not be possible to cancel or return it
					like a physical product.
				</p>
				<p class="mt-2">
					A product is considered delivered once the relevant activation, access, code, link,
					invitation, credential, or dashboard item has been made available to you.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">3. Refunds may be available</h2>
				<p class="mt-2">
					A refund, replacement, store credit, or other remedy may be available if:
				</p>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li>the product was not delivered;</li>
					<li>the product materially differs from what was purchased;</li>
					<li>activation fails due to a SubSlush or supplier issue;</li>
					<li>SubSlush cannot provide a working replacement or solution;</li>
					<li>a duplicate payment occurred.</li>
				</ul>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">4. Refunds may be declined</h2>
				<p class="mt-2">Refunds may be declined if:</p>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li>the product was delivered and works as described;</li>
					<li>you changed your mind after delivery;</li>
					<li>you provided incorrect delivery, email, account, or activation details;</li>
					<li>you violated third-party platform rules after delivery;</li>
					<li>there is attempted fraud, abuse, unauthorized resale, or chargeback misuse.</li>
				</ul>
				<p class="mt-2">Mandatory legal rights remain unaffected.</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">
					5. Third-party revocation or restriction
				</h2>
				<p class="mt-2">
					If access is later revoked or restricted by a third-party platform, SubSlush may provide
					troubleshooting, replacement, reactivation, store credit, or refund depending on the
					product, supplier terms, platform rules, evidence available, and the cause of the
					restriction.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">
					6. Delivery timing and delayed orders
				</h2>
				<p class="mt-2">Most orders are completed within 24 hours. Some may take up to 72 hours.</p>
				<p class="mt-2">
					If delivery is materially delayed, contact support for resolution or cancellation options.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">
					7. Digital-content withdrawal information
				</h2>
				<p class="mt-2">
					For digital products, checkout may ask you to request immediate digital performance and
					acknowledge that withdrawal rights may end once fulfilment begins. Where mandatory
					consumer law provides a remedy for faulty, not-as-described, not-delivered, or
					duplicate-payment cases, those rights remain available.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">8. How to request review</h2>
				<p class="mt-2">
					Contact support before opening a chargeback. Send requests to
					<a
						href="mailto:hello@subslush.com"
						class="underline underline-offset-2 text-gray-900 hover:text-gray-700"
						>hello@subslush.com</a
					>
					or through
					<a href="/help" class="underline underline-offset-2 text-gray-900 hover:text-gray-700"
						>/help</a
					>.
				</p>
				<p class="mt-2">
					Include order ID, product name, issue details, screenshots, error messages, and any
					relevant evidence.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">9. Refund timing</h2>
				<p class="mt-2">
					Approved refunds are initiated promptly, typically within 48-72 hours. Final settlement
					timing depends on the payment provider and banking network.
				</p>
			</section>

			<section>
				<h2 class="text-base font-semibold uppercase tracking-wide">10. Disputes and evidence</h2>
				<p class="mt-2">
					We may retain and submit order evidence for dispute handling, including timestamps, order
					ID, product ID, email delivery logs, activation logs, dashboard access logs, support
					records, supplier confirmation, IP/device risk signals, and customer communication
					history.
				</p>
			</section>
		</div>
	</div>
	<Footer />
</div>
