<script lang="ts">
	import { Card, CardHeader, CardContent } from '@skeletonlabs/skeleton';
	import { Mail, Lock, Eye, EyeOff } from 'lucide-svelte';
	import { createMutation } from '@tanstack/svelte-query';
	import axios from 'axios';
	import { goto } from '$app/navigation';
	import { env } from '$env/dynamic/public';

	let email = '';
	let password = '';
	let showPassword = false;
	let formErrors = {};

	const API_URL = env.PUBLIC_API_URL || 'http://localhost:3001';

	const loginMutation = createMutation({
		mutationFn: async (credentials: { email: string; password: string }) => {
			const response = await axios.post(`${API_URL}/auth/login`, credentials, {
				withCredentials: true
			});
			return response.data;
		},
		onSuccess: () => {
			goto('/dashboard');
		},
		onError: (error: any) => {
			console.error('Login failed:', error);
			if (error.response?.data?.errors) {
				formErrors = error.response.data.errors;
			} else {
				formErrors = { general: 'Login failed. Please try again.' };
			}
		}
	});

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		formErrors = {};

		if (!email) {
			formErrors.email = 'Email is required';
		}
		if (!password) {
			formErrors.password = 'Password is required';
		}

		if (Object.keys(formErrors).length === 0) {
			$loginMutation.mutate({ email, password });
		}
	};

	const togglePasswordVisibility = () => {
		showPassword = !showPassword;
	};
</script>

<svelte:head>
	<title>Login - Subscription Platform</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-md">
	<Card class="p-8">
		<CardHeader>
			<h1 class="h2 text-center mb-2">Welcome Back</h1>
			<p class="text-center text-surface-600-300-token mb-6">
				Sign in to your account to continue
			</p>
		</CardHeader>

		<CardContent>
			{#if formErrors.general}
				<div class="alert variant-filled-error mb-4">
					{formErrors.general}
				</div>
			{/if}

			<form on:submit={handleSubmit} class="space-y-4">
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
						placeholder="Enter your email"
						disabled={$loginMutation.isPending}
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
							placeholder="Enter your password"
							disabled={$loginMutation.isPending}
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

				<div class="flex items-center justify-between">
					<label class="flex items-center space-x-2">
						<input type="checkbox" class="checkbox" />
						<span class="text-sm">Remember me</span>
					</label>
					<a href="/auth/forgot-password" class="text-sm text-primary-600 hover:underline">
						Forgot password?
					</a>
				</div>

				<button
					type="submit"
					class="btn variant-filled-primary w-full"
					disabled={$loginMutation.isPending}
				>
					{#if $loginMutation.isPending}
						<span class="loading loading-spinner loading-sm"></span>
						Signing in...
					{:else}
						Sign In
					{/if}
				</button>
			</form>

			<div class="text-center mt-6">
				<span class="text-surface-600-300-token">Don't have an account? </span>
				<a href="/auth/register" class="text-primary-600 hover:underline">Sign up</a>
			</div>
		</CardContent>
	</Card>
</div>