import { describe, expect, it } from '@jest/globals';
import { validateUpgradeSelectionSubmission } from '../schemas/upgradeSelection';

describe('validateUpgradeSelectionSubmission', () => {
  it('accepts a new-account selection', () => {
    const result = validateUpgradeSelectionSubmission({
      selection_type: 'upgrade_new_account',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selection_type).toBe('upgrade_new_account');
    }
  });

  it('accepts an own-account selection payload', () => {
    const result = validateUpgradeSelectionSubmission({
      selection_type: 'upgrade_own_account',
      account_identifier: 'user@example.com',
      credentials: 'password123',
      manual_monthly_acknowledged: true,
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing selection_type', () => {
    const result = validateUpgradeSelectionSubmission({
      account_identifier: 'user@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('rejects unsupported selection_type values', () => {
    const result = validateUpgradeSelectionSubmission({
      selection_type: 'invalid_option',
    });

    expect(result.success).toBe(false);
  });
});
