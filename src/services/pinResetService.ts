import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';
import { getDatabasePool } from '../config/database';
import { emailService } from './emailService';
import { Logger } from '../utils/logger';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';

const RESET_CODE_LENGTH = 9;
const RESET_CODE_TTL_MINUTES = 30;
const RESET_CODE_SALT_BYTES = 16;
const RESET_CODE_KEY_LENGTH = 64;

export type PinResetRequestResult = ServiceResult<{
  requestId: string;
  userId: string;
  emailMasked: string;
  expiresAt: Date;
}>;

export type PinResetConfirmResult = ServiceResult<{
  userId: string;
  hadPin: boolean;
  resetAt: Date;
}>;

const generateResetCode = (): string => {
  let code = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
};

const hashResetCode = (code: string, salt: string): string =>
  scryptSync(code, salt, RESET_CODE_KEY_LENGTH).toString('hex');

const verifyResetCode = (code: string, salt: string, hash: string): boolean => {
  const derived = scryptSync(code, salt, RESET_CODE_KEY_LENGTH).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, derivedBuffer);
};

const maskEmail = (email: string): string => {
  const [rawLocal = '', rawDomain = ''] = email.split('@');
  if (!rawLocal || !rawDomain) {
    return email;
  }
  const visible = rawLocal.slice(0, Math.min(2, rawLocal.length));
  const masked = `${visible}${'*'.repeat(Math.max(0, rawLocal.length - visible.length))}`;
  return `${masked}@${rawDomain}`;
};

class PinResetService {
  async requestReset(
    userId: string,
    requestedBy: string
  ): Promise<PinResetRequestResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;
    let requestId: string | null = null;
    let email: string | null = null;
    let expiresAt: Date | null = null;
    let code: string | null = null;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const userResult = await client.query(
        'SELECT email FROM users WHERE id = $1 AND status != $2',
        [userId, 'deleted']
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('user_not_found');
      }

      email = userResult.rows[0].email;

      await client.query(
        `
        UPDATE pin_reset_requests
        SET status = 'expired',
            updated_at = NOW()
        WHERE user_id = $1
          AND status = 'pending'
          AND expires_at < NOW()
        `,
        [userId]
      );

      await client.query(
        `
        UPDATE pin_reset_requests
        SET status = 'superseded',
            updated_at = NOW()
        WHERE user_id = $1
          AND status = 'pending'
        `,
        [userId]
      );

      code = generateResetCode();
      const salt = randomBytes(RESET_CODE_SALT_BYTES).toString('hex');
      const codeHash = hashResetCode(code, salt);
      expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

      const insertResult = await client.query(
        `
        INSERT INTO pin_reset_requests (
          user_id,
          requested_by,
          code_hash,
          code_salt,
          status,
          expires_at
        ) VALUES ($1, $2, $3, $4, 'pending', $5)
        RETURNING id
        `,
        [userId, requestedBy, codeHash, salt, expiresAt]
      );

      requestId = insertResult.rows[0]?.id ?? null;
      if (!requestId) {
        throw new Error('Failed to create PIN reset request');
      }

      await client.query('COMMIT');
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to create PIN reset request:', error);
      return createErrorResult('internal');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback PIN reset request transaction',
            rollbackError
          );
        }
      }
      client.release();
    }

    if (!email || !requestId || !expiresAt || !code) {
      return createErrorResult('request_failed');
    }

    const subject = 'Your PIN reset verification code';
    const text = [
      'We received a request to reset your SubSlush PIN.',
      '',
      `Verification code: ${code}`,
      '',
      `This code expires in ${RESET_CODE_TTL_MINUTES} minutes.`,
      'If you did not request this, you can ignore this email.',
    ].join('\n');

    const html = `
      <p>We received a request to reset your SubSlush PIN.</p>
      <p><strong>Verification code:</strong> ${code}</p>
      <p>This code expires in ${RESET_CODE_TTL_MINUTES} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `.trim();

    const sendResult = await emailService.send({
      to: email,
      subject,
      text,
      html,
      from: 'no-reply@subslush.com',
    });

    if (!sendResult.success) {
      Logger.error('Failed to send PIN reset code email:', sendResult.error);
      await pool.query(
        `
        UPDATE pin_reset_requests
        SET status = 'failed',
            updated_at = NOW()
        WHERE id = $1
        `,
        [requestId]
      );
      return createErrorResult('email_failed');
    }

    return createSuccessResult({
      requestId,
      userId,
      emailMasked: maskEmail(email),
      expiresAt,
    });
  }

  async confirmReset(
    userId: string,
    code: string,
    confirmedBy: string
  ): Promise<PinResetConfirmResult> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const userResult = await client.query(
        'SELECT pin_hash FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('user_not_found');
      }

      const hadPin = Boolean(userResult.rows[0].pin_hash);

      await client.query(
        `
        UPDATE pin_reset_requests
        SET status = 'expired',
            updated_at = NOW()
        WHERE user_id = $1
          AND status = 'pending'
          AND expires_at < NOW()
        `,
        [userId]
      );

      const requestResult = await client.query(
        `
        SELECT id, code_hash, code_salt, expires_at
        FROM pin_reset_requests
        WHERE user_id = $1
          AND status = 'pending'
          AND expires_at >= NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [userId]
      );

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('no_pending_request');
      }

      const requestRow = requestResult.rows[0];
      if (!verifyResetCode(code, requestRow.code_salt, requestRow.code_hash)) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('invalid_code');
      }

      await client.query(
        `
        UPDATE pin_reset_requests
        SET status = 'confirmed',
            confirmed_at = NOW(),
            confirmed_by = $2,
            updated_at = NOW()
        WHERE id = $1
        `,
        [requestRow.id, confirmedBy]
      );

      await client.query(
        `
        UPDATE users
        SET pin_hash = NULL,
            pin_set_at = NULL,
            pin_failed_attempts = 0,
            pin_locked_until = NULL
        WHERE id = $1
        `,
        [userId]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      return createSuccessResult({
        userId,
        hadPin,
        resetAt: new Date(),
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to confirm PIN reset:', error);
      return createErrorResult('internal');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback PIN reset confirmation transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }
}

export const pinResetService = new PinResetService();
