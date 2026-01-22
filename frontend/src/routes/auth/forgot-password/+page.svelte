<script lang="ts">
  import { onMount } from 'svelte';
  import { createMutation } from '@tanstack/svelte-query';
  import { Mail, Loader2 } from 'lucide-svelte';
  import { page } from '$app/stores';
  import { authService } from '$lib/api/auth.js';
  import { ROUTES } from '$lib/utils/constants.js';
  import { passwordResetSchema, type PasswordResetFormData } from '$lib/validation/auth.js';
  import { ZodError } from 'zod';

  let formData: PasswordResetFormData = {
    email: ''
  };
  let formErrors: Partial<Record<keyof PasswordResetFormData, string>> = {};
  let statusMessage = '';
  let statusTone: 'success' | 'error' | null = null;
  let emailInput: HTMLInputElement;

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error !== 'object' || error === null) {
      return fallback;
    }
    const value = error as { message?: unknown };
    return typeof value.message === 'string' ? value.message : fallback;
  };

  onMount(() => {
    const emailParam = $page.url.searchParams.get('email');
    if (emailParam) {
      formData.email = emailParam;
    }
    if (emailInput) {
      emailInput.focus();
    }
  });

  const resetMutation = createMutation({
    mutationFn: async (payload: PasswordResetFormData) => {
      const response = await authService.requestPasswordReset(payload);
      return response;
    },
    onSuccess: () => {
      statusTone = 'success';
      statusMessage = 'If an account exists for that email, a reset link is on its way.';
      formErrors = { ...formErrors, email: undefined };
    },
    onError: (error) => {
      statusTone = 'error';
      statusMessage = getErrorMessage(error, 'Failed to send reset email.');
    }
  });

  function validateForm(): PasswordResetFormData | null {
    formErrors = {};

    try {
      const parsed = passwordResetSchema.parse(formData);
      return parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        error.errors.forEach(err => {
          const field = err.path[0];
          if (typeof field === 'string') {
            formErrors[field as keyof PasswordResetFormData] = err.message;
          }
        });
      }
      return null;
    }
  }

  function handleSubmit(event: Event) {
    event.preventDefault();

    if ($resetMutation.isPending) return;

    statusTone = null;
    statusMessage = '';

    const parsed = validateForm();
    if (!parsed) return;

    $resetMutation.mutate(parsed);
  }

  function clearFieldError(field: keyof PasswordResetFormData) {
    if (formErrors[field]) {
      formErrors = { ...formErrors, [field]: undefined };
    }
  }

  function handleEmailInput() {
    clearFieldError('email');
    if (statusTone) {
      statusTone = null;
      statusMessage = '';
    }
  }
</script>

<svelte:head>
  <title>Reset Password - SubSlush</title>
  <meta name="description" content="Request a password reset link for your SubSlush account." />
</svelte:head>

<div class="space-y-8">
  <!-- Header -->
  <div class="text-center space-y-3">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">Reset your password</h2>
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Enter the email associated with your account and we will send you a reset link.
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

  <!-- Reset Form -->
  <form on:submit={handleSubmit} class="space-y-6" novalidate>
    <div class="space-y-2">
      <label for="email" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
        Email address
      </label>
      <div class="relative">
        <Mail
          size={18}
          class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500"
          aria-hidden="true"
        />
        <input
          bind:this={emailInput}
          bind:value={formData.email}
          on:input={handleEmailInput}
          type="email"
          id="email"
          name="email"
          autocomplete="email"
          autocapitalize="none"
          spellcheck="false"
          required
          disabled={$resetMutation.isPending}
          class="w-full px-4 py-3 pl-10 bg-white dark:bg-surface-900 border rounded-lg text-base text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-subslush-blue/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          class:border-surface-200={!formErrors.email}
          class:dark:border-surface-700={!formErrors.email}
          class:focus:border-subslush-blue={!formErrors.email}
          class:border-error-500={formErrors.email}
          class:dark:border-error-400={formErrors.email}
          class:focus:border-error-500={formErrors.email}
          placeholder="you@example.com"
          aria-describedby={formErrors.email ? 'email-error' : undefined}
          aria-label="Email address"
        />
      </div>
      {#if formErrors.email}
        <div id="email-error" class="text-sm text-error-500 dark:text-error-400" role="alert">
          {formErrors.email}
        </div>
      {/if}
    </div>

    <div class="pt-4">
      <button
        type="submit"
        disabled={$resetMutation.isPending}
        class="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-subslush-blue/20 focus:ring-offset-2 min-h-[52px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
        style="background: linear-gradient(45deg, #4FC3F7, #F06292);"
        aria-label="Send password reset email"
      >
        {#if $resetMutation.isPending}
          <Loader2 class="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Sending...</span>
        {:else}
          <Mail class="w-5 h-5" aria-hidden="true" />
          <span>Send reset link</span>
        {/if}
      </button>
    </div>
  </form>

  <p class="text-center text-sm text-surface-600 dark:text-surface-400">
    Remembered your password?
    <a
      href={ROUTES.AUTH.LOGIN}
      class="ml-1 font-medium text-subslush-blue dark:text-subslush-blue-light hover:text-subslush-blue-dark dark:hover:text-subslush-blue transition-colors"
    >
      Back to sign in
    </a>
  </p>
</div>
