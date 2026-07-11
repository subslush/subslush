import { describe, expect, it } from '@jest/globals';
import {
  normalizeStrictRulesText,
  normalizeUpgradeOptionsMetadata,
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

  it('normalizes manual monthly interval months when valid', () => {
    const options = normalizeUpgradeOptions({
      upgrade_options: {
        allow_new_account: false,
        allow_own_account: false,
        manual_monthly_upgrade: true,
        manual_monthly_upgrade_interval_months: 2,
      },
    });

    expect(options).toEqual({
      allow_new_account: false,
      allow_own_account: false,
      manual_monthly_upgrade: true,
      manual_monthly_upgrade_interval_months: 2,
    });
  });

  it('drops invalid manual monthly interval during normalization', () => {
    const options = normalizeUpgradeOptions({
      upgrade_options: {
        allow_new_account: false,
        allow_own_account: false,
        manual_monthly_upgrade: true,
        manual_monthly_upgrade_interval_months: 24,
      },
    });

    expect(options).toEqual({
      allow_new_account: false,
      allow_own_account: false,
      manual_monthly_upgrade: true,
    });
  });

  it('marks invalid manual monthly interval values as invalid', () => {
    const result = validateUpgradeOptions({
      allow_new_account: false,
      allow_own_account: false,
      manual_monthly_upgrade: true,
      manual_monthly_upgrade_interval_months: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(
      'invalid_manual_monthly_upgrade_interval_months'
    );
  });

  it('normalizes activation handshake and strict rules flags', () => {
    const options = normalizeUpgradeOptions({
      upgrade_options: {
        activation_link_handshake: true,
        activation_instructions_template: 'Confirm readiness first.',
        strict_rules: true,
        strict_rules_text: '<p>No profile changes.</p>',
        strict_rules_version: 2,
      },
    });

    expect(options).toEqual({
      allow_new_account: false,
      allow_own_account: false,
      manual_monthly_upgrade: false,
      activation_link_handshake: true,
      activation_instructions_template: 'Confirm readiness first.',
      strict_rules: true,
      strict_rules_text: '<p>No profile changes.</p>',
      strict_rules_version: 2,
    });
  });

  it('preserves strict rules as literal text for escaped rendering', () => {
    const metadata = normalizeUpgradeOptionsMetadata({
      upgrade_options: {
        strict_rules: true,
        strict_rules_text:
          '<script>alert(1)</script>\n<img src=x onerror=alert(2)>Line 2',
        strict_rules_version: 5,
      },
    });

    expect(metadata?.upgrade_options.strict_rules_text).toBe(
      '<script>alert(1)</script>\n<img src=x onerror=alert(2)>Line 2'
    );
    expect(normalizeUpgradeOptions(metadata as any)).toMatchObject({
      strict_rules: true,
      strict_rules_text:
        '<script>alert(1)</script>\n<img src=x onerror=alert(2)>Line 2',
      strict_rules_version: 5,
    });
  });

  it('preserves literal comparison characters in rules text', () => {
    expect(
      normalizeStrictRulesText('Passwords must be < 20 chars and > 8.')
    ).toBe('Passwords must be < 20 chars and > 8.');
  });
});
