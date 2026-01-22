<script lang="ts">
  import { onMount } from 'svelte';
  import { createMutation } from '@tanstack/svelte-query';
  import { Eye, EyeOff, Lock, Loader2 } from 'lucide-svelte';
  import { authService } from '$lib/api/auth.js';
  import { ROUTES } from '$lib/utils/constants.js';
  import {
    passwordResetConfirmSchema,
    type PasswordResetConfirmFormData
  } from '$lib/validation/auth.js';
  import { ZodError } from 'zod';

  let formData: PasswordResetConfirmFormData = {
    password: '',
    confirmPassword: ''
  };
  let formErrors: Partial<Record<keyof PasswordResetConfirmFormData, string>> = {};
  let showPassword = false;
  let showConfirmPassword = false;
  let statusMessage = '';
  let statusTone: 'success' | 'error' | null = null;
  let linkInvalid = false;
  let accessToken = '';
  let refreshToken: string | null = null;

  const extractTokens = () => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    return {
      accessToken:
        hashParams.get('access_token') || queryParams.get('access_token') || '',
      refreshToken:
        hashParams.get('refresh_token') || queryParams.get('refresh_token') || '',
      type: hashParams.get('type') || queryParams.get('type') || '',
    };
  };

  const resetMutation = createMutation({
    mutationFn: async (payload: PasswordResetConfirmFormData) => {
      return authService.confirmPasswordReset({
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        password: payload.password,
        confirmPassword: payload.confirmPassword
      });
    },
    onSuccess: () => {
      statusTone = 'success';
      statusMessage = 'Your password has been updated. You can sign in now.';
      formErrors = { ...formErrors, password: undefined, confirmPassword: undefined };
    },
    onError: (error) => {
      statusTone = 'error';
      statusMessage = error instanceof Error ? error.message : 'Failed to update password.';
    }
  });

  $: resetComplete = $resetMutation.isSuccess;

  onMount(() => {
    const { accessToken: token, refreshToken: refresh, type } = extractTokens();
    if (window.history && (window.location.hash || window.location.search)) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!token) {
      linkInvalid = true;
      statusTone = 'error';
      statusMessage = 'Reset link is missing or expired. Please request a new one.';
      return;
    }

    if (type && type !== 'recovery') {
      linkInvalid = true;
      statusTone = 'error';
      statusMessage = 'Reset link is invalid. Please request a new one.';
      return;
    }

    accessToken = token;
    refreshToken = refresh || null;
  });

  function validateForm(): PasswordResetConfirmFormData | null {
    formErrors = {};

    try {
      const parsed = passwordResetConfirmSchema.parse(formData);
      return parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        error.errors.forEach(err => {
          const field = err.path[0];
          if (typeof field === 'string') {
            formErrors[field as keyof PasswordResetConfirmFormData] = err.message;
          }
        });
      }
      return null;
    }
  }

  function handleSubmit(event: Event) {
    event.preventDefault();

    if (linkInvalid || !accessToken || $resetMutation.isPending || resetComplete) {
      return;
    }

    statusTone = null;
    statusMessage = '';

    const parsed = validateForm();
    if (!parsed) return;

    $resetMutation.mutate(parsed);
  }

  function clearFieldError(field: keyof PasswordResetConfirmFormData) {
    if (formErrors[field]) {
      formErrors = { ...formErrors, [field]: undefined };
    }
  }

  function handlePasswordInput() {
    clearFieldError('password');
    if (statusTone) {
      statusTone = null;
      statusMessage = '';
    }
  }

  function handleConfirmInput() {
    clearFieldError('confirmPassword');
    if (statusTone) {
      statusTone = null;
      statusMessage = '';
    }
  }

  function togglePasswordVisibility() {
    showPassword = !showPassword;
  }

  function toggleConfirmPasswordVisibility() {
    showConfirmPassword = !showConfirmPassword;
  }
</script>

<svelte:head>
  <title>Set New Password - SubSlush</title>
  <meta name="description" content="Set a new password for your SubSlush account." />
</svelte:head>

<div class="space-y-8">
  <div class="text-center space-y-3">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Set a new password</h2>
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Choose a strong password you have not used before.
    </p>
  </div>

  {#if statusTone === 'success'}
    <div
      class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
      role="status"
      aria-live="polite"
    >
      {statusMessage}
    </div>
  {:else if statusTone === 'error'}
    <div
      class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
      role="alert"
    >
      {statusMessage}
    </div>
  {/if}

  {#if linkInvalid}
    <div class="text-center space-y-3">
      <a
        href={ROUTES.AUTH.FORGOT_PASSWORD}
        class="inline-flex items-center justify-center rounded-lg border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-900 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-100 dark:hover:bg-surface-800"
      >
        Request a new reset link
      </a>
    </div>
  {:else}
    <form on:submit={handleSubmit} class="space-y-6" novalidate>
      <div class="space-y-2">
        <label for="password" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
          New password
        </label>
        <div class="relative">
          <input
            bind:value={formData.password}
            on:input={handlePasswordInput}
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            autocomplete="new-password"
            required
            disabled={$resetMutation.isPending || resetComplete}
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.password}
            class:dark:border-surface-700={!formErrors.password}
            class:focus:border-subslush-blue={!formErrors.password}
            class:border-error-500={formErrors.password}
            class:dark:border-error-400={formErrors.password}
            class:focus:border-error-500={formErrors.password}
            placeholder="Enter a new password"
            aria-describedby={formErrors.password ? 'password-error' : undefined}
            aria-label="New password"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 rounded-md transition-colors duration-200"
            on:click={togglePasswordVisibility}
            disabled={$resetMutation.isPending || resetComplete}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {#if showPassword}
              <Eye size={20} />
            {:else}
              <EyeOff size={20} />
            {/if}
          </button>
        </div>
        {#if formErrors.password}
          <div id="password-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
            {formErrors.password}
          </div>
        {/if}
      </div>

      <div class="space-y-2">
        <label for="confirmPassword" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
          Confirm password
        </label>
        <div class="relative">
          <input
            bind:value={formData.confirmPassword}
            on:input={handleConfirmInput}
            type={showConfirmPassword ? 'text' : 'password'}
            id="confirmPassword"
            name="confirmPassword"
            autocomplete="new-password"
            required
            disabled={$resetMutation.isPending || resetComplete}
            class="w-full px-4 py-3 pr-12 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            class:border-surface-200={!formErrors.confirmPassword}
            class:dark:border-surface-700={!formErrors.confirmPassword}
            class:focus:border-subslush-blue={!formErrors.confirmPassword}
            class:border-error-500={formErrors.confirmPassword}
            class:dark:border-error-400={formErrors.confirmPassword}
            class:focus:border-error-500={formErrors.confirmPassword}
            placeholder="Confirm your new password"
            aria-describedby={formErrors.confirmPassword ? 'confirm-password-error' : undefined}
            aria-label="Confirm password"
          />
          <button
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300 focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 rounded-md transition-colors duration-200"
            on:click={toggleConfirmPasswordVisibility}
            disabled={$resetMutation.isPending || resetComplete}
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
          <div id="confirm-password-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
            {formErrors.confirmPassword}
          </div>
        {/if}
      </div>

      <div class="pt-4">
        <button
          type="submit"
          disabled={$resetMutation.isPending || resetComplete}
          class="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 focus:ring-offset-2 min-h-[52px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
          style="background: linear-gradient(45deg, #4FC3F7, #F06292);"
          aria-label="Update password"
        >
          {#if $resetMutation.isPending}
            <Loader2 class="w-5 h-5 animate-spin" aria-hidden="true" />
            <span>Updating...</span>
          {:else}
            <Lock class="w-5 h-5" aria-hidden="true" />
            <span>Update password</span>
          {/if}
        </button>
      </div>
    </form>
  {/if}

  <p class="text-center text-sm text-surface-600 dark:text-surface-400">
    Back to
    <a
      href={ROUTES.AUTH.LOGIN}
      class="ml-1 font-medium text-subslush-blue dark:text-subslush-blue-light hover:text-subslush-blue-dark dark:hover:text-subslush-blue transition-colors"
    >
      sign in
    </a>
  </p>
</div>
