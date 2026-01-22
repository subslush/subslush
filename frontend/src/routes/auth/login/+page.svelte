<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-svelte';
  import { page } from '$app/stores';
  import { auth, authError, isLoading } from '$lib/stores/auth';
  import { ROUTES } from '$lib/utils/constants.js';

  let showPassword = false;
  let emailInput: HTMLInputElement;
  let email = '';
  let password = '';
  let sessionExpired = false;
  let verificationEmail = '';
  let verificationPending = false;
  $: forgotPasswordHref = email
    ? `${ROUTES.AUTH.FORGOT_PASSWORD}?email=${encodeURIComponent(email)}`
    : ROUTES.AUTH.FORGOT_PASSWORD;
  $: sessionExpired = $page.url.searchParams.get('reason') === 'session-expired';
  $: verificationPending = $page.url.searchParams.get('verify') === 'pending';

  onMount(() => {
    // Auto-focus email input
    if (emailInput) {
      emailInput.focus();
    }
    const emailParam = $page.url.searchParams.get('email');
    if (emailParam && !email) {
      email = emailParam;
      verificationEmail = emailParam;
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
        password
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
  {#if sessionExpired}
    <div
      class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100"
      role="status"
      aria-live="polite"
    >
      <p class="font-semibold">Session expired</p>
      <p class="text-amber-800 dark:text-amber-100/90">Please sign in again to continue.</p>
    </div>
  {/if}
  {#if verificationPending}
    <div
      class="rounded-2xl border border-cyan-200/70 bg-gradient-to-r from-cyan-50 via-white to-pink-50 px-4 py-4 text-slate-900 shadow-sm dark:border-cyan-500/20 dark:bg-slate-900/60 dark:text-slate-100"
      role="status"
      aria-live="polite"
    >
      <div class="space-y-1">
        <p class="text-sm font-semibold">Confirm your email to finish sign-up</p>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          We sent a confirmation link{verificationEmail ? ` to ${verificationEmail}` : ''}.
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          If you don’t see it, check your spam or promotions folder.
        </p>
      </div>
    </div>
  {/if}

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
        href={forgotPasswordHref}
        class="text-subslush-pink dark:text-subslush-pink-light hover:text-subslush-pink-dark dark:hover:text-subslush-pink transition-colors"
      >
        Forgot your password?
      </a>
    </p>
  </div>
</div>
