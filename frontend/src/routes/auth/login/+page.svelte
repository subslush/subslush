<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-svelte';
  import { auth, authError, isLoading } from '$lib/stores/auth.js';
  import { loginSchema, type LoginFormData } from '$lib/validation/auth.js';
  import { ROUTES } from '$lib/utils/constants.js';

  let formData: LoginFormData = {
    email: '',
    password: '',
    rememberMe: false
  };

  let formErrors: Partial<Record<keyof LoginFormData, string>> = {};
  let showPassword = false;
  let emailInput: HTMLInputElement;

  onMount(() => {
    // Auto-focus email input
    if (emailInput) {
      emailInput.focus();
    }
  });

  function validateForm(): boolean {
    formErrors = {};

    try {
      loginSchema.parse(formData);
      return true;
    } catch (error: any) {
      if (error.errors) {
        error.errors.forEach((err: any) => {
          formErrors[err.path[0] as keyof LoginFormData] = err.message;
        });
      }
      return false;
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    console.log('📝 [LOGIN PAGE] Form submitted');

    if (!validateForm()) {
      console.log('📝 [LOGIN PAGE] Form validation failed');
      return;
    }

    console.log('📝 [LOGIN PAGE] Form validation passed, calling auth.login()');
    try {
      await auth.login(formData);
      console.log('📝 [LOGIN PAGE] auth.login() completed successfully');
      // Navigation is handled by the auth store
    } catch (error) {
      console.error('📝 [LOGIN PAGE] auth.login() threw error:', error);
      // Error is handled by the auth store and displayed via authError
    }
    console.log('📝 [LOGIN PAGE] handleSubmit completed');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  function clearFieldError(field: keyof LoginFormData) {
    if (formErrors[field]) {
      formErrors = { ...formErrors, [field]: undefined };
    }
  }

  function navigateToRegister() {
    goto(ROUTES.AUTH.REGISTER);
  }

  // Add reactive statements to log loading state changes
  $: {
    console.log('📝 [LOGIN PAGE] isLoading changed:', $isLoading);
  }

  $: {
    console.log('📝 [LOGIN PAGE] authError changed:', $authError);
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
        bind:value={formData.email}
        on:input={() => clearFieldError('email')}
        on:keydown={handleKeydown}
        type="email"
        id="email"
        name="email"
        autocomplete="email"
        required
        disabled={$isLoading}
        class="input"
        class:input-error={formErrors.email}
        placeholder="Enter your email"
        aria-describedby={formErrors.email ? 'email-error' : undefined}
      />
      {#if formErrors.email}
        <div id="email-error" class="text-sm text-error-500 mt-1" role="alert">
          {formErrors.email}
        </div>
      {/if}
    </div>

    <!-- Password Field -->
    <div>
      <label for="password" class="label">
        <span>Password</span>
      </label>
      <div class="input-group input-group-divider grid-cols-[1fr_auto]">
        {#if showPassword}
          <input
            bind:value={formData.password}
            on:input={() => clearFieldError('password')}
            on:keydown={handleKeydown}
            type="text"
            id="password"
            name="password"
            autocomplete="current-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.password}
            placeholder="Enter your password"
            aria-describedby={formErrors.password ? 'password-error' : undefined}
          />
        {:else}
          <input
            bind:value={formData.password}
            on:input={() => clearFieldError('password')}
            on:keydown={handleKeydown}
            type="password"
            id="password"
            name="password"
            autocomplete="current-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.password}
            placeholder="Enter your password"
            aria-describedby={formErrors.password ? 'password-error' : undefined}
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
      {#if formErrors.password}
        <div id="password-error" class="text-sm text-error-500 mt-1" role="alert">
          {formErrors.password}
        </div>
      {/if}
    </div>

    <!-- Remember Me -->
    <div class="flex items-center">
      <label class="flex items-center space-x-2">
        <input
          bind:checked={formData.rememberMe}
          type="checkbox"
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
      <button
        type="button"
        on:click={navigateToRegister}
        class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
        disabled={$isLoading}
      >
        Sign up
      </button>
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