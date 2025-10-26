<script lang="ts">
	export let serviceName: string;
	export let serviceCategory: string;
	export let serviceLogo: string | null = null;
	export let status: 'Active' | 'Pending' | 'Expired' = 'Active';
	export let planType: string = 'Premium';
	export let sharedBy: string;
	export let sharedByAvatar: string | null = null;
	export let seatsUsed: number;
	export let totalSeats: number;
	export let monthlyCost: string;
	export let renewsIn: string;
	export let autoRenew: 'Auto' | 'Manual' = 'Manual';
	export let isPlanFull: boolean = false;
	export let enhancedStatusBadge: any = null;

	// Service icon mapping (you can expand this)
	const serviceIcons: Record<string, string> = {
		'Netflix': '🎬',
		'Spotify': '🎵',
		'TradingView': '📈',
		'HBO Max': '🎭',
		'Disney+': '🏰',
		'YouTube Premium': '📺',
		'Adobe Creative': '🎨',
		'Figma': '🎯',
		'GitHub': '👨‍💻',
		'Notion': '📝'
	};

	$: serviceIcon = serviceIcons[serviceName] || '📦';
	$: progressPercentage = (seatsUsed / totalSeats) * 100;
	$: serviceInitial = serviceName.charAt(0).toUpperCase();
	$: sharedByInitials = sharedBy.split(' ').map(n => n.charAt(0)).join('').toUpperCase();

	// Enhanced status badge function
	function getStatusBadge() {
		const daysUntilRenewal = parseInt(renewsIn);

		if (daysUntilRenewal <= 3) {
			return {
				text: 'Renewing Soon',
				class: 'bg-amber-100 text-amber-800 border border-amber-200',
				icon: '⏰'
			};
		} else if (status === 'Active') {
			return {
				text: 'Active',
				class: 'bg-green-100 text-green-800 border border-green-200',
				icon: '✓'
			};
		}
		return {
			text: status,
			class: 'bg-gray-100 text-gray-800 border border-gray-200',
			icon: '○'
		};
	}

	$: statusBadge = enhancedStatusBadge || getStatusBadge();

	/**
	 * Handles toggling auto-renewal for a subscription
	 * NOTE: This assumes backend endpoint exists. If not, this implements
	 * optimistic UI update with local state.
	 */
	async function handleToggleAutoRenewal(subscriptionId: string, newStatus: boolean) {
		try {
			// TODO: Replace with actual API call when endpoint is ready
			// await apiClient.patch(`/api/v1/subscriptions/${subscriptionId}/auto-renew`, {
			//   autoRenew: newStatus
			// });

			// TEMPORARY: Optimistic UI update (update local state)
			autoRenew = newStatus ? 'Auto' : 'Manual';

			// TODO: Show success toast notification
			console.log(`Auto-renewal ${newStatus ? 'enabled' : 'disabled'} for subscription:`, subscriptionId);

		} catch (error) {
			console.error('Failed to toggle auto-renewal:', error);
			// TODO: Show error toast notification
		}
	}
</script>

<div class="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300">
		<!-- Header -->
		<div class="bg-gray-50 p-4 border-b border-gray-200">
			<div class="flex items-start justify-between">
				<div class="flex items-center space-x-3">
					<!-- Service icon without background -->
					<div class="w-8 h-8 flex items-center justify-center text-lg">
						{#if serviceLogo}
							<img src={serviceLogo} alt={serviceName} class="w-6 h-6 rounded" />
						{:else}
							<span class="text-2xl">{serviceIcon}</span>
						{/if}
					</div>
					<div>
						<h3 class="font-semibold text-gray-900 text-base">{serviceName}</h3>
						<p class="text-xs text-gray-500">{serviceCategory}</p>
					</div>
				</div>

				<!-- Enhanced Status badge -->
				<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium {statusBadge.class}">
					<span class="mr-1">{statusBadge.icon}</span>
					{statusBadge.text}
				</span>
			</div>

			<!-- Plan badge -->
			<div class="mt-3 inline-flex items-center px-2 py-1 rounded bg-blue-50 border border-blue-200">
				<span class="text-xs font-medium text-blue-600">{planType} plan</span>
			</div>

			<!-- Critical Status Message for Low Balance -->
			{#if enhancedStatusBadge?.priority === 'critical'}
				<div class="mt-2 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 border border-orange-200">
					<span class="font-medium">Action needed:</span> Top up €{(parseFloat(monthlyCost.replace('€', '')) - (enhancedStatusBadge.userBalance || 0)).toFixed(2)} to cover renewal
				</div>
			{/if}
		</div>

		<!-- Card body -->
		<div class="p-4 space-y-3">

			<!-- Enhanced Price Display -->
			<div class="mb-2">
				<div class="text-2xl font-bold text-gray-900">{monthlyCost}</div>
				<div class="text-sm text-gray-500">per month</div>
			</div>

			<!-- Renewal info -->
			<div class="text-right">
				<p class="text-xs text-gray-500">Renews in</p>
				<p class="text-sm font-semibold text-blue-600">{renewsIn}</p>
			</div>

			<!-- Enhanced Auto-renewal Status with Toggle -->
			<div class="mt-3 pt-3 border-t border-gray-100">
				<div class="space-y-2">
					<!-- Status Display with Professional Toggle -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-gray-600 font-medium">Auto-renewal:</span>

						<!-- Professional Toggle Slider -->
						<button
							type="button"
							class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
								{autoRenew === 'Auto' ? 'bg-green-500' : 'bg-gray-300'}"
							role="switch"
							aria-checked={autoRenew === 'Auto'}
							aria-label="Toggle auto-renewal"
							on:click={() => handleToggleAutoRenewal(serviceName, autoRenew !== 'Auto')}
						>
							<!-- Sliding Circle -->
							<span
								class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
									{autoRenew === 'Auto' ? 'translate-x-6' : 'translate-x-1'}"
								aria-hidden="true"
							/>

							<!-- ON/OFF Text Labels -->
							<span
								class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white pointer-events-none"
								aria-hidden="true"
							>
								{#if autoRenew === 'Auto'}
									<span class="ml-[-4px]">ON</span>
								{:else}
									<span class="mr-[-4px]">OFF</span>
								{/if}
							</span>
						</button>
					</div>

					<!-- Explanation Text -->
					<p class="text-xs text-gray-500">
						{#if autoRenew === 'Auto'}
							✓ We'll automatically renew this subscription using your credit balance. You can cancel anytime.
						{:else}
							📧 We'll notify you 3 days before renewal so you can manually top up your balance.
						{/if}
					</p>
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex gap-2 pt-2">
				<button
					class="flex-1 px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors focus:ring-2 focus:ring-offset-2"
					style="background-color: #4FC3F7; focus:ring-color: #4FC3F7;"
					onmouseover="this.style.backgroundColor='#29B6F6'"
					onmouseout="this.style.backgroundColor='#4FC3F7'"
				>
					Manage
				</button>
				<button class="flex-1 px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors">
					Leave Plan
				</button>
			</div>
		</div>
</div>