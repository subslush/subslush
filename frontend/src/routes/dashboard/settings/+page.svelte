<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query';
  import { User, Mail, Lock, Save, HelpCircle } from 'lucide-svelte';
  import { auth, user as authUser } from '$lib/stores/auth.js';
  import { apiClient } from '$lib/api/client.js';
  import { API_ENDPOINTS } from '$lib/utils/constants.js';

  let username = '';
  let email = '';
  let formErrors: Record<string, string> = {};
  let passwordResetMessage = '';
  let resetEmail = '';

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  const extractProfile = (value: unknown): { displayName?: string; email?: string } | null => {
    if (!isRecord(value)) {
      return null;
    }
    const dataValue = value.data;
    if (isRecord(dataValue) && isRecord(dataValue.profile)) {
      return dataValue.profile as { displayName?: string; email?: string };
    }
    if (isRecord(value.profile)) {
      return value.profile as { displayName?: string; email?: string };
    }
    return null;
  };

  const extractErrorFields = (value: unknown): Record<string, string> | null => {
    if (!isRecord(value) || !isRecord(value.response)) {
      return null;
    }
    const dataValue = value.response.data;
    if (isRecord(dataValue) && isRecord(dataValue.errors)) {
      return dataValue.errors as Record<string, string>;
    }
    return null;
  };

  const updateProfileMutation = createMutation({
    mutationFn: async (profileData: { displayName: string; email: string }) => {
      const response = await apiClient.put('/users/profile', profileData);
      return response.data;
    },
    onSuccess: (response) => {
      const profile = extractProfile(response);
      if (profile && $authUser) {
        auth.setUser({
          ...$authUser,
          displayName: profile.displayName || $authUser.displayName,
          email: profile.email || $authUser.email
        });
      }
    },
    onError: (error) => {
      const fields = extractErrorFields(error);
      if (fields) {
        formErrors = fields;
      } else {
        formErrors = { general: 'Failed to update settings. Please try again.' };
      }
    }
  });

  const passwordResetMutation = createMutation({
    mutationFn: async (payload: { email: string }) => {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.PASSWORD_RESET, payload);
      return response.data;
    },
    onSuccess: () => {
      passwordResetMessage = 'Password reset email sent.';
      formErrors = { ...formErrors, password: '' };
    },
    onError: (error) => {
      passwordResetMessage = '';
      const fields = extractErrorFields(error);
      if (fields) {
        formErrors = { ...formErrors, ...fields };
      } else {
        formErrors = { ...formErrors, password: 'Failed to send reset email.' };
      }
    }
  });

  const handleProfileSubmit = (event: Event) => {
    event.preventDefault();
    formErrors = {
      ...formErrors,
      general: 'Username and email are read-only. Contact support if you need to update them.'
    };
  };

  const handlePasswordSubmit = (event: Event) => {
    event.preventDefault();
    const resetErrors: Record<string, string> = {};
    const emailToUse = resetEmail || email;

    if (!emailToUse) {
      resetErrors.password = 'Email is required to send a reset link.';
    }

    formErrors = { ...formErrors, ...resetErrors };
    passwordResetMessage = '';

    if (Object.keys(resetErrors).length === 0) {
      $passwordResetMutation.mutate({ email: emailToUse });
    }
  };

  $: if ($authUser) {
    username =
      $authUser.firstName
      || $authUser.displayName
      || $authUser.email?.split('@')[0]
      || '';
    email = $authUser.email || '';
  }

  $: if ($updateProfileMutation.isSuccess) {
    formErrors = {};
  }

  $: resetEmail = $authUser?.email || email;
</script>

<svelte:head>
  <title>Settings - SubSlush</title>
  <meta name="description" content="Manage your account settings and security." />
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Settings</h1>
    <p class="text-sm text-gray-600 mt-1">Manage account details and security.</p>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center gap-2 mb-4 text-gray-900">
      <User size={18} />
      <h2 class="text-sm font-semibold">Account details</h2>
    </div>

    {#if formErrors.general}
      <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 mb-4">
        {formErrors.general}
      </div>
    {/if}

    <form on:submit={handleProfileSubmit} class="space-y-4">
      <div>
        <label for="username" class="block text-xs font-medium text-gray-700">Username</label>
        <input
          id="username"
          type="text"
          bind:value={username}
          class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          disabled={true}
        />
        {#if formErrors.username}
          <span class="text-xs text-red-600">{formErrors.username}</span>
        {/if}
      </div>

      <div>
        <label for="email" class="block text-xs font-medium text-gray-700">Email</label>
        <div class="relative">
          <Mail size={16} class="absolute left-3 top-3 text-gray-400" />
          <input
            id="email"
            type="email"
            bind:value={email}
            class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-100 pl-10 pr-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            disabled={true}
          />
        </div>
        {#if formErrors.email}
          <span class="text-xs text-red-600">{formErrors.email}</span>
        {/if}
      </div>
      <p class="text-xs text-gray-500">
        Username and email are read-only. Contact support to update them.
      </p>

      <button
        type="submit"
        class="inline-flex items-center gap-2 rounded-lg bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600 cursor-not-allowed"
        disabled={true}
      >
        <Save size={16} />
        Save changes
      </button>
    </form>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center gap-2 mb-4 text-gray-900">
      <Lock size={18} />
      <h2 class="text-sm font-semibold">Reset password</h2>
    </div>

    <form on:submit={handlePasswordSubmit} class="space-y-4">
      <p class="text-sm text-gray-600">
        We will email a reset link to
        <span class="font-medium text-gray-900">{resetEmail || 'your account email'}</span>.
      </p>

      {#if passwordResetMessage}
        <span class="text-xs text-green-700">{passwordResetMessage}</span>
      {/if}
      {#if formErrors.password}
        <span class="text-xs text-red-600">{formErrors.password}</span>
      {/if}

      <button
        type="submit"
        class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        disabled={$passwordResetMutation.isPending}
      >
        <Lock size={16} />
        {$passwordResetMutation.isPending ? 'Sending...' : 'Send reset email'}
      </button>
    </form>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center gap-2 mb-2 text-gray-900">
      <HelpCircle size={18} />
      <h2 class="text-sm font-semibold">PIN reset</h2>
    </div>
    <p class="text-sm text-gray-600">
      Forgot your PIN? Contact support to reset it.
      <a href="/help" class="text-gray-900 font-medium hover:underline">Go to help</a>.
    </p>
  </div>
</div>
