import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { logAdminAction } from '../../services/auditLogService';

const APPLY_SCRIPT_PATH = resolve(
  process.cwd(),
  'database/migrations/20251016_121000_prelaunch_data_migration_apply.sql'
);

export async function adminMigrationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/preview',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pool = getDatabasePool();
        const tableExists = async (tableName: string): Promise<boolean> => {
          const result = await pool.query(
            'SELECT to_regclass($1) AS table_name',
            [`public.${tableName}`]
          );
          return !!result.rows[0]?.table_name;
        };

        const duplicatesUsers = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM (
             SELECT lower(email) AS email_norm
             FROM users
             GROUP BY lower(email)
             HAVING COUNT(*) > 1
           ) dupes`
        );

        const duplicatesPreRegs = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM (
             SELECT lower(email) AS email_norm
             FROM pre_registrations
             GROUP BY lower(email)
             HAVING COUNT(*) > 1
           ) dupes`
        );

        const eligibleMatches = await pool.query(
          `WITH pre AS (
             SELECT id, email, lower(email) AS email_norm
             FROM pre_registrations
           ),
           usr AS (
             SELECT id, email, lower(email) AS email_norm
             FROM users
           ),
           pre_dupes AS (
             SELECT email_norm
             FROM pre
             GROUP BY email_norm
             HAVING COUNT(*) > 1
           ),
           usr_dupes AS (
             SELECT email_norm
             FROM usr
             GROUP BY email_norm
             HAVING COUNT(*) > 1
           )
           SELECT COUNT(*)::int AS count
           FROM pre
           JOIN usr USING (email_norm)
           WHERE email_norm NOT IN (SELECT email_norm FROM pre_dupes)
             AND email_norm NOT IN (SELECT email_norm FROM usr_dupes)`
        );

        const unmatchedPreRegs = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM pre_registrations pr
           LEFT JOIN users u ON lower(u.email) = lower(pr.email)
           WHERE u.id IS NULL`
        );

        const preLaunchMappable = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM pre_launch_rewards pl
           JOIN pre_registrations pr ON pr.id = pl.user_id
           WHERE pr.user_id IS NOT NULL`
        );

        const referralMappable = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM referral_rewards rr
           JOIN pre_registrations pr ON pr.id = rr.user_id
           WHERE pr.user_id IS NOT NULL`
        );

        const hasCalendarVouchers = await tableExists('calendar_vouchers');
        const calendarVouchers = hasCalendarVouchers
          ? await pool.query(
              `SELECT COUNT(*)::int AS count
               FROM calendar_vouchers cv
               JOIN pre_registrations pr ON pr.id = cv.user_id
               WHERE pr.user_id IS NOT NULL`
            )
          : { rows: [{ count: 0 }] };

        const hasRaffleEntries = await tableExists('calendar_raffle_entries');
        const raffleEntries = hasRaffleEntries
          ? await pool.query(
              `SELECT COALESCE(SUM(cre.count), 0)::int AS count
               FROM calendar_raffle_entries cre
               JOIN pre_registrations pr ON pr.id = cre.user_id
               WHERE pr.user_id IS NOT NULL`
            )
          : { rows: [{ count: 0 }] };

        const duplicateEmails =
          (duplicatesUsers.rows[0]?.count || 0) +
          (duplicatesPreRegs.rows[0]?.count || 0);

        return SuccessResponses.ok(reply, {
          dryRun: true,
          mappedUsers: eligibleMatches.rows[0]?.count || 0,
          unmatchedPreRegistrations: unmatchedPreRegs.rows[0]?.count || 0,
          duplicateEmails,
          rewardsMigrated:
            (preLaunchMappable.rows[0]?.count || 0) +
            (referralMappable.rows[0]?.count || 0),
          vouchersMigrated: calendarVouchers.rows[0]?.count || 0,
          raffleEntriesMigrated: raffleEntries.rows[0]?.count || 0,
        });
      } catch (error) {
        Logger.error('Admin migration preview failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to run migration preview'
        );
      }
    }
  );

  fastify.post(
    '/apply',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pool = getDatabasePool();
        const sql = await readFile(APPLY_SCRIPT_PATH, 'utf8');

        await pool.query(sql);

        const mappedUsersResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM pre_registrations
           WHERE user_id IS NOT NULL`
        );

        const rewardsMigratedResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM user_perks
           WHERE metadata->>'migration_key' = '20251016_prelaunch_sync_v1'`
        );

        const vouchersMigratedResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM user_vouchers
           WHERE metadata->>'migration_key' = '20251016_prelaunch_sync_v1'`
        );

        const raffleEntriesMigratedResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM user_raffle_entries
           WHERE metadata->>'migration_key' = '20251016_prelaunch_sync_v1'`
        );

        const auditPayload = {
          applied: true,
          mappedUsers: mappedUsersResult.rows[0]?.count || 0,
          rewardsMigrated: rewardsMigratedResult.rows[0]?.count || 0,
          vouchersMigrated: vouchersMigratedResult.rows[0]?.count || 0,
          raffleEntriesMigrated:
            raffleEntriesMigratedResult.rows[0]?.count || 0,
        };

        await logAdminAction(request, {
          action: 'migration.prelaunch.apply',
          entityType: 'prelaunch_migration',
          entityId: null,
          after: auditPayload,
        });

        return SuccessResponses.ok(reply, {
          applied: true,
          mappedUsers: mappedUsersResult.rows[0]?.count || 0,
          rewardsMigrated: rewardsMigratedResult.rows[0]?.count || 0,
          vouchersMigrated: vouchersMigratedResult.rows[0]?.count || 0,
          raffleEntriesMigrated:
            raffleEntriesMigratedResult.rows[0]?.count || 0,
        });
      } catch (error) {
        Logger.error('Admin migration apply failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to apply migration');
      }
    }
  );
}
