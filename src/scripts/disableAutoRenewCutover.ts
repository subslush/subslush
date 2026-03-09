import { env } from '../config/environment';
import {
  closeDatabasePool,
  createDatabasePool,
  getDatabasePool,
  testDatabaseConnection,
} from '../config/database';
import { Logger } from '../utils/logger';

type AffectedSubscription = {
  id: string;
  previous_renewal_method: string;
  had_billing_method: boolean;
};

type CutoverSummary = {
  affected: number;
  cardNormalized: number;
  creditsRetained: number;
  fallbackManualReview: number;
};

function classifySubscriptions(rows: AffectedSubscription[]): CutoverSummary {
  let cardNormalized = 0;
  let creditsRetained = 0;
  let fallbackManualReview = 0;

  for (const row of rows) {
    const method = (row.previous_renewal_method || '').toLowerCase();

    if (method === 'credits') {
      creditsRetained += 1;
      continue;
    }

    if (method === 'stripe' || row.had_billing_method) {
      cardNormalized += 1;
      continue;
    }

    fallbackManualReview += 1;
  }

  return {
    affected: rows.length,
    cardNormalized,
    creditsRetained,
    fallbackManualReview,
  };
}

async function previewCutover(): Promise<CutoverSummary> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `SELECT id,
            LOWER(COALESCE(renewal_method, '')) AS previous_renewal_method,
            (billing_payment_method_id IS NOT NULL) AS had_billing_method
     FROM subscriptions
     WHERE auto_renew = TRUE`
  );

  return classifySubscriptions(result.rows as AffectedSubscription[]);
}

async function applyCutover(): Promise<CutoverSummary> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `UPDATE subscriptions s
     SET auto_renew = FALSE,
         next_billing_at = NULL,
         auto_renew_disabled_at = COALESCE(s.auto_renew_disabled_at, NOW()),
         renewal_method = CASE
           WHEN previous.previous_renewal_method = 'credits' THEN 'credits'
           ELSE NULL
         END,
         status_reason = CASE
           WHEN previous.previous_renewal_method = 'credits'
             THEN 'auto_renew_disabled_cutover_manual_credits'
           WHEN previous.previous_renewal_method = 'stripe' OR previous.had_billing_method
             THEN 'auto_renew_disabled_cutover_manual_card_link'
           ELSE 'auto_renew_disabled_cutover_manual_review'
         END
     FROM (
       SELECT id,
              LOWER(COALESCE(renewal_method, '')) AS previous_renewal_method,
              (billing_payment_method_id IS NOT NULL) AS had_billing_method
       FROM subscriptions
       WHERE auto_renew = TRUE
     ) previous
     WHERE s.id = previous.id
     RETURNING s.id,
               previous.previous_renewal_method,
               previous.had_billing_method`
  );

  return classifySubscriptions(result.rows as AffectedSubscription[]);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has('--apply');

  Logger.info('Milestone 5 auto-renew cutover script started', {
    mode: dryRun ? 'dry-run' : 'apply',
  });

  createDatabasePool(env);

  const dbOk = await testDatabaseConnection();
  if (!dbOk) {
    Logger.error('Database connection failed; aborting cutover script');
    process.exit(1);
  }

  try {
    const summary = dryRun ? await previewCutover() : await applyCutover();

    Logger.info('Milestone 5 auto-renew cutover summary', {
      dryRun,
      ...summary,
    });
  } catch (error) {
    Logger.error('Milestone 5 auto-renew cutover failed', { error });
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }

  Logger.info('Milestone 5 auto-renew cutover script complete', {
    mode: dryRun ? 'dry-run' : 'apply',
  });
}

main().catch(error => {
  Logger.error('Unhandled auto-renew cutover script error', { error });
  process.exit(1);
});
