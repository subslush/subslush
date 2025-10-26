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

	$: statusBadge = getStatusBadge();
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

			<!-- Enhanced Auto-renewal Status -->
			<div class="mt-3 pt-3 border-t border-gray-100">
				<div class="flex items-center justify-between text-sm">
					<span class="text-gray-600">Auto-renewal:</span>
					<div class="flex items-center">
						{#if autoRenew === 'Auto'}
							<span class="text-green-600 font-medium flex items-center">
								<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
								</svg>
								ON
							</span>
						{:else}
							<span class="text-gray-500 font-medium flex items-center">
								<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
								</svg>
								OFF
							</span>
						{/if}
					</div>
				</div>
				<p class="text-xs text-gray-500 mt-1">
					{#if autoRenew === 'Auto'}
						Renews automatically from your credit balance
					{:else}
						You'll be notified 3 days before renewal
					{/if}
				</p>
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