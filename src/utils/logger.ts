import { env } from '../config/environment';

const REDACTED = '[REDACTED]';
const SENSITIVE_LOG_KEY =
  /(?:credential|password|passcode|(?:^|[_-])pin(?:[_-]|$)|token|secret|authorization|cookie|signature|jwt|activation[_-]?link|raw[_-]?body|request[_-]?body)/i;
const SECRET_ASSIGNMENT =
  /((?:access_?token|refresh_?token|claim_?token|token|secret|password|passcode|pin|authorization|signature|credentials?(?:_encrypted)?)\s*[=:]\s*)([^\s&,;"'<>}]+)/gi;
const SECRET_QUERY_PARAM =
  /([?&](?:access_?token|refresh_?token|claim_?token|token|secret|signature)=)([^&#\s"'<>]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_TOKEN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PRIVATE_KEY =
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;

const redactSensitiveString = (value: string): string =>
  value
    .replace(PRIVATE_KEY, REDACTED)
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
    .replace(JWT_TOKEN, REDACTED)
    .replace(SECRET_QUERY_PARAM, `$1${REDACTED}`)
    .replace(SECRET_ASSIGNMENT, `$1${REDACTED}`);

export const redactSensitiveLogValue = (
  value: unknown,
  seen = new WeakSet<object>()
): unknown => {
  if (typeof value === 'string') return redactSensitiveString(value);
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    const error = value as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
    };
    return {
      name: error.name,
      message: redactSensitiveString(error.message),
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(error.statusCode !== undefined
        ? { statusCode: error.statusCode }
        : {}),
      ...(error.responseBody !== undefined
        ? {
            responseBody: redactSensitiveLogValue(error.responseBody, seen),
          }
        : {}),
    };
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveLogValue(item, seen));
  }
  const safe: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    safe[key] = SENSITIVE_LOG_KEY.test(key)
      ? REDACTED
      : redactSensitiveLogValue(nested, seen);
  }
  return safe;
};

const redactArgs = (args: unknown[]): unknown[] =>
  args.map(arg => redactSensitiveLogValue(arg));

export class Logger {
  static info(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.log(
        `[INFO] ${new Date().toISOString()} - ${redactSensitiveString(message)}`,
        ...redactArgs(args)
      );
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.warn(
        `[WARN] ${new Date().toISOString()} - ${redactSensitiveString(message)}`,
        ...redactArgs(args)
      );
    }
  }

  static error(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.error(
        `[ERROR] ${new Date().toISOString()} - ${redactSensitiveString(message)}`,
        ...redactArgs(args)
      );
    }
  }

  static debug(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV === 'development') {
      console.debug(
        `[DEBUG] ${new Date().toISOString()} - ${redactSensitiveString(message)}`,
        ...redactArgs(args)
      );
    }
  }
}
