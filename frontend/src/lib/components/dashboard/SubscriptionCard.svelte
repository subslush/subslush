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

	$: statusColor = {
		Active: 'bg-green-100 text-green-800',
		Pending: 'bg-yellow-100 text-yellow-800',
		Expired: 'bg-red-100 text-red-800'
	}[status];

	$: progressPercentage = (seatsUsed / totalSeats) * 100;
	$: serviceInitial = serviceName.charAt(0).toUpperCase();
	$: sharedByInitials = sharedBy.split(' ').map(n => n.charAt(0)).join('').toUpperCase();
</script>

<div class="bg-white rounded-xl border border-gray-200 p-6 hover:scale-[1.02] hover:shadow-lg transition-all duration-200">
	<!-- Service Header -->
	<div class="flex items-start justify-between mb-4">
		<div class="flex items-center space-x-3">
			{#if serviceLogo}
				<img src={serviceLogo} alt={serviceName} class="w-10 h-10 rounded-lg" />
			{:else}
				<div class="w-10 h-10 bg-gradient-to-r from-subslush-blue to-subslush-purple rounded-lg flex items-center justify-center text-white font-semibold">
					{serviceInitial}
				</div>
			{/if}
			<div>
				<h3 class="font-semibold text-gray-900">{serviceName}</h3>
				<p class="text-sm text-gray-500">{serviceCategory}</p>
			</div>
		</div>
		<span class="px-2 py-1 text-xs font-medium rounded-full {statusColor}">
			{status}
		</span>
	</div>

	<!-- Plan Type Badge -->
	<div class="mb-3">
		<span class="px-3 py-1 text-xs font-medium bg-subslush-blue/10 text-subslush-blue rounded-full">
			{planType} plan
		</span>
	</div>

	<!-- Shared By -->
	<div class="flex items-center space-x-2 mb-4">
		<span class="text-sm text-gray-600">Shared by:</span>
		<div class="flex items-center space-x-2">
			{#if sharedByAvatar}
				<img src={sharedByAvatar} alt={sharedBy} class="w-5 h-5 rounded-full" />
			{:else}
				<div class="w-5 h-5 bg-gradient-to-r from-subslush-pink to-subslush-purple rounded-full flex items-center justify-center text-white text-xs font-medium">
					{sharedByInitials}
				</div>
			{/if}
			<span class="text-sm font-medium text-gray-900">{sharedBy}</span>
		</div>
	</div>

	<!-- Capacity -->
	<div class="mb-4">
		<div class="flex items-center justify-between mb-2">
			<span class="text-sm text-gray-600">Capacity</span>
			<span class="text-sm font-medium text-gray-900">{seatsUsed}/{totalSeats} seats</span>
		</div>
		<div class="w-full bg-gray-200 rounded-full h-2">
			<div
				class="bg-gradient-to-r from-subslush-blue to-subslush-purple h-2 rounded-full transition-all duration-300"
				style="width: {progressPercentage}%"
			></div>
		</div>
		{#if isPlanFull}
			<p class="text-xs text-red-600 mt-1">Plan is full</p>
		{/if}
	</div>

	<!-- Pricing and Renewal -->
	<div class="grid grid-cols-2 gap-4 mb-4">
		<div>
			<p class="text-sm text-gray-600">Monthly cost</p>
			<p class="text-lg font-bold text-gray-900">{monthlyCost}</p>
		</div>
		<div>
			<p class="text-sm text-gray-600">Renews in</p>
			<p class="text-sm font-medium text-gray-900">{renewsIn}</p>
		</div>
	</div>

	<!-- Auto-renew status -->
	<div class="flex items-center justify-between mb-4">
		<span class="text-sm text-gray-600">Auto-renew:</span>
		<span class="text-sm font-medium" class:text-green-600={autoRenew === 'Auto'} class:text-gray-900={autoRenew === 'Manual'}>
			{autoRenew}
		</span>
	</div>

	<!-- Actions -->
	<div class="flex space-x-2">
		<button class="flex-1 btn variant-filled-primary text-sm py-2">
			Manage
		</button>
		<button class="flex-1 btn variant-ghost-surface text-sm py-2">
			Leave Plan
		</button>
	</div>
</div>