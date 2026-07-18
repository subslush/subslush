#!/usr/bin/env node

/*
 * Read-only MMU anchor diagnostic.
 *
 * This intentionally never updates data. It identifies manual-monthly-upgrade
 * subscriptions whose immutable term anchor may have been overwritten by a
 * renewal completion in builds affected by D9.
 */

const path = require('path');
const { config } = require('dotenv');
const { Pool } = require('pg');
const { classifyMmuAnchor } = require('./lib/mmuAnchorDiagnostic');

config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      WITH mmu AS (
        SELECT s.id,
               s.order_id,
               u.email AS customer_email,
               s.term_start_at,
               s.start_date,
               s.delivered_at,
               s.term_months,
               COALESCE(
                 NULLIF((sel.upgrade_options_snapshot->>'manual_monthly_upgrade_interval_months')::int, 0),
                 1
               ) AS interval_months
        FROM subscriptions s
        JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
        JOIN users u ON u.id = s.user_id
        WHERE s.status = 'active'
          AND sel.submitted_at IS NOT NULL
          AND COALESCE((sel.upgrade_options_snapshot->>'manual_monthly_upgrade')::boolean, FALSE) = TRUE
      ), task_history AS (
        SELECT subscription_id,
               COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed_cycles,
               MIN(created_at) FILTER (WHERE completed_at IS NOT NULL) AS first_completed_task_created_at,
               MAX(mmu_cycle_index) FILTER (WHERE completed_at IS NOT NULL)::int AS max_completed_cycle
        FROM admin_tasks
        WHERE task_type = 'manual_monthly_upgrade'
        GROUP BY subscription_id
      )
      SELECT mmu.*,
             COALESCE(task_history.completed_cycles, 0) AS completed_cycles,
             task_history.first_completed_task_created_at,
             task_history.max_completed_cycle,
             COALESCE(mmu.delivered_at, mmu.start_date) AS inferred_anchor
      FROM mmu
      LEFT JOIN task_history ON task_history.subscription_id = mmu.id
      ORDER BY mmu.id
    `);
    await client.query('COMMIT');

    if (result.rows.length === 0) {
      console.log('No active MMU subscriptions found.');
      return;
    }

    const findings = result.rows.map(classifyMmuAnchor);

    console.log(JSON.stringify({ scanned: findings.length, findings }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('MMU anchor diagnostic failed:', error.message);
  process.exitCode = 1;
});
