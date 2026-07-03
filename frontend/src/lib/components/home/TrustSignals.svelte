<script lang="ts">
	import { Lock, Zap, CheckCircle, Globe } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';

	interface TrustSignal {
		icon: ComponentType;
		title: string;
		description: string;
	}

	const trustSignals: TrustSignal[] = [
		{
			icon: CheckCircle,
			title: 'Money-back guarantee',
			description:
				"If your access doesn't work as described, we fix it or refund you. Every order is covered."
		},
		{
			icon: Zap,
			title: 'Why are our prices low?',
			description:
				'We source access in volume from vetted suppliers and run a lean, digital-only operation. Those savings go to you — same products, lower price.'
		},
		{
			icon: Lock,
			title: 'Secure payments',
			description:
				'Payments are processed by our PCI-DSS certified payment provider. Your card details never touch our servers.'
		},
		{
			icon: Globe,
			title: 'Everything in one dashboard',
			description:
				'Track your orders, access details, renewals, and support conversations in one place.'
		}
	];
</script>

<section class="py-12 bg-white content-visibility-auto">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<svg aria-hidden="true" class="pointer-events-none absolute h-0 w-0 overflow-hidden">
			<defs>
				<linearGradient id="subslush-trust-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop offset="0%" stop-color="#7e22ce"></stop>
					<stop offset="100%" stop-color="#db2777"></stop>
				</linearGradient>
			</defs>
		</svg>

		<!-- Heading -->
		<div class="text-center mb-8">
			<h2 class="text-2xl font-bold text-gray-900 mb-1">Why SubSlush?</h2>
		</div>

		<!-- Trust Signal Cards -->
		<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
			{#each trustSignals as signal}
				<div class="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
					<div
						class="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-purple-100 bg-gradient-to-br from-purple-50 to-pink-50"
					>
						<svelte:component
							this={signal.icon}
							size={22}
							strokeWidth={2.25}
							class="trust-signal-icon"
						/>
					</div>
					<h3 class="text-base font-semibold text-gray-900 leading-snug">{signal.title}</h3>
					<p class="mt-2 text-sm text-gray-600 leading-relaxed">{signal.description}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	:global(.trust-signal-icon *) {
		stroke: url(#subslush-trust-gradient);
	}
</style>
