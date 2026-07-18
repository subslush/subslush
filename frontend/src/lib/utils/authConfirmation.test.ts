import { describe, expect, it } from 'vitest';
import { resolveSupabaseSignupConfirmationTarget } from './authConfirmation.js';

describe('resolveSupabaseSignupConfirmationTarget', () => {
  it('recovers a signup confirmation session sent to the site root', () => {
    const url = new URL(
      'https://subslush.com/#access_token=access&refresh_token=refresh&type=signup'
    );

    expect(resolveSupabaseSignupConfirmationTarget(url)).toBe(
      '/auth/confirm#access_token=access&refresh_token=refresh&type=signup'
    );
  });

  it('does not intercept unrelated auth fragments', () => {
    const url = new URL(
      'https://subslush.com/#access_token=access&type=recovery'
    );

    expect(resolveSupabaseSignupConfirmationTarget(url)).toBeNull();
  });

  it('does not redirect the confirmation route back to itself', () => {
    const url = new URL(
      'https://subslush.com/auth/confirm#access_token=access&type=signup'
    );

    expect(resolveSupabaseSignupConfirmationTarget(url)).toBeNull();
  });
});
