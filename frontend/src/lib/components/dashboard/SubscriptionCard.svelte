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

	// Status badge styling
	const statusStyles = {
		Active: 'bg-green-500 text-white',
		Expired: 'bg-gray-500 text-white',
		Pending: 'bg-yellow-500 text-white',
	};

	$: statusStyle = statusStyles[status];
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

				<!-- Status badge -->
				<span class="px-2 py-1 rounded-full text-xs font-medium {statusStyle}">
					{status}
				</span>
			</div>

			<!-- Plan badge -->
			<div class="mt-3 inline-flex items-center px-2 py-1 rounded bg-blue-50 border border-blue-200">
				<span class="text-xs font-medium text-blue-600">{planType} plan</span>
			</div>
		</div>

		<!-- Card body -->
		<div class="p-4 space-y-3">

			<!-- Pricing and renewal info -->
			<div class="flex items-center justify-between">
				<div>
					<p class="text-xs text-gray-500">Monthly cost</p>
					<p class="text-lg font-bold text-gray-900">{monthlyCost}</p>
				</div>
				<div class="text-right">
					<p class="text-xs text-gray-500">Renews in</p>
					<p class="text-sm font-semibold text-blue-600">{renewsIn}</p>
				</div>
			</div>

			<!-- Auto-renew status -->
			<div class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
				<span class="text-xs text-gray-600">Auto-renew:</span>
				<span class="text-xs font-semibold text-gray-900">{autoRenew}</span>
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