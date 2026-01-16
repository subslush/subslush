import { parseJsonValue } from './json';
import type { UpgradeOptionsSnapshot } from '../types/subscription';

type UpgradeOptionsInput = Record<string, any> | null | undefined;

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric > 0;
  }
  return false;
};

export const normalizeUpgradeOptions = (
  metadata: Record<string, any> | null | undefined
): UpgradeOptionsSnapshot | null => {
  if (!metadata) return null;

  const raw = metadata['upgrade_options'] ?? metadata['upgradeOptions'];
  const parsed =
    typeof raw === 'object'
      ? (raw as UpgradeOptionsInput)
      : parseJsonValue<UpgradeOptionsInput>(raw, null);

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const allowNewAccount = coerceBoolean(
    parsed['allow_new_account'] ?? parsed['allowNewAccount']
  );
  const allowOwnAccount = coerceBoolean(
    parsed['allow_own_account'] ?? parsed['allowOwnAccount']
  );
  const manualMonthlyUpgrade = coerceBoolean(
    parsed['manual_monthly_upgrade'] ?? parsed['manualMonthlyUpgrade']
  );

  if (!allowNewAccount && !allowOwnAccount && !manualMonthlyUpgrade) {
    return null;
  }

  return {
    allow_new_account: allowNewAccount,
    allow_own_account: allowOwnAccount,
    manual_monthly_upgrade: manualMonthlyUpgrade,
  };
};

export const validateUpgradeOptions = (
  options: UpgradeOptionsSnapshot | null
): { valid: boolean; reason?: string } => {
  if (!options) {
    return { valid: true };
  }

  const hasAny =
    options.allow_new_account ||
    options.allow_own_account ||
    options.manual_monthly_upgrade;
  if (!hasAny) {
    return { valid: false, reason: 'no_upgrade_options_enabled' };
  }

  return { valid: true };
};

export const hasUpgradeOptions = (
  options: UpgradeOptionsSnapshot | null
): boolean => Boolean(options?.allow_new_account || options?.allow_own_account);
