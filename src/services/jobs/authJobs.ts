import { createClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../../config/database';
import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';

const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

type SupabaseUserRecord = {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

function parseVerifiedAt(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function runEmailVerificationSync(): Promise<void> {
  Logger.info('Email verification sync started');
  const pool = getDatabasePool();
  const batchSize = env.EMAIL_VERIFICATION_SYNC_BATCH_SIZE;
  let updated = 0;

  try {
    const result = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email_verified_at IS NULL
        AND status != $1
      ORDER BY created_at ASC
      LIMIT $2
      `,
      ['deleted', batchSize]
    );

    const candidates = result.rows as { id: string }[];
    if (candidates.length === 0) {
      Logger.info('Email verification sync complete', {
        candidates: 0,
        updated: 0,
      });
      return;
    }

    for (const candidate of candidates) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        candidate.id
      );

      if (error || !data?.user) {
        Logger.warn('Email verification lookup failed', {
          userId: candidate.id,
          error: error?.message ?? 'Unknown error',
        });
        continue;
      }

      const supabaseUser = data.user as SupabaseUserRecord;
      const verifiedAt = parseVerifiedAt(
        supabaseUser.email_confirmed_at || supabaseUser.confirmed_at
      );

      if (!verifiedAt) {
        continue;
      }

      const updateResult = await pool.query(
        `
        UPDATE users
        SET email_verified_at = $1
        WHERE id = $2
          AND email_verified_at IS NULL
        `,
        [verifiedAt, candidate.id]
      );

      if ((updateResult.rowCount ?? 0) > 0) {
        updated += 1;
      }
    }

    Logger.info('Email verification sync complete', {
      candidates: candidates.length,
      updated,
    });
  } catch (error) {
    Logger.error('Email verification sync failed:', error);
  }
}
