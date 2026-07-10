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

config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const toIso = value => (value instanceof Date ? value.toISOString() : value || null);

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
             COALESCE(mmu.delivered_at, mmu.start_date) AS inferred_anchor,
             CASE
               WHEN mmu.term_months > 1
                 THEN mmu.term_months + (mmu.term_months - 1)
               ELSE mmu.term_months
             END AS projected_total_months_if_unfixed
      FROM mmu
      LEFT JOIN task_history ON task_history.subscription_id = mmu.id
      ORDER BY mmu.id
    `);
    await client.query('COMMIT');

    if (result.rows.length === 0) {
      console.log('No active MMU subscriptions found.');
      return;
    }

    const findings = result.rows.map(row => {
      const termStart = new Date(row.term_start_at);
      const inferredAnchor = new Date(row.inferred_anchor);
      const firstCompletedTaskCreatedAt = row.first_completed_task_created_at
        ? new Date(row.first_completed_task_created_at)
        : null;
      const anchorMovedAfterCompletion = Boolean(
        firstCompletedTaskCreatedAt &&
          termStart.getTime() > firstCompletedTaskCreatedAt.getTime()
      );
      const anchorDiffersFromInitialDelivery = Boolean(
        !Number.isNaN(inferredAnchor.getTime()) &&
          Math.abs(termStart.getTime() - inferredAnchor.getTime()) > 60 * 60 * 1000
      );
      const projectedExcessMonths = Math.max(
        0,
        Number(row.projected_total_months_if_unfixed) - Number(row.term_months)
      );
      const flags = [];
      if (anchorMovedAfterCompletion) {
        flags.push('anchor_after_first_completed_task_created');
      }
      if (anchorDiffersFromInitialDelivery) flags.push('anchor_differs_from_initial_delivery');
      if (projectedExcessMonths > 0 && Number(row.completed_cycles) > 0) {
        flags.push(`repeat_schedule_can_overdeliver_by_${projectedExcessMonths}_months`);
      }

      return {
        subscription_id: row.id,
        order_id: row.order_id,
        customer_email: row.customer_email,
        purchased_term_months: Number(row.term_months),
        interval_months: Number(row.interval_months),
        immutable_anchor_currently_stored: toIso(row.term_start_at),
        inferred_initial_delivery_anchor: toIso(row.inferred_anchor),
        first_completed_task_created_at: toIso(row.first_completed_task_created_at),
        completed_cycles: Number(row.completed_cycles),
        highest_completed_cycle_index: row.max_completed_cycle,
        projected_total_months_if_unfixed: Number(row.projected_total_months_if_unfixed),
        projected_excess_months_if_unfixed: projectedExcessMonths,
        flags,
      };
    });

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
