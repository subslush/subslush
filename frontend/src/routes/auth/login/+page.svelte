<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth';

  let showPassword = false;
  let emailInput: HTMLInputElement;
  let isSubmitting = false;

  onMount(() => {
    // Auto-focus email input
    if (emailInput) {
      emailInput.focus();
    }
  });

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  // Get form data and errors from page data
  export let form;
</script>

<svelte:head>
  <title>Sign In - Subscription Platform</title>
  <meta name="description" content="Sign in to your Subscription Platform account to access premium subscriptions at discounted prices." />
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="text-center">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">
      Welcome back
    </h2>
    <p class="mt-2 text-sm text-surface-600 dark:text-surface-400">
      Sign in to your account to continue
    </p>
  </div>

  <!-- Error Alert -->
  {#if form?.error}
    <div class="alert variant-filled-error" role="alert">
      <div class="alert-message">
        <p>{form.error}</p>
      </div>
    </div>
  {/if}

  <!-- Login Form -->
  <form method="POST" use:enhance={() => {
    isSubmitting = true;
    return async ({ result, update }) => {
      isSubmitting = false;

      console.log('✅ [LOGIN] Form submission result:', result);

      if (result.type === 'success' && result.data?.success) {
        console.log('✅ [LOGIN] Success, initializing auth store');

        // Update auth store with user data
        if (result.data.user) {
          auth.init(result.data.user);
          console.log('✅ [LOGIN] Auth store initialized with user:', result.data.user);
        } else {
          console.warn('⚠️ [LOGIN] No user data in success response');
        }

        // Navigate to dashboard
        console.log('✅ [LOGIN] Redirecting to dashboard');
        await goto('/dashboard');
      } else if (result.type === 'failure') {
        console.error('❌ [LOGIN] Login failed:', result.data);
        // Let SvelteKit handle the error display
        await update();
      } else {
        console.log('📝 [LOGIN] Other result type:', result.type);
        // Handle other result types
        await update();
      }
    };
  }} class="space-y-4" novalidate>
    <!-- Email Field -->
    <div>
      <label for="email" class="label">
        <span>Email address</span>
      </label>
      <input
        bind:this={emailInput}
        value={form?.email || ''}
        type="email"
        id="email"
        name="email"
        autocomplete="email"
        required
        disabled={isSubmitting}
        class="input"
        placeholder="Enter your email"
      />
    </div>

    <!-- Password Field -->
    <div>
      <label for="password" class="label">
        <span>Password</span>
      </label>
      <div class="input-group input-group-divider grid-cols-[1fr_auto]">
        <input
          type={showPassword ? 'text' : 'password'}
          id="password"
          name="password"
          autocomplete="current-password"
          required
          disabled={isSubmitting}
          class="input"
          placeholder="Enter your password"
        />
        <button
          type="button"
          class="btn variant-filled-surface btn-icon"
          on:click={togglePasswordVisibility}
          disabled={isSubmitting}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {#if showPassword}
            <EyeOff class="w-4 h-4" />
          {:else}
            <Eye class="w-4 h-4" />
          {/if}
        </button>
      </div>
    </div>

    <!-- Remember Me -->
    <div class="flex items-center">
      <label class="flex items-center space-x-2">
        <input
          type="checkbox"
          name="rememberMe"
          class="checkbox"
          disabled={isSubmitting}
        />
        <span class="text-sm text-surface-700 dark:text-surface-300">Remember me</span>
      </label>
    </div>

    <!-- Submit Button -->
    <button
      type="submit"
      disabled={isSubmitting}
      class="btn variant-filled-primary w-full"
    >
      {#if isSubmitting}
        <Loader2 class="w-4 h-4 mr-2 animate-spin" />
        Signing in...
      {:else}
        <LogIn class="w-4 h-4 mr-2" />
        Sign in
      {/if}
    </button>
  </form>

  <!-- Navigation Links -->
  <div class="text-center space-y-2">
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Don't have an account?
      <a
        href="/auth/register"
        class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
      >
        Sign up
      </a>
    </p>

    <p class="text-sm">
      <a
        href="/auth/forgot-password"
        class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
      >
        Forgot your password?
      </a>
    </p>
  </div>
</div>