import { scryptSync, timingSafeEqual } from 'crypto';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';

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

const verifyResetCode = (code: string, salt: string, hash: string): boolean => {
  const derived = scryptSync(code, salt, RESET_CODE_KEY_LENGTH).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');

  if (hashBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, derivedBuffer);
};

class PinResetService {
  async requestReset(
    _userId: string,
    _requestedBy: string
  ): Promise<PinResetRequestResult> {
    return createErrorResult('pin_deprecated');
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
