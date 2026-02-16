import { describe, expect, it } from '@jest/globals';
import {
  normalizeUpgradeOptions,
  ownAccountCredentialRequirementRequiresPassword,
  resolveOwnAccountCredentialRequirement,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';

describe('upgradeOptions utilities', () => {
  it('normalizes own-account credential requirement from metadata', () => {
    const options = normalizeUpgradeOptions({
      upgrade_options: {
        allow_new_account: false,
        allow_own_account: true,
        manual_monthly_upgrade: false,
        own_account_credential_requirement: 'email_only',
      },
    });

    expect(options).toEqual({
      allow_new_account: false,
      allow_own_account: true,
      manual_monthly_upgrade: false,
      own_account_credential_requirement: 'email_only',
    });
  });

  it('falls back to email_and_password when requirement is not configured', () => {
    const options = normalizeUpgradeOptions({
      upgrade_options: {
        allow_new_account: false,
        allow_own_account: true,
        manual_monthly_upgrade: false,
      },
    });

    expect(resolveOwnAccountCredentialRequirement(options)).toBe(
      'email_and_password'
    );
    expect(ownAccountCredentialRequirementRequiresPassword(options)).toBe(true);
  });

  it('marks invalid own-account requirement values as invalid', () => {
    const result = validateUpgradeOptions({
      allow_new_account: false,
      allow_own_account: true,
      manual_monthly_upgrade: false,
      own_account_credential_requirement:
        'invalid_value' as unknown as 'email_only',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_own_account_credential_requirement');
  });
});
