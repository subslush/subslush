import { parseJsonValue } from './json';
import type {
  OwnAccountCredentialRequirement,
  UpgradeOptionsSnapshot,
} from '../types/subscription';

type UpgradeOptionsInput = Record<string, any> | null | undefined;

const OWN_ACCOUNT_REQUIREMENT_KEYS = [
  'own_account_credential_requirement',
  'ownAccountCredentialRequirement',
  'own_account_credentials_mode',
  'ownAccountCredentialsMode',
] as const;

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

export const normalizeOwnAccountCredentialRequirement = (
  value: unknown
): OwnAccountCredentialRequirement | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    [
      'email_and_password',
      'email_password',
      'email+password',
      'credentials_required',
      'password_required',
    ].includes(normalized)
  ) {
    return 'email_and_password';
  }

  if (['email_only', 'email'].includes(normalized)) {
    return 'email_only';
  }

  return null;
};

const readOwnAccountCredentialRequirement = (
  options: UpgradeOptionsInput
): OwnAccountCredentialRequirement | null => {
  if (!options || typeof options !== 'object') {
    return null;
  }

  for (const key of OWN_ACCOUNT_REQUIREMENT_KEYS) {
    const normalized = normalizeOwnAccountCredentialRequirement(options[key]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const resolveOwnAccountCredentialRequirement = (
  options: UpgradeOptionsSnapshot | null | undefined
): OwnAccountCredentialRequirement => {
  const normalized = readOwnAccountCredentialRequirement(
    options as UpgradeOptionsInput
  );
  return normalized ?? 'email_and_password';
};

export const ownAccountCredentialRequirementRequiresPassword = (
  options: UpgradeOptionsSnapshot | null | undefined
): boolean =>
  resolveOwnAccountCredentialRequirement(options) === 'email_and_password';

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
  const ownAccountCredentialRequirement =
    readOwnAccountCredentialRequirement(parsed);

  if (!allowNewAccount && !allowOwnAccount && !manualMonthlyUpgrade) {
    return null;
  }

  return {
    allow_new_account: allowNewAccount,
    allow_own_account: allowOwnAccount,
    manual_monthly_upgrade: manualMonthlyUpgrade,
    ...(ownAccountCredentialRequirement
      ? {
          own_account_credential_requirement: ownAccountCredentialRequirement,
        }
      : {}),
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

  const optionsRecord = options as unknown as Record<string, unknown>;
  const hasOwnAccountRequirementKey = OWN_ACCOUNT_REQUIREMENT_KEYS.some(
    key => optionsRecord[key] !== undefined && optionsRecord[key] !== null
  );
  if (
    hasOwnAccountRequirementKey &&
    !readOwnAccountCredentialRequirement(options as UpgradeOptionsInput)
  ) {
    return {
      valid: false,
      reason: 'invalid_own_account_credential_requirement',
    };
  }

  return { valid: true };
};

export const hasUpgradeOptions = (
  options: UpgradeOptionsSnapshot | null
): boolean => Boolean(options?.allow_new_account || options?.allow_own_account);
