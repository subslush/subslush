export const VERIFIED_NOTICE_STORAGE_KEY = 'auth:email_verified_notice';

const CONFIRMATION_PATH = '/auth/confirm';

/**
 * Supabase falls back to the configured Site URL when a requested redirect URL
 * is not allow-listed. Preserve the returned signup session and route it through
 * the application's confirmation handler instead of silently landing at `/`.
 */
export const resolveSupabaseSignupConfirmationTarget = (
  currentUrl: URL
): string | null => {
  if (currentUrl.pathname === CONFIRMATION_PATH) return null;

  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));
  const queryParams = currentUrl.searchParams;
  const flowType = hashParams.get('type') || queryParams.get('type');
  const hasAccessToken = Boolean(
    hashParams.get('access_token') || queryParams.get('access_token')
  );
  const hasConfirmationError = Boolean(
    hashParams.get('error') ||
      hashParams.get('error_code') ||
      queryParams.get('error') ||
      queryParams.get('error_code')
  );

  if (flowType !== 'signup' || (!hasAccessToken && !hasConfirmationError)) {
    return null;
  }

  return `${CONFIRMATION_PATH}${currentUrl.search}${currentUrl.hash}`;
};
