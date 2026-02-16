<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { Eye, EyeOff, UserPlus, Loader2, Check, X, Info } from 'lucide-svelte';
  import { auth, authError, authErrorAction, isLoading } from '$lib/stores/auth.js';
  import { registerSchema, type RegisterFormData } from '$lib/validation/auth.js';
  import { getPasswordStrength, validatePasswordRequirements } from '$lib/utils/validators.js';
  import { ROUTES } from '$lib/utils/constants.js';
  import { ZodError } from 'zod';

  let formData: RegisterFormData = {
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    acceptTerms: false
  };

  let formErrors: Partial<Record<keyof RegisterFormData, string>> = {};
  let showPassword = false;
  let showConfirmPassword = false;
  let emailInput: HTMLInputElement;
  let passwordRequirements: string[] = [];
  let redirectTarget = '';
  const EMAIL_VERIFY_REDIRECT_STORAGE_KEY = 'auth:post_verify_redirect';

  $: passwordStrength = formData.password ? getPasswordStrength(formData.password) : null;
  $: passwordRequirements = validatePasswordRequirements(formData.password);
  $: redirectTarget = $page.url.searchParams.get('redirect') ?? '';

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
    } catch (error) {
      if (error instanceof ZodError) {
        error.errors.forEach(err => {
          const field = err.path[0];
          if (typeof field === 'string') {
            formErrors[field as keyof RegisterFormData] = err.message;
          }
        });
      }
      return false;
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();

    // Prevent double submission
    if ($isLoading) return;

    if (!validateForm()) {
      return;
    }

    try {
      // Prepare data for API (remove confirmPassword, acceptTerms, and empty optional fields)
      const { confirmPassword, acceptTerms, ...apiData } = formData;
      const safeRedirect = resolveSafeRedirect();
      const cleanData = {
        email: apiData.email,
        password: apiData.password,
        firstName: apiData.firstName || '',
        lastName: apiData.lastName || '',
        ...(safeRedirect ? { redirect: safeRedirect } : {}),
      };

      console.log('🔄 [REGISTER] Starting registration process...');

      // Call auth store register method
      const result = await auth.register(cleanData);

      if (result?.requiresEmailVerification) {
        auth.clearError();
        console.log('✅ [REGISTER] Verification required');
        const params = new URLSearchParams();
        params.set('verify', 'pending');
        params.set('email', cleanData.email);
        if (safeRedirect) {
          persistPostVerifyRedirect(safeRedirect);
          params.set('redirect', safeRedirect);
        } else {
          clearPostVerifyRedirect();
        }
        goto(`${ROUTES.AUTH.LOGIN}?${params.toString()}`);
        return;
      }

      clearPostVerifyRedirect();

      console.log('✅ [REGISTER] Registration successful');

      // Wait for store to update
      await tick();

      // Navigation is handled by the auth store automatically
    } catch (error) {
      // Error is handled by the auth store and displayed via authError
      console.error('❌ [REGISTER] Registration failed:', error);
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

  function resolveSafeRedirect(): string | null {
    const normalized = redirectTarget.trim();
    if (!normalized) return null;
    if (!normalized.startsWith('/') || normalized.startsWith('//')) {
      return null;
    }
    return normalized;
  }

  function persistPostVerifyRedirect(path: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(EMAIL_VERIFY_REDIRECT_STORAGE_KEY, path);
    } catch {
      // Ignore storage errors; redirect query parameter is still present.
    }
  }

  function clearPostVerifyRedirect(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(EMAIL_VERIFY_REDIRECT_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  function navigateToLogin() {
    const safeRedirect = resolveSafeRedirect();
    if (safeRedirect) {
      goto(`${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(safeRedirect)}`);
      return;
    }
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
  <title>Sign Up - SubSlush</title>
  <meta name="description" content="Create your SubSlush account to access premium subscriptions at unbeatable prices." />
</svelte:head>

<div class="space-y-8">
  <!-- Header -->
  <div class="text-center space-y-3">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">
      Create an account
    </h2>
    <p class="text-sm text-surface-600 dark:text-surface-400">
      See order history, claim rewards and check out faster!
    </p>
  </div>

  <!-- Error Alert -->
  {#if $authError}
    <div class="alert variant-filled-error" role="alert">
      <div class="alert-message">
        <p>{$authError}</p>
      </div>
      <div class="alert-actions">
        {#if $authErrorAction}
          <a
            href={$authErrorAction.url}
            class="text-sm font-semibold underline underline-offset-2 text-white/90 hover:text-white"
          >
            {$authErrorAction.text}
          </a>
        {/if}
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
  <form on:submit={handleSubmit} class="space-y-6" novalidate>
    <!-- Email Field -->
    <div class="space-y-2">
      <label for="email" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
        Email address
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
        class="w-full px-4 py-3 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        class:border-surface-200={!formErrors.email}
        class:dark:border-surface-700={!formErrors.email}
        class:focus:border-subslush-blue={!formErrors.email}
        class:border-error-500={formErrors.email}
        class:dark:border-error-400={formErrors.email}
        class:focus:border-error-500={formErrors.email}
        placeholder="Email@example.com"
        aria-describedby={formErrors.email ? 'email-error' : undefined}
        aria-label="Email address"
      />
      {#if formErrors.email}
        <div id="email-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
          {formErrors.email}
        </div>
      {/if}
    </div>

    <!-- Password Field -->
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <label for="password" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
          Password
        </label>
        <button
          type="button"
          class="relative group inline-flex items-center"
          aria-label="Password rules"
          aria-describedby="password-rules"
        >
          <Info size={16} class="text-surface-400 group-hover:text-surface-600 dark:text-surface-500 dark:group-hover:text-surface-300" aria-hidden="true" />
          <div
            id="password-rules"
            class="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 p-3 shadow-lg text-xs text-surface-700 dark:text-surface-200 opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 z-20"
          >
            <p>At least 8 characters</p>
            <p>Special character or a digit</p>
            <p>At least 1 small letter</p>
            <p>At least 1 capital letter</p>
          </div>
        </button>
      </div>
      <div class="relative">
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.password}
            class:dark:border-surface-700={!formErrors.password}
            class:focus:border-subslush-blue={!formErrors.password}
            class:border-error-500={formErrors.password}
            class:dark:border-error-400={formErrors.password}
            class:focus:border-error-500={formErrors.password}
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.password}
            class:dark:border-surface-700={!formErrors.password}
            class:focus:border-subslush-blue={!formErrors.password}
            class:border-error-500={formErrors.password}
            class:dark:border-error-400={formErrors.password}
            class:focus:border-error-500={formErrors.password}
            placeholder="Create a strong password"
            aria-describedby={formErrors.password ? 'password-error' : 'password-help'}
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
    <div class="space-y-2">
      <label for="confirmPassword" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
        Confirm password
      </label>
      <div class="relative">
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.confirmPassword}
            class:dark:border-surface-700={!formErrors.confirmPassword}
            class:focus:border-subslush-blue={!formErrors.confirmPassword}
            class:border-error-500={formErrors.confirmPassword}
            class:dark:border-error-400={formErrors.confirmPassword}
            class:focus:border-error-500={formErrors.confirmPassword}
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
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.confirmPassword}
            class:dark:border-surface-700={!formErrors.confirmPassword}
            class:focus:border-subslush-blue={!formErrors.confirmPassword}
            class:border-error-500={formErrors.confirmPassword}
            class:dark:border-error-400={formErrors.confirmPassword}
            class:focus:border-error-500={formErrors.confirmPassword}
            placeholder="Confirm your password"
            aria-describedby={formErrors.confirmPassword ? 'confirmPassword-error' : undefined}
          />
        {/if}
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 rounded-md transition-colors duration-200"
          on:click={toggleConfirmPasswordVisibility}
          disabled={$isLoading}
          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
        >
          {#if showConfirmPassword}
            <Eye size={20} />
          {:else}
            <EyeOff size={20} />
          {/if}
        </button>
      </div>
      {#if formErrors.confirmPassword}
        <div id="confirmPassword-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
          {formErrors.confirmPassword}
        </div>
      {/if}
    </div>

    <!-- Terms and Conditions -->
    <div class="space-y-3">
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          bind:checked={formData.acceptTerms}
          on:change={() => clearFieldError('acceptTerms')}
          type="checkbox"
          id="terms"
          disabled={$isLoading}
          class="mt-1 h-4 w-4 rounded border-surface-300 text-subslush-blue focus:ring-subslush-blue focus:ring-offset-0 focus:ring-2 transition-colors duration-200"
          class:border-error-500={formErrors.acceptTerms}
          aria-describedby={formErrors.acceptTerms ? 'terms-error' : undefined}
        />
        <span class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
          I agree to the
          <a href="/terms" class="text-subslush-blue dark:text-subslush-blue-light hover:text-subslush-blue-dark dark:hover:text-subslush-blue transition-colors underline underline-offset-2" target="_blank">
            Terms of use
          </a>
          and
          <a href="/privacy" class="text-subslush-pink dark:text-subslush-pink-light hover:text-subslush-pink-dark dark:hover:text-subslush-pink transition-colors underline underline-offset-2" target="_blank">
            Privacy policy
          </a>
        </span>
      </label>
      {#if formErrors.acceptTerms}
        <div id="terms-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
          {formErrors.acceptTerms}
        </div>
      {/if}
    </div>

    <!-- Submit Button -->
    <div class="pt-4">
      <button
        type="submit"
        disabled={$isLoading}
        class="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 focus:ring-offset-2 min-h-[52px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
        style="background: linear-gradient(45deg, #4FC3F7, #F06292);"
        aria-label="Create your SubSlush account"
      >
        {#if $isLoading}
          <Loader2 class="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Creating account...</span>
        {:else}
          <UserPlus class="w-5 h-5" aria-hidden="true" />
          <span>Create account</span>
        {/if}
      </button>
    </div>
  </form>

  <!-- Navigation Links -->
  <div class="text-center">
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Already have an account?
      <button
        type="button"
        on:click={navigateToLogin}
        class="text-subslush-blue dark:text-subslush-blue-light hover:text-subslush-blue-dark dark:hover:text-subslush-blue font-medium transition-colors ml-1"
        disabled={$isLoading}
      >
        Sign in
      </button>
    </p>
  </div>
</div>
