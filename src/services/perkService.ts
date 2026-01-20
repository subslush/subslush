import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import { UserPerk, PerkSourceType } from '../types/perk';
import {
  ServiceResult,
  createSuccessResult,
  createErrorResult,
} from '../types/service';

function parseMetadata(value: any): Record<string, any> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function mapPerk(row: any): UserPerk {
  return {
    id: row.id,
    user_id: row.user_id,
    source_type: row.source_type,
    source_id: row.source_id,
    reward_type: row.reward_type,
    tier: row.tier,
    applies_to: row.applies_to,
    free_months: row.free_months,
    founder_status: row.founder_status,
    prize_won: row.prize_won,
    notes: row.notes,
    awarded_at: row.awarded_at,
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at,
  };
}

export class PerkService {
  async listUserPerks(
    userId: string,
    options?: {
      source_type?: PerkSourceType;
      reward_type?: string;
      include_redeemed?: boolean;
    }
  ): Promise<ServiceResult<UserPerk[]>> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [userId];
      let paramCount = 1;
      let sql = 'SELECT * FROM user_perks WHERE user_id = $1';

      if (options?.source_type) {
        sql += ` AND source_type = $${++paramCount}`;
        params.push(options.source_type);
      }

      if (options?.reward_type) {
        sql += ` AND reward_type = $${++paramCount}`;
        params.push(options.reward_type);
      }

      if (!options?.include_redeemed) {
        sql += ` AND (metadata->>'redeemed_at' IS NULL)`;
      }

      sql += ' ORDER BY created_at DESC';

      const result = await pool.query(sql, params);
      return createSuccessResult(result.rows.map(mapPerk));
    } catch (error) {
      Logger.error('Failed to list user perks:', error);
      return createErrorResult('Failed to list user perks');
    }
  }

  async applyPerkToSubscription(
    perkId: string,
    subscriptionId: string,
    appliedByUserId?: string,
    appliedValueCents?: number
  ): Promise<
    ServiceResult<{
      perk: UserPerk;
      subscription_id: string;
      new_end_date: Date;
      new_renewal_date: Date;
    }>
  > {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const perkResult = await client.query(
        'SELECT * FROM user_perks WHERE id = $1 FOR UPDATE',
        [perkId]
      );

      if (perkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Perk not found');
      }

      const perk = mapPerk(perkResult.rows[0]);
      const alreadyRedeemed =
        !!perk.metadata?.['redeemed_at'] ||
        !!perk.metadata?.['redeemedAt'] ||
        !!perk.metadata?.['redeemed_by'] ||
        !!perk.metadata?.['redeemed_by_user_id'] ||
        !!perk.metadata?.['redeemedByUserId'] ||
        perk.metadata?.['is_redeemed'] === true ||
        perk.metadata?.['isRedeemed'] === true;
      if (alreadyRedeemed) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Perk already redeemed');
      }
      if (!perk.free_months || perk.free_months <= 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Perk has no free months to apply');
      }

      if (perk.source_type === 'referral_reward') {
        const rewardLock = await client.query(
          `SELECT is_redeemed, redeemed_at, redeemed_by_user_id
           FROM referral_rewards
           WHERE id = $1
           FOR UPDATE`,
          [perk.source_id]
        );
        if (rewardLock.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('Referral reward not found');
        }
        const rewardRow = rewardLock.rows[0];
        if (
          rewardRow.is_redeemed ||
          rewardRow.redeemed_at ||
          rewardRow.redeemed_by_user_id
        ) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('Perk already redeemed');
        }
      }

      if (perk.source_type === 'pre_launch_reward') {
        const rewardLock = await client.query(
          `SELECT redeemed_at, redeemed_by_user_id
           FROM pre_launch_rewards
           WHERE user_id = $1
           FOR UPDATE`,
          [perk.source_id]
        );
        if (rewardLock.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('Pre-launch reward not found');
        }
        const rewardRow = rewardLock.rows[0];
        if (rewardRow.redeemed_at || rewardRow.redeemed_by_user_id) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return createErrorResult('Perk already redeemed');
        }
      }

      const subscriptionResult = await client.query(
        `SELECT id, user_id, end_date, renewal_date, auto_renew, price_cents
         FROM subscriptions
         WHERE id = $1
         FOR UPDATE`,
        [subscriptionId]
      );

      if (subscriptionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Subscription not found');
      }

      const subscription = subscriptionResult.rows[0];
      if (subscription.user_id !== perk.user_id) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Perk does not belong to subscription owner');
      }

      const rewardColumn =
        perk.source_type === 'referral_reward'
          ? 'referral_reward_id'
          : 'pre_launch_reward_id';

      const subscriptionUpdate = await client.query(
        `UPDATE subscriptions
         SET end_date = end_date + ($1 || ' months')::interval,
             renewal_date = renewal_date + ($1 || ' months')::interval,
             next_billing_at = CASE
               WHEN auto_renew THEN renewal_date + ($1 || ' months')::interval
               ELSE NULL
             END,
             status_reason = $2,
             ${rewardColumn} = $3
         WHERE id = $4
         RETURNING end_date, renewal_date`,
        [perk.free_months, 'perk_redeemed', perk.source_id, subscriptionId]
      );
      if (subscriptionUpdate.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return createErrorResult('Failed to update subscription');
      }
      const newEndDate = new Date(subscriptionUpdate.rows[0].end_date);
      const newRenewalDate = new Date(subscriptionUpdate.rows[0].renewal_date);

      const redemptionMetadata = {
        redeemed_at: new Date().toISOString(),
        redeemed_by: appliedByUserId || null,
        subscription_id: subscriptionId,
        redemption_type: 'subscription_extension',
        free_months: perk.free_months,
      };

      await client.query(
        `UPDATE user_perks
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify(redemptionMetadata), perkId]
      );

      if (perk.source_type === 'referral_reward') {
        await client.query(
          `UPDATE referral_rewards
           SET redeemed_by_user_id = $1,
               redeemed_at = NOW(),
               applied_value_cents = COALESCE($2, applied_value_cents),
               is_redeemed = TRUE,
               subscription_id = $3
           WHERE id = $4`,
          [
            perk.user_id,
            appliedValueCents ?? null,
            subscriptionId,
            perk.source_id,
          ]
        );

        const subscriptionInfo = await client.query(
          `SELECT COALESCE(pv.name, s.service_plan) AS variant_name,
                  COALESCE(p.name, s.service_type) AS product_name
           FROM subscriptions s
           LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
           LEFT JOIN products p ON p.id = pv.product_id
           WHERE s.id = $1`,
          [subscriptionId]
        );
        const productName = subscriptionInfo.rows[0]?.product_name ?? null;
        const variantName = subscriptionInfo.rows[0]?.variant_name ?? null;

        await client.query(
          `INSERT INTO prelaunch_reward_tasks
             (user_id, user_perk_id, referral_reward_id, subscription_id,
              reward_tier, free_months, product_name, variant_name, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
           ON CONFLICT (user_perk_id) DO NOTHING`,
          [
            perk.user_id,
            perk.id,
            perk.source_id,
            subscriptionId,
            perk.tier ?? null,
            perk.free_months,
            productName,
            variantName,
          ]
        );
      } else {
        await client.query(
          `UPDATE pre_launch_rewards
           SET redeemed_by_user_id = $1,
               redeemed_at = NOW(),
               applied_value_cents = COALESCE($2, applied_value_cents)
           WHERE user_id = $3`,
          [perk.user_id, appliedValueCents ?? null, perk.source_id]
        );
      }

      await client.query('COMMIT');
      transactionOpen = false;

      return createSuccessResult({
        perk,
        subscription_id: subscriptionId,
        new_end_date: newEndDate,
        new_renewal_date: newRenewalDate,
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }
      Logger.error('Failed to apply perk to subscription:', error);
      return createErrorResult('Failed to apply perk to subscription');
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error(
            'Failed to rollback perk redemption transaction',
            rollbackError
          );
        }
      }
      client.release();
    }
  }
}

export const perkService = new PerkService();
