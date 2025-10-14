<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-svelte';
  import { auth, authError, isLoading } from '$lib/stores/auth';

  let showPassword = false;
  let emailInput: HTMLInputElement;
  let email = '';
  let password = '';
  let rememberMe = false;

  onMount(() => {
    // Auto-focus email input
    if (emailInput) {
      emailInput.focus();
    }
  });

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();

    // Prevent double submission
    if ($isLoading) return;

    if (!email || !password) {
      auth.setError('Email and password are required');
      return;
    }

    try {
      console.log('🔄 [LOGIN] Starting login process...');

      // Clear any previous errors
      auth.clearError();

      // Call auth store login method
      await auth.login({
        email,
        password,
        rememberMe
      });

      console.log('✅ [LOGIN] Login successful');

      // Wait for store to update
      await tick();

      // Navigation is handled by the auth store automatically
    } catch (error) {
      // Error is handled by the auth store and displayed via authError
      console.error('❌ [LOGIN] Login failed:', error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  }
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
  {#if $authError}
    <div class="alert variant-filled-error" role="alert">
      <div class="alert-message">
        <p>{$authError}</p>
      </div>
      <div class="alert-actions">
        <button
          type="button"
          class="btn-icon btn-icon-sm variant-filled"
          on:click={() => auth.clearError()}
          aria-label="Dismiss error"
        >
          <span>×</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Login Form -->
  <form on:submit={handleSubmit} class="space-y-4" novalidate>
    <!-- Email Field -->
    <div>
      <label for="email" class="label">
        <span>Email address</span>
      </label>
      <input
        bind:this={emailInput}
        bind:value={email}
        on:keydown={handleKeydown}
        type="email"
        id="email"
        name="email"
        autocomplete="email"
        required
        disabled={$isLoading}
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
        {#if showPassword}
          <input
            bind:value={password}
            on:keydown={handleKeydown}
            type="text"
            id="password"
            name="password"
            autocomplete="current-password"
            required
            disabled={$isLoading}
            class="input"
            placeholder="Enter your password"
          />
        {:else}
          <input
            bind:value={password}
            on:keydown={handleKeydown}
            type="password"
            id="password"
            name="password"
            autocomplete="current-password"
            required
            disabled={$isLoading}
            class="input"
            placeholder="Enter your password"
          />
        {/if}
        <button
          type="button"
          class="btn variant-filled-surface btn-icon"
          on:click={togglePasswordVisibility}
          disabled={$isLoading}
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
          bind:checked={rememberMe}
          type="checkbox"
          name="rememberMe"
          class="checkbox"
          disabled={$isLoading}
        />
        <span class="text-sm text-surface-700 dark:text-surface-300">Remember me</span>
      </label>
    </div>

    <!-- Submit Button -->
    <button
      type="submit"
      disabled={$isLoading}
      class="btn variant-filled-primary w-full"
    >
      {#if $isLoading}
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