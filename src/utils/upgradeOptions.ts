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

const MMU_INTERVAL_MIN = 1;
const MMU_INTERVAL_MAX = 12;

const coerceMmuIntervalMonths = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return null;
  }

  if (numeric < MMU_INTERVAL_MIN || numeric > MMU_INTERVAL_MAX) {
    return null;
  }

  return numeric;
};

const coerceString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeStrictRulesText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  // Rules are authored as literal text, not HTML. Preserve merchant-authored
  // angle brackets and entities exactly; every current consumer renders this
  // value through JSON or Svelte text interpolation (never {@html}).
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeUpgradeOptionsMetadata = (
  metadata: Record<string, any> | null | undefined
): Record<string, any> | null | undefined => {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const raw = metadata['upgrade_options'] ?? metadata['upgradeOptions'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return metadata;
  const options = { ...(raw as Record<string, any>) };
  const strictRulesText =
    options['strict_rules_text'] ?? options['strictRulesText'];
  const normalizedText = normalizeStrictRulesText(strictRulesText);
  if (strictRulesText !== undefined && strictRulesText !== null) {
    delete options['strictRulesText'];
    if (normalizedText) {
      options['strict_rules_text'] = normalizedText;
    } else {
      delete options['strict_rules_text'];
    }
  }
  return {
    ...metadata,
    upgrade_options: options,
  };
};

const coercePositiveInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
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
  const manualMonthlyUpgradeIntervalMonths = coerceMmuIntervalMonths(
    parsed['manual_monthly_upgrade_interval_months'] ??
      parsed['manualMonthlyUpgradeIntervalMonths']
  );
  const ownAccountCredentialRequirement =
    readOwnAccountCredentialRequirement(parsed);
  const activationLinkHandshake = coerceBoolean(
    parsed['activation_link_handshake'] ?? parsed['activationLinkHandshake']
  );
  const activationInstructionsTemplate = coerceString(
    parsed['activation_instructions_template'] ??
      parsed['activationInstructionsTemplate']
  );
  const strictRules = coerceBoolean(
    parsed['strict_rules'] ?? parsed['strictRules']
  );
  const strictRulesText = normalizeStrictRulesText(
    parsed['strict_rules_text'] ?? parsed['strictRulesText']
  );
  const strictRulesVersion = coercePositiveInteger(
    parsed['strict_rules_version'] ?? parsed['strictRulesVersion']
  );

  if (
    !allowNewAccount &&
    !allowOwnAccount &&
    !manualMonthlyUpgrade &&
    !activationLinkHandshake &&
    !strictRules
  ) {
    return null;
  }

  return {
    allow_new_account: allowNewAccount,
    allow_own_account: allowOwnAccount,
    manual_monthly_upgrade: manualMonthlyUpgrade,
    ...(manualMonthlyUpgradeIntervalMonths !== null
      ? {
          manual_monthly_upgrade_interval_months:
            manualMonthlyUpgradeIntervalMonths,
        }
      : {}),
    ...(ownAccountCredentialRequirement
      ? {
          own_account_credential_requirement: ownAccountCredentialRequirement,
        }
      : {}),
    ...(activationLinkHandshake
      ? {
          activation_link_handshake: true,
          ...(activationInstructionsTemplate
            ? {
                activation_instructions_template:
                  activationInstructionsTemplate,
              }
            : {}),
        }
      : {}),
    ...(strictRules
      ? {
          strict_rules: true,
          ...(strictRulesText ? { strict_rules_text: strictRulesText } : {}),
          ...(strictRulesVersion
            ? { strict_rules_version: strictRulesVersion }
            : {}),
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
    options.manual_monthly_upgrade ||
    options.activation_link_handshake ||
    options.strict_rules;
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

  const rawInterval = optionsRecord['manual_monthly_upgrade_interval_months'];
  if (rawInterval !== undefined && rawInterval !== null) {
    const interval = coerceMmuIntervalMonths(rawInterval);
    if (interval === null) {
      return {
        valid: false,
        reason: 'invalid_manual_monthly_upgrade_interval_months',
      };
    }
  }

  if (
    options.activation_link_handshake &&
    typeof options.activation_instructions_template === 'string' &&
    options.activation_instructions_template.trim().length === 0
  ) {
    return {
      valid: false,
      reason: 'invalid_activation_instructions_template',
    };
  }

  if (options.strict_rules) {
    if (
      typeof options.strict_rules_text === 'string' &&
      options.strict_rules_text.trim().length === 0
    ) {
      return { valid: false, reason: 'invalid_strict_rules_text' };
    }
    if (
      options.strict_rules_version !== undefined &&
      options.strict_rules_version !== null &&
      !coercePositiveInteger(options.strict_rules_version)
    ) {
      return { valid: false, reason: 'invalid_strict_rules_version' };
    }
  }

  return { valid: true };
};

export const hasUpgradeOptions = (
  options: UpgradeOptionsSnapshot | null
): boolean => Boolean(options?.allow_new_account || options?.allow_own_account);
