<script lang="ts">
	// Removed non-existent Card components - using Tailwind CSS instead
	import { User, Mail, Lock, Save } from 'lucide-svelte';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import axios from 'axios';
	import { env } from '$env/dynamic/public';

	const API_URL = env.PUBLIC_API_URL || 'http://localhost:3001';

	let firstName = '';
	let lastName = '';
	let email = '';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let formErrors: Record<string, string> = {};

	const profileQuery = createQuery({
		queryKey: ['profile'],
		queryFn: async () => {
			const response = await axios.get(`${API_URL}/profile`, {
				withCredentials: true
			});
			return response.data;
		},
		// onSuccess is deprecated in TanStack Query v5 - moved to reactive statement
	});

	const updateProfileMutation = createMutation({
		mutationFn: async (profileData: { firstName: string; lastName: string; email: string }) => {
			const response = await axios.put(`${API_URL}/profile`, profileData, {
				withCredentials: true
			});
			return response.data;
		},
		// onSuccess is deprecated in TanStack Query v5 - moved to reactive statement
		onError: (error: any) => {
			if (error.response?.data?.errors) {
				formErrors = error.response.data.errors;
			} else {
				formErrors = { general: 'Failed to update profile. Please try again.' };
			}
		}
	});

	const changePasswordMutation = createMutation({
		mutationFn: async (passwordData: { currentPassword: string; newPassword: string }) => {
			const response = await axios.put(`${API_URL}/profile/password`, passwordData, {
				withCredentials: true
			});
			return response.data;
		},
		// onSuccess is deprecated in TanStack Query v5 - moved to reactive statement
		onError: (error: any) => {
			if (error.response?.data?.errors) {
				formErrors = { ...formErrors, ...error.response.data.errors };
			} else {
				formErrors = { ...formErrors, password: 'Failed to change password. Please try again.' };
			}
		}
	});

	const handleProfileSubmit = (e: Event) => {
		e.preventDefault();
		formErrors = {};

		if (!firstName) {
			formErrors.firstName = 'First name is required';
		}
		if (!lastName) {
			formErrors.lastName = 'Last name is required';
		}
		if (!email) {
			formErrors.email = 'Email is required';
		}

		if (Object.keys(formErrors).length === 0) {
			$updateProfileMutation.mutate({ firstName, lastName, email });
		}
	};

	const handlePasswordSubmit = (e: Event) => {
		e.preventDefault();
		const passwordErrors: Record<string, string> = {};

		if (!currentPassword) {
			passwordErrors.currentPassword = 'Current password is required';
		}
		if (!newPassword) {
			passwordErrors.newPassword = 'New password is required';
		} else if (newPassword.length < 8) {
			passwordErrors.newPassword = 'Password must be at least 8 characters';
		}
		if (!confirmPassword) {
			passwordErrors.confirmPassword = 'Please confirm your password';
		} else if (newPassword !== confirmPassword) {
			passwordErrors.confirmPassword = 'Passwords do not match';
		}

		formErrors = { ...formErrors, ...passwordErrors };

		if (Object.keys(passwordErrors).length === 0) {
			$changePasswordMutation.mutate({ currentPassword, newPassword });
		}
	};

	// Handle profile query success using reactive statement
	$: if ($profileQuery.data) {
		firstName = $profileQuery.data.firstName || '';
		lastName = $profileQuery.data.lastName || '';
		email = $profileQuery.data.email || '';
	}

	// Handle profile update success using reactive statement
	$: if ($updateProfileMutation.isSuccess) {
		formErrors = {};
		// Show success message
	}

	// Handle password change success using reactive statement
	$: if ($changePasswordMutation.isSuccess) {
		currentPassword = '';
		newPassword = '';
		confirmPassword = '';
		formErrors = {};
		// Show success message
	}

	// Mock user data for demonstration
	if (!$profileQuery.data) {
		firstName = 'John';
		lastName = 'Doe';
		email = 'john.doe@example.com';
	}
</script>

<svelte:head>
	<title>Profile - Subscription Platform</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<div class="space-y-6">
		<!-- Header -->
		<div>
			<h1 class="h1 mb-2">Profile Settings</h1>
			<p class="text-surface-600-300-token">Manage your account information and security settings</p>
		</div>

		<!-- Profile Information -->
		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="mb-6">
				<h2 class="h3 flex items-center space-x-2">
					<User size={20} />
					<span>Profile Information</span>
				</h2>
			</div>

			<div>
				{#if formErrors.general}
					<div class="alert variant-filled-error mb-4">
						{formErrors.general}
					</div>
				{/if}

				<form on:submit={handleProfileSubmit} class="space-y-4">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="firstName" class="label">
								<span>First Name</span>
							</label>
							<input
								id="firstName"
								type="text"
								bind:value={firstName}
								class="input"
								class:input-error={formErrors.firstName}
								disabled={$updateProfileMutation.isPending}
							/>
							{#if formErrors.firstName}
								<span class="text-error-500 text-sm">{formErrors.firstName}</span>
							{/if}
						</div>

						<div>
							<label for="lastName" class="label">
								<span>Last Name</span>
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								class="input"
								class:input-error={formErrors.lastName}
								disabled={$updateProfileMutation.isPending}
							/>
							{#if formErrors.lastName}
								<span class="text-error-500 text-sm">{formErrors.lastName}</span>
							{/if}
						</div>
					</div>

					<div>
						<label for="email" class="label">
							<span class="flex items-center space-x-2">
								<Mail size={16} />
								<span>Email</span>
							</span>
						</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="input"
							class:input-error={formErrors.email}
							disabled={$updateProfileMutation.isPending}
						/>
						{#if formErrors.email}
							<span class="text-error-500 text-sm">{formErrors.email}</span>
						{/if}
					</div>

					<button
						type="submit"
						class="btn variant-filled-primary"
						disabled={$updateProfileMutation.isPending}
					>
						{#if $updateProfileMutation.isPending}
							<span class="loading loading-spinner loading-sm"></span>
							Updating...
						{:else}
							<Save size={16} />
							Save Changes
						{/if}
					</button>
				</form>
			</div>
		</div>

		<!-- Change Password -->
		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="mb-6">
				<h2 class="h3 flex items-center space-x-2">
					<Lock size={20} />
					<span>Change Password</span>
				</h2>
			</div>

			<div>
				<form on:submit={handlePasswordSubmit} class="space-y-4">
					<div>
						<label for="currentPassword" class="label">
							<span>Current Password</span>
						</label>
						<input
							id="currentPassword"
							type="password"
							bind:value={currentPassword}
							class="input"
							class:input-error={formErrors.currentPassword}
							disabled={$changePasswordMutation.isPending}
						/>
						{#if formErrors.currentPassword}
							<span class="text-error-500 text-sm">{formErrors.currentPassword}</span>
						{/if}
					</div>

					<div>
						<label for="newPassword" class="label">
							<span>New Password</span>
						</label>
						<input
							id="newPassword"
							type="password"
							bind:value={newPassword}
							class="input"
							class:input-error={formErrors.newPassword}
							disabled={$changePasswordMutation.isPending}
						/>
						{#if formErrors.newPassword}
							<span class="text-error-500 text-sm">{formErrors.newPassword}</span>
						{/if}
					</div>

					<div>
						<label for="confirmPassword" class="label">
							<span>Confirm New Password</span>
						</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="input"
							class:input-error={formErrors.confirmPassword}
							disabled={$changePasswordMutation.isPending}
						/>
						{#if formErrors.confirmPassword}
							<span class="text-error-500 text-sm">{formErrors.confirmPassword}</span>
						{/if}
					</div>

					<button
						type="submit"
						class="btn variant-filled-secondary"
						disabled={$changePasswordMutation.isPending}
					>
						{#if $changePasswordMutation.isPending}
							<span class="loading loading-spinner loading-sm"></span>
							Changing...
						{:else}
							<Lock size={16} />
							Change Password
						{/if}
					</button>
				</form>
			</div>
		</div>

		<!-- Account Statistics -->
		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="mb-6">
				<h2 class="h3">Account Statistics</h2>
			</div>

			<div>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div class="text-center p-4 bg-surface-100-800-token rounded-lg">
						<div class="text-2xl font-bold text-primary-600">1,250</div>
						<div class="text-sm text-surface-600-300-token">Total Credits</div>
					</div>
					<div class="text-center p-4 bg-surface-100-800-token rounded-lg">
						<div class="text-2xl font-bold text-secondary-600">3</div>
						<div class="text-sm text-surface-600-300-token">Active Subscriptions</div>
					</div>
					<div class="text-center p-4 bg-surface-100-800-token rounded-lg">
						<div class="text-2xl font-bold text-tertiary-600">45</div>
						<div class="text-sm text-surface-600-300-token">Days Active</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>