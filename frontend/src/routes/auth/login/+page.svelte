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
  <title>Sign In - SubSlush</title>
  <meta name="description" content="Sign in to your SubSlush account to access premium subscriptions at unbeatable prices." />
</svelte:head>

<div class="space-y-8">
  <!-- Header -->
  <div class="text-center space-y-3">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">
      Welcome back to SubSlush
    </h2>
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Sign in to continue saving on premium subscriptions
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
  <form on:submit={handleSubmit} class="space-y-6" novalidate>
    <!-- Email Field -->
    <div class="space-y-2">
      <label for="email" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
        Email address
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
        class="w-full px-4 py-3 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:border-subslush-blue focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder="you@example.com"
        aria-label="Email address"
      />
    </div>

    <!-- Password Field -->
    <div class="space-y-2">
      <label for="password" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
        Password
      </label>
      <div class="relative">
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:border-subslush-blue focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your password"
            aria-label="Password"
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:border-subslush-blue focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your password"
            aria-label="Password"
          />
        {/if}
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 rounded-md transition-colors duration-200"
          on:click={togglePasswordVisibility}
          disabled={$isLoading}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {#if showPassword}
            <Eye size={20} />
          {:else}
            <EyeOff size={20} />
          {/if}
        </button>
      </div>
    </div>

    <!-- Remember Me -->
    <div class="flex items-center pt-2">
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          bind:checked={rememberMe}
          type="checkbox"
          name="rememberMe"
          class="h-4 w-4 rounded border-surface-300 text-subslush-blue focus:ring-subslush-blue focus:ring-offset-0 focus:ring-2 transition-colors duration-200"
          disabled={$isLoading}
          aria-label="Remember me for future logins"
        />
        <span class="text-sm text-surface-600 dark:text-surface-400 select-none">Remember me for 30 days</span>
      </label>
    </div>

    <!-- Submit Button -->
    <div class="pt-4">
      <button
        type="submit"
        disabled={$isLoading}
        class="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 focus:ring-offset-2 min-h-[52px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
        style="background: linear-gradient(45deg, #4FC3F7, #F06292);"
        aria-label="Sign in to your account"
      >
        {#if $isLoading}
          <Loader2 class="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Signing in...</span>
        {:else}
          <LogIn class="w-5 h-5" aria-hidden="true" />
          <span>Sign in</span>
        {/if}
      </button>
    </div>
  </form>

  <!-- Navigation Links -->
  <div class="text-center space-y-3">
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Don't have an account?
      <a
        href="/auth/register"
        class="text-subslush-blue dark:text-subslush-blue-light hover:text-subslush-blue-dark dark:hover:text-subslush-blue font-medium transition-colors ml-1"
      >
        Sign up
      </a>
    </p>

    <p class="text-sm">
      <a
        href="/auth/forgot-password"
        class="text-subslush-pink dark:text-subslush-pink-light hover:text-subslush-pink-dark dark:hover:text-subslush-pink transition-colors"
      >
        Forgot your password?
      </a>
    </p>
  </div>
</div>