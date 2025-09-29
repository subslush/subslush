<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Eye, EyeOff, UserPlus, Loader2, Check, X } from 'lucide-svelte';
  import { auth, authError, isLoading } from '$lib/stores/auth.js';
  import { registerSchema, type RegisterFormData } from '$lib/validation/auth.js';
  import { getPasswordStrength, validatePasswordRequirements } from '$lib/utils/validators.js';
  import { ROUTES } from '$lib/utils/constants.js';

  let formData: RegisterFormData = {
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    acceptTerms: false  // CRITICAL FIX: Add this field
  };

  let formErrors: Partial<Record<keyof RegisterFormData, string>> = {};
  let showPassword = false;
  let showConfirmPassword = false;
  let emailInput: HTMLInputElement;
  let passwordRequirements: string[] = [];

  $: passwordStrength = formData.password ? getPasswordStrength(formData.password) : null;
  $: passwordRequirements = validatePasswordRequirements(formData.password);

  onMount(() => {
    // Auto-focus email input
    if (emailInput) {
      emailInput.focus();
    }
  });

  function validateForm(): boolean {
    formErrors = {};

    try {
      registerSchema.parse(formData);
      return true;
    } catch (error: any) {
      if (error.errors) {
        error.errors.forEach((err: any) => {
          formErrors[err.path[0] as keyof RegisterFormData] = err.message;
        });
      }
      return false;
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      // Prepare data for API (remove confirmPassword, acceptTerms, and empty optional fields)
      const { confirmPassword, acceptTerms, ...apiData } = formData;
      const cleanData = {
        email: apiData.email,
        password: apiData.password,
        ...(apiData.firstName && { firstName: apiData.firstName }),
        ...(apiData.lastName && { lastName: apiData.lastName })
      };

      await auth.register(cleanData);
      // Navigation is handled by the auth store
    } catch (error) {
      // Error is handled by the auth store and displayed via authError
      console.error('Registration failed:', error);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit(event);
    }
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  function toggleConfirmPasswordVisibility() {
    showConfirmPassword = !showConfirmPassword;
  }

  function clearFieldError(field: keyof RegisterFormData) {
    if (formErrors[field]) {
      formErrors = { ...formErrors, [field]: undefined };
    }
  }

  function navigateToLogin() {
    goto(ROUTES.AUTH.LOGIN);
  }

  function getStrengthColor(strength: string | null): string {
    switch (strength) {
      case 'weak': return 'text-error-500';
      case 'medium': return 'text-warning-500';
      case 'strong': return 'text-success-500';
      default: return 'text-surface-500';
    }
  }

  function getStrengthBarWidth(strength: string | null): string {
    switch (strength) {
      case 'weak': return 'w-1/3';
      case 'medium': return 'w-2/3';
      case 'strong': return 'w-full';
      default: return 'w-0';
    }
  }

  function getStrengthBarColor(strength: string | null): string {
    switch (strength) {
      case 'weak': return 'bg-error-500';
      case 'medium': return 'bg-warning-500';
      case 'strong': return 'bg-success-500';
      default: return 'bg-surface-300';
    }
  }
</script>

<svelte:head>
  <title>Sign Up - Subscription Platform</title>
  <meta name="description" content="Create your Subscription Platform account to access premium subscriptions at discounted prices." />
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="text-center">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">
      Create your account
    </h2>
    <p class="mt-2 text-sm text-surface-600 dark:text-surface-400">
      Join thousands of users saving on premium subscriptions
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

  <!-- Registration Form -->
  <form on:submit={handleSubmit} class="space-y-4" novalidate>
    <!-- Name Fields -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- First Name -->
      <div>
        <label for="firstName" class="label">
          <span>First name (optional)</span>
        </label>
        <input
          bind:value={formData.firstName}
          on:input={() => clearFieldError('firstName')}
          on:keydown={handleKeydown}
          type="text"
          id="firstName"
          name="firstName"
          autocomplete="given-name"
          disabled={$isLoading}
          class="input"
          class:input-error={formErrors.firstName}
          placeholder="Enter your first name"
          aria-describedby={formErrors.firstName ? 'firstName-error' : undefined}
        />
        {#if formErrors.firstName}
          <div id="firstName-error" class="text-sm text-error-500 mt-1" role="alert">
            {formErrors.firstName}
          </div>
        {/if}
      </div>

      <!-- Last Name -->
      <div>
        <label for="lastName" class="label">
          <span>Last name (optional)</span>
        </label>
        <input
          bind:value={formData.lastName}
          on:input={() => clearFieldError('lastName')}
          on:keydown={handleKeydown}
          type="text"
          id="lastName"
          name="lastName"
          autocomplete="family-name"
          disabled={$isLoading}
          class="input"
          class:input-error={formErrors.lastName}
          placeholder="Enter your last name"
          aria-describedby={formErrors.lastName ? 'lastName-error' : undefined}
        />
        {#if formErrors.lastName}
          <div id="lastName-error" class="text-sm text-error-500 mt-1" role="alert">
            {formErrors.lastName}
          </div>
        {/if}
      </div>
    </div>

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
            autocomplete="new-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.password}
            placeholder="Create a strong password"
            aria-describedby={formErrors.password ? 'password-error' : 'password-help'}
          />
        {:else}
          <input
            bind:value={formData.password}
            on:input={() => clearFieldError('password')}
            on:keydown={handleKeydown}
            type="password"
            id="password"
            name="password"
            autocomplete="new-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.password}
            placeholder="Create a strong password"
            aria-describedby={formErrors.password ? 'password-error' : 'password-help'}
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

      <!-- Password Strength Indicator -->
      {#if formData.password}
        <div class="mt-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-surface-600 dark:text-surface-400">Password strength:</span>
            <span class="text-xs font-medium {getStrengthColor(passwordStrength)}">
              {passwordStrength ? passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1) : ''}
            </span>
          </div>
          <div class="w-full bg-surface-200 dark:bg-surface-700 rounded-full h-1.5">
            <div
              class="h-1.5 rounded-full transition-all duration-300 {getStrengthBarWidth(passwordStrength)} {getStrengthBarColor(passwordStrength)}"
            ></div>
          </div>
        </div>
      {/if}

      {#if formErrors.password}
        <div id="password-error" class="text-sm text-error-500 mt-1" role="alert">
          {formErrors.password}
        </div>
      {:else if formData.password && passwordRequirements.length > 0}
        <div id="password-help" class="mt-2">
          <p class="text-xs text-surface-600 dark:text-surface-400 mb-1">Password requirements:</p>
          <ul class="space-y-1">
            {#each passwordRequirements as requirement}
              <li class="flex items-center text-xs text-error-500">
                <X class="w-3 h-3 mr-1" />
                {requirement}
              </li>
            {/each}
          </ul>
        </div>
      {:else if formData.password && passwordRequirements.length === 0}
        <div class="mt-2">
          <p class="flex items-center text-xs text-success-500">
            <Check class="w-3 h-3 mr-1" />
            Password meets all requirements
          </p>
        </div>
      {/if}
    </div>

    <!-- Confirm Password Field -->
    <div>
      <label for="confirmPassword" class="label">
        <span>Confirm password</span>
      </label>
      <div class="input-group input-group-divider grid-cols-[1fr_auto]">
        {#if showConfirmPassword}
          <input
            bind:value={formData.confirmPassword}
            on:input={() => clearFieldError('confirmPassword')}
            on:keydown={handleKeydown}
            type="text"
            id="confirmPassword"
            name="confirmPassword"
            autocomplete="new-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.confirmPassword}
            placeholder="Confirm your password"
            aria-describedby={formErrors.confirmPassword ? 'confirmPassword-error' : undefined}
          />
        {:else}
          <input
            bind:value={formData.confirmPassword}
            on:input={() => clearFieldError('confirmPassword')}
            on:keydown={handleKeydown}
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            autocomplete="new-password"
            required
            disabled={$isLoading}
            class="input"
            class:input-error={formErrors.confirmPassword}
            placeholder="Confirm your password"
            aria-describedby={formErrors.confirmPassword ? 'confirmPassword-error' : undefined}
          />
        {/if}
        <button
          type="button"
          class="btn variant-filled-surface btn-icon"
          on:click={toggleConfirmPasswordVisibility}
          disabled={$isLoading}
          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
        >
          {#if showConfirmPassword}
            <EyeOff class="w-4 h-4" />
          {:else}
            <Eye class="w-4 h-4" />
          {/if}
        </button>
      </div>
      {#if formErrors.confirmPassword}
        <div id="confirmPassword-error" class="text-sm text-error-500 mt-1" role="alert">
          {formErrors.confirmPassword}
        </div>
      {/if}
    </div>

    <!-- Terms and Conditions -->
    <div class="space-y-2">
      <div class="flex items-start space-x-2">
        <input
          bind:checked={formData.acceptTerms}
          on:change={() => clearFieldError('acceptTerms')}
          type="checkbox"
          id="terms"
          disabled={$isLoading}
          class="checkbox mt-1"
          class:input-error={formErrors.acceptTerms}
          aria-describedby={formErrors.acceptTerms ? 'terms-error' : undefined}
        />
        <label for="terms" class="text-sm text-surface-700 dark:text-surface-300">
          I agree to the
          <a href="/terms" class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors" target="_blank">
            Terms of Service
          </a>
          and
          <a href="/privacy" class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors" target="_blank">
            Privacy Policy
          </a>
        </label>
      </div>
      {#if formErrors.acceptTerms}
        <div id="terms-error" class="text-sm text-error-500" role="alert">
          {formErrors.acceptTerms}
        </div>
      {/if}
    </div>

    <!-- Submit Button -->
    <button
      type="submit"
      disabled={$isLoading}
      class="btn variant-filled-primary w-full"
    >
      {#if $isLoading}
        <Loader2 class="w-4 h-4 mr-2 animate-spin" />
        Creating account...
      {:else}
        <UserPlus class="w-4 h-4 mr-2" />
        Create account
      {/if}
    </button>
  </form>

  <!-- Navigation Links -->
  <div class="text-center">
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Already have an account?
      <button
        type="button"
        on:click={navigateToLogin}
        class="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
        disabled={$isLoading}
      >
        Sign in
      </button>
    </p>
  </div>
</div>