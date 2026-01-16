import { randomBytes } from 'crypto';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { Logger } from '../utils/logger';
import { hashPin, isValidPin, verifyPin } from '../utils/pin';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';
import { orderService } from './orderService';

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 10;
const PIN_TOKEN_TTL_SECONDS = 10 * 60;
const PIN_TOKEN_PREFIX = 'pin:token:';

export type PinSetResult =
  | { success: true; pinSetAt: Date }
  | {
      success: false;
      reason:
        | 'pin_already_set'
        | 'no_paid_order'
        | 'user_not_found'
        | 'invalid_pin'
        | 'internal';
      error?: string;
    };

export type PinVerificationResult =
  | { success: true }
  | {
      success: false;
      reason: 'not_set' | 'locked' | 'invalid' | 'user_not_found' | 'internal';
      lockedUntil?: Date;
      attemptsRemaining?: number;
      failedAttempts?: number;
      lockoutTriggered?: boolean;
      error?: string;
    };

export interface PinTokenPayload {
  userId: string;
  verifiedAt: string;
}

export type PinTokenResult = ServiceResult<{
  token: string;
  expiresAt: Date;
  expiresInSeconds: number;
}>;

export type PinTokenConsumeResult = ServiceResult<PinTokenPayload>;

class PinService {
  async getPinStatus(
    userId: string
  ): Promise<ServiceResult<{ hasPin: boolean; pinSetAt: Date | null }>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'SELECT pin_hash, pin_set_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return createErrorResult('User not found');
      }

      const row = result.rows[0];
      const hasPin = Boolean(row.pin_hash);

      return createSuccessResult({
        hasPin,
        pinSetAt: hasPin ? row.pin_set_at : null,
      });
    } catch (error) {
      Logger.error('Failed to get PIN status:', error);
      return createErrorResult('Failed to get PIN status');
    }
  }

  async setPin(userId: string, pin: string): Promise<PinSetResult> {
    if (!isValidPin(pin)) {
      return { success: false, reason: 'invalid_pin' };
    }

    try {
      const pool = getDatabasePool();
      const userResult = await pool.query(
        'SELECT pin_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return { success: false, reason: 'user_not_found' };
      }

      if (userResult.rows[0]?.pin_hash) {
        return { success: false, reason: 'pin_already_set' };
      }

      const hasPaidOrder = await orderService.hasPaidOrder(userId);
      if (!hasPaidOrder) {
        return { success: false, reason: 'no_paid_order' };
      }

      const hashedPin = hashPin(pin);
      const updateResult = await pool.query(
        `
        UPDATE users
        SET pin_hash = $1,
            pin_set_at = NOW(),
            pin_failed_attempts = 0,
            pin_locked_until = NULL
        WHERE id = $2
        RETURNING pin_set_at
        `,
        [hashedPin, userId]
      );

      if (updateResult.rows.length === 0) {
        return { success: false, reason: 'user_not_found' };
      }

      return {
        success: true,
        pinSetAt: updateResult.rows[0].pin_set_at,
      };
    } catch (error) {
      Logger.error('Failed to set PIN:', error);
      return {
        success: false,
        reason: 'internal',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyPin(userId: string, pin: string): Promise<PinVerificationResult> {
    if (!isValidPin(pin)) {
      return { success: false, reason: 'invalid', attemptsRemaining: 0 };
    }

    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const result = await client.query(
        `
        SELECT pin_hash, pin_failed_attempts, pin_locked_until
        FROM users
        WHERE id = $1
        FOR UPDATE
        `,
        [userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return { success: false, reason: 'user_not_found' };
      }

      const row = result.rows[0];
      const pinHash = row.pin_hash as string | null;
      const failedAttempts = Number(row.pin_failed_attempts || 0);
      const lockedUntil = row.pin_locked_until
        ? new Date(row.pin_locked_until)
        : null;

      if (!pinHash) {
        await client.query('COMMIT');
        transactionOpen = false;
        return { success: false, reason: 'not_set' };
      }

      const now = new Date();
      if (lockedUntil && lockedUntil > now) {
        await client.query('COMMIT');
        transactionOpen = false;
        return {
          success: false,
          reason: 'locked',
          lockedUntil,
          lockoutTriggered: false,
        };
      }

      if (verifyPin(pin, pinHash)) {
        await client.query(
          `
          UPDATE users
          SET pin_failed_attempts = 0,
              pin_locked_until = NULL
          WHERE id = $1
          `,
          [userId]
        );
        await client.query('COMMIT');
        transactionOpen = false;
        return { success: true };
      }

      const nextAttempts = failedAttempts + 1;
      let newLockedUntil: Date | null = null;
      if (nextAttempts >= PIN_MAX_ATTEMPTS) {
        newLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000);
      }

      await client.query(
        `
        UPDATE users
        SET pin_failed_attempts = $1,
            pin_locked_until = $2
        WHERE id = $3
        `,
        [nextAttempts, newLockedUntil, userId]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      if (newLockedUntil) {
        return {
          success: false,
          reason: 'locked',
          lockedUntil: newLockedUntil,
          failedAttempts: nextAttempts,
          lockoutTriggered: true,
        };
      }

      return {
        success: false,
        reason: 'invalid',
        attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - nextAttempts),
        failedAttempts: nextAttempts,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to verify PIN:', error);
      return {
        success: false,
        reason: 'internal',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback PIN verification transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }

  async issuePinToken(userId: string): Promise<PinTokenResult> {
    try {
      if (!redisClient.isConnected()) {
        return createErrorResult('Redis unavailable');
      }

      const token = randomBytes(32).toString('hex');
      const payload: PinTokenPayload = {
        userId,
        verifiedAt: new Date().toISOString(),
      };

      const client = redisClient.getClient();
      await client.setex(
        `${PIN_TOKEN_PREFIX}${token}`,
        PIN_TOKEN_TTL_SECONDS,
        JSON.stringify(payload)
      );

      return createSuccessResult({
        token,
        expiresAt: new Date(Date.now() + PIN_TOKEN_TTL_SECONDS * 1000),
        expiresInSeconds: PIN_TOKEN_TTL_SECONDS,
      });
    } catch (error) {
      Logger.error('Failed to issue PIN token:', error);
      return createErrorResult(
        error instanceof Error ? error.message : 'Failed to issue PIN token'
      );
    }
  }

  async consumePinToken(token: string): Promise<PinTokenConsumeResult> {
    try {
      if (!redisClient.isConnected()) {
        return createErrorResult('Redis unavailable');
      }

      const client = redisClient.getClient();
      const key = `${PIN_TOKEN_PREFIX}${token}`;
      const payloadRaw = await client.get(key);

      if (!payloadRaw) {
        return createErrorResult('PIN token not found');
      }

      await client.del(key);

      const payload = JSON.parse(payloadRaw) as PinTokenPayload;
      if (!payload.userId || !payload.verifiedAt) {
        return createErrorResult('Invalid PIN token payload');
      }

      return createSuccessResult(payload);
    } catch (error) {
      Logger.error('Failed to consume PIN token:', error);
      return createErrorResult(
        error instanceof Error ? error.message : 'Failed to consume PIN token'
      );
    }
  }
}

export const pinService = new PinService();
