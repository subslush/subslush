<script lang="ts">
	import { Card, CardHeader, CardContent } from '@skeletonlabs/skeleton';
	import { User, Mail, Lock, Eye, EyeOff } from 'lucide-svelte';
	import { createMutation } from '@tanstack/svelte-query';
	import axios from 'axios';
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';

	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let showPassword = false;
	let showConfirmPassword = false;
	let formErrors = {};

	const API_URL = env.PUBLIC_API_URL || 'http://localhost:3001';

	const registerMutation = createMutation({
		mutationFn: async (userData: {
			firstName: string;
			lastName: string;
			email: string;
			password: string;
		}) => {
			const response = await axios.post(`${API_URL}/auth/register`, userData);
			return response.data;
		},
		onSuccess: () => {
			goto('/auth/login?message=Registration successful. Please sign in.');
		},
		onError: (error: any) => {
			console.error('Registration failed:', error);
			if (error.response?.data?.errors) {
				formErrors = error.response.data.errors;
			} else {
				formErrors = { general: 'Registration failed. Please try again.' };
			}
		}
	});

	const handleSubmit = (e: Event) => {
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
		if (!password) {
			formErrors.password = 'Password is required';
		} else if (password.length < 8) {
			formErrors.password = 'Password must be at least 8 characters';
		}
		if (!confirmPassword) {
			formErrors.confirmPassword = 'Please confirm your password';
		} else if (password !== confirmPassword) {
			formErrors.confirmPassword = 'Passwords do not match';
		}

		if (Object.keys(formErrors).length === 0) {
			$registerMutation.mutate({ firstName, lastName, email, password });
		}
	};

	const togglePasswordVisibility = () => {
		showPassword = !showPassword;
	};

	const toggleConfirmPasswordVisibility = () => {
		showConfirmPassword = !showConfirmPassword;
	};
</script>

<svelte:head>
	<title>Register - Subscription Platform</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-md">
	<Card class="p-8">
		<CardHeader>
			<h1 class="h2 text-center mb-2">Create Account</h1>
			<p class="text-center text-surface-600-300-token mb-6">
				Join our platform to manage your subscriptions
			</p>
		</CardHeader>

		<CardContent>
			{#if formErrors.general}
				<div class="alert variant-filled-error mb-4">
					{formErrors.general}
				</div>
			{/if}

			<form on:submit={handleSubmit} class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="firstName" class="label">
							<span class="flex items-center space-x-2">
								<User size={16} />
								<span>First Name</span>
							</span>
						</label>
						<input
							id="firstName"
							type="text"
							bind:value={firstName}
							class="input"
							class:input-error={formErrors.firstName}
							placeholder="John"
							disabled={$registerMutation.isPending}
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
							placeholder="Doe"
							disabled={$registerMutation.isPending}
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
						placeholder="john@example.com"
						disabled={$registerMutation.isPending}
					/>
					{#if formErrors.email}
						<span class="text-error-500 text-sm">{formErrors.email}</span>
					{/if}
				</div>

				<div>
					<label for="password" class="label">
						<span class="flex items-center space-x-2">
							<Lock size={16} />
							<span>Password</span>
						</span>
					</label>
					<div class="relative">
						<input
							id="password"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							class="input pr-10"
							class:input-error={formErrors.password}
							placeholder="Create a strong password"
							disabled={$registerMutation.isPending}
						/>
						<button
							type="button"
							on:click={togglePasswordVisibility}
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-surface-600-300-token hover:text-surface-900-50-token"
						>
							{#if showPassword}
								<EyeOff size={16} />
							{:else}
								<Eye size={16} />
							{/if}
						</button>
					</div>
					{#if formErrors.password}
						<span class="text-error-500 text-sm">{formErrors.password}</span>
					{/if}
				</div>

				<div>
					<label for="confirmPassword" class="label">
						<span class="flex items-center space-x-2">
							<Lock size={16} />
							<span>Confirm Password</span>
						</span>
					</label>
					<div class="relative">
						<input
							id="confirmPassword"
							type={showConfirmPassword ? 'text' : 'password'}
							bind:value={confirmPassword}
							class="input pr-10"
							class:input-error={formErrors.confirmPassword}
							placeholder="Confirm your password"
							disabled={$registerMutation.isPending}
						/>
						<button
							type="button"
							on:click={toggleConfirmPasswordVisibility}
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-surface-600-300-token hover:text-surface-900-50-token"
						>
							{#if showConfirmPassword}
								<EyeOff size={16} />
							{:else}
								<Eye size={16} />
							{/if}
						</button>
					</div>
					{#if formErrors.confirmPassword}
						<span class="text-error-500 text-sm">{formErrors.confirmPassword}</span>
					{/if}
				</div>

				<div class="flex items-center space-x-2">
					<input type="checkbox" class="checkbox" required />
					<span class="text-sm">
						I agree to the
						<a href="/terms" class="text-primary-600 hover:underline">Terms of Service</a>
						and
						<a href="/privacy" class="text-primary-600 hover:underline">Privacy Policy</a>
					</span>
				</div>

				<button
					type="submit"
					class="btn variant-filled-primary w-full"
					disabled={$registerMutation.isPending}
				>
					{#if $registerMutation.isPending}
						<span class="loading loading-spinner loading-sm"></span>
						Creating account...
					{:else}
						Create Account
					{/if}
				</button>
			</form>

			<div class="text-center mt-6">
				<span class="text-surface-600-300-token">Already have an account? </span>
				<a href="/auth/login" class="text-primary-600 hover:underline">Sign in</a>
			</div>
		</CardContent>
	</Card>
</div>