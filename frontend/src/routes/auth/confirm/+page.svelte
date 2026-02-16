<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, CheckCircle, AlertTriangle } from 'lucide-svelte';
  import { authService } from '$lib/api/auth.js';
  import { auth } from '$lib/stores/auth.js';

  let status: 'verifying' | 'success' | 'error' = 'verifying';
  let message = 'Confirming your email...';
  let detail = 'Hold tight while we activate your account.';
  const EMAIL_VERIFY_REDIRECT_STORAGE_KEY = 'auth:post_verify_redirect';

  const sanitizeRedirectPath = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized.startsWith('/') || normalized.startsWith('//')) {
      return null;
    }
    return normalized;
  };

  const readStoredRedirect = (): string | null => {
    try {
      return sanitizeRedirectPath(
        window.localStorage.getItem(EMAIL_VERIFY_REDIRECT_STORAGE_KEY)
      );
    } catch {
      return null;
    }
  };

  const clearStoredRedirect = (): void => {
    try {
      window.localStorage.removeItem(EMAIL_VERIFY_REDIRECT_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  };

  const extractTokens = () => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const redirectFromQuery = sanitizeRedirectPath(queryParams.get('redirect'));
    const redirectPath = redirectFromQuery || readStoredRedirect();

    return {
      accessToken:
        hashParams.get('access_token') || queryParams.get('access_token') || '',
      refreshToken:
        hashParams.get('refresh_token') || queryParams.get('refresh_token') || '',
      redirectPath,
    };
  };

  onMount(async () => {
    const { accessToken, refreshToken, redirectPath } = extractTokens();
    if (window.history && (window.location.hash || window.location.search)) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!accessToken) {
      status = 'error';
      message = 'Confirmation link is missing or expired.';
      detail = 'Please request a new verification email or sign in to resend it.';
      return;
    }

    try {
      const response = await authService.confirmEmail({
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
      });
      auth.setUser(response.user);
      status = 'success';
      message = 'Email verified.';
      detail = 'Redirecting you now...';
      clearStoredRedirect();
      if (redirectPath) {
        window.location.href = redirectPath;
        return;
      }
      window.location.href = '/auth/verified';
    } catch (error) {
      status = 'error';
      message = 'We could not confirm your email.';
      detail = error instanceof Error ? error.message : 'Please try again or contact support.';
    }
  });
</script>

<svelte:head>
  <title>Confirm Email - SubSlush</title>
  <meta name="description" content="Confirm your email address to activate your SubSlush account." />
</svelte:head>

<div class="space-y-6 text-center">
  <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 text-white shadow-lg">
    {#if status === 'verifying'}
      <Loader2 class="h-6 w-6 animate-spin" />
    {:else if status === 'success'}
      <CheckCircle class="h-6 w-6" />
    {:else}
      <AlertTriangle class="h-6 w-6" />
    {/if}
  </div>

  <div class="space-y-2">
    <h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">{message}</h2>
    <p class="text-sm text-surface-600 dark:text-surface-400">{detail}</p>
  </div>

  {#if status === 'error'}
    <a
      href="/auth/login"
      class="inline-flex items-center justify-center rounded-lg border border-surface-200 px-4 py-2 text-sm font-semibold text-surface-900 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-100 dark:hover:bg-surface-800"
    >
      Back to login
    </a>
  {/if}
</div>
