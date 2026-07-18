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

let authUsersSkipLogged = false;

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

function logAuthUsersSkipOnce(reason: string): void {
  if (authUsersSkipLogged) {
    return;
  }

  authUsersSkipLogged = true;
  Logger.info(
    'auth.users unavailable/empty - skipping email verification sync',
    {
      reason,
    }
  );
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

    const { data: authUsers, error: authUsersError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });

    if (authUsersError) {
      logAuthUsersSkipOnce(authUsersError.message || 'listUsers failed');
      return;
    }

    if (!authUsers?.users || authUsers.users.length === 0) {
      logAuthUsersSkipOnce('no Supabase auth users returned');
      return;
    }

    for (const candidate of candidates) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        candidate.id
      );

      if (error || !data?.user) {
        const message = error?.message ?? 'Unknown error';
        if (/user not found/i.test(message)) {
          logAuthUsersSkipOnce(
            'local users are not present in Supabase auth.users'
          );
          return;
        }
        Logger.warn('Email verification lookup failed', {
          userId: candidate.id,
          error: message,
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
