#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const DatabaseConnection = require('./connection');

const apply = process.argv.includes('--apply');
const migrationsDir = path.join(__dirname, 'migrations');

const versionFromFilename = filename => {
  const match = filename.match(/^(\d{8})(?:_(\d{6}))?/);
  if (!match) return null;
  return match[2] ? `${match[1]}_${match[2]}` : match[1];
};
const nameFromFilename = filename =>
  filename
    .replace(/^\d{8}_\d{6}_?/, '')
    .replace(/^\d{8}_?/, '')
    .replace(/\.sql$/, '')
    .replace(/_/g, ' ');

const checksum = content =>
  crypto.createHash('sha256').update(content, 'utf8').digest('hex');

const normalizeIdent = value => value.replace(/"/g, '').trim();

const manualProbesByVersion = {
  '20251002_202000': [
    { kind: 'table', name: 'credit_transactions' },
    { kind: 'table', name: 'credits' },
  ],
  '20251016_110000': [
    { kind: 'table', name: 'users' },
    { kind: 'table', name: 'pre_registrations' },
  ],
  '20251016_120000': [
    { kind: 'table', name: 'users' },
    { kind: 'table', name: 'pre_registrations' },
  ],
  '20260105_140000': [
    { kind: 'column', table: 'subscriptions', column: 'price_cents' },
    { kind: 'column', table: 'subscriptions', column: 'currency' },
    { kind: 'column', table: 'subscriptions', column: 'renewal_method' },
    { kind: 'column', table: 'subscriptions', column: 'next_billing_at' },
  ],
  '20260105_170000': [
    { kind: 'column', table: 'products', column: 'logo_key' },
    { kind: 'column', table: 'products', column: 'category' },
    { kind: 'column', table: 'products', column: 'default_currency' },
    { kind: 'absent_constraint', name: 'subscriptions_service_type_check' },
    { kind: 'absent_constraint', name: 'subscriptions_service_plan_check' },
  ],
  '20260112_130000': [
    { kind: 'column', table: 'orders', column: 'term_months' },
    { kind: 'column', table: 'order_items', column: 'term_months' },
    { kind: 'column', table: 'payments', column: 'term_months' },
    { kind: 'column', table: 'subscriptions', column: 'term_months' },
  ],
  '20260118_120000': [
    { kind: 'absent_table', name: 'leaderboard' },
    { kind: 'absent_table', name: 'viral_metrics' },
  ],
  '20260120_120000': [
    { kind: 'absent_function', name: 'update_leaderboard' },
    { kind: 'absent_function', name: 'create_leaderboard_entry' },
    { kind: 'absent_function', name: 'calculate_contest_prizes' },
    { kind: 'absent_function', name: 'get_contest_status' },
  ],
};

const manualProbeOverridesByVersion = {
  '20251014_120000': [
    { kind: 'table', name: 'pre_registrations' },
    { kind: 'table', name: 'referrals' },
    { kind: 'table', name: 'pre_launch_rewards' },
    { kind: 'table', name: 'referral_rewards' },
    { kind: 'table', name: 'calendar_events' },
    { kind: 'table', name: 'calendar_vouchers' },
    { kind: 'table', name: 'calendar_raffles' },
    { kind: 'table', name: 'calendar_raffle_entries' },
    { kind: 'absent_table', name: 'leaderboard' },
    { kind: 'absent_table', name: 'viral_metrics' },
  ],
  '20251021_120000': [
    { kind: 'index', name: 'ux_payments_provider_payment_id' },
  ],
  '20251231_140000': [
    { kind: 'absent_function', name: 'calculate_contest_prizes' },
    { kind: 'absent_function', name: 'get_contest_status' },
  ],
  '20260119_120000': [
    { kind: 'column', table: 'admin_tasks', column: 'mmu_cycle_index' },
    { kind: 'column', table: 'admin_tasks', column: 'mmu_cycle_total' },
    { kind: 'column', table: 'subscriptions', column: 'credentials_encrypted' },
    { kind: 'column', table: 'subscriptions', column: 'term_start_at' },
    { kind: 'column', table: 'subscriptions', column: 'updated_at' },
    { kind: 'table', name: 'subscription_upgrade_selections' },
    { kind: 'table', name: 'payment_refunds' },
    { kind: 'function', name: 'subscriptions_set_updated_at' },
    { kind: 'index', name: 'idx_upgrade_selections_order_id' },
    { kind: 'index', name: 'idx_subscriptions_term_start_at' },
  ],
};

const stripSqlComments = sql =>
  sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const extractProbes = sql => {
  const searchableSql = stripSqlComments(sql);
  const probes = [];
  const add = probe => {
    if (!probes.some(item => JSON.stringify(item) === JSON.stringify(probe))) {
      probes.push(probe);
    }
  };

  for (const match of searchableSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w.]*)/gi)) {
    add({ kind: 'table', name: normalizeIdent(match[1]) });
  }
  for (const match of searchableSql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][\w.]*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)/gi)) {
    add({
      kind: 'column',
      table: normalizeIdent(match[1]),
      column: normalizeIdent(match[2]),
    });
  }
  for (const match of searchableSql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)/gi)) {
    add({ kind: 'index', name: normalizeIdent(match[1]) });
  }
  for (const match of searchableSql.matchAll(/ADD\s+CONSTRAINT\s+([a-zA-Z_][\w]*)/gi)) {
    add({ kind: 'constraint', name: normalizeIdent(match[1]) });
  }
  for (const match of searchableSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z_][\w.]*)/gi)) {
    add({ kind: 'function', name: normalizeIdent(match[1]).split('.').pop() });
  }
  for (const match of searchableSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([a-zA-Z_][\w.]*)/gi)) {
    add({ kind: 'view', name: normalizeIdent(match[1]) });
  }

  return probes;
};

const probeExists = async (db, probe) => {
  if (probe.kind === 'table') {
    const [schema, table] = probe.name.includes('.')
      ? probe.name.split('.')
      : ['public', probe.name];
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2
       ) AS exists`,
      [schema, table]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'column') {
    const [schema, table] = probe.table.includes('.')
      ? probe.table.split('.')
      : ['public', probe.table];
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
       ) AS exists`,
      [schema, table, probe.column]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'index') {
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = $1
       ) AS exists`,
      [probe.name]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'constraint') {
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = $1
       ) AS exists`,
      [probe.name]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'function') {
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc WHERE proname = $1
       ) AS exists`,
      [probe.name]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'view') {
    const [schema, view] = probe.name.includes('.')
      ? probe.name.split('.')
      : ['public', probe.name];
    const result = await db.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.views
         WHERE table_schema = $1 AND table_name = $2
       ) AS exists`,
      [schema, view]
    );
    return result.rows[0].exists === true;
  }
  if (probe.kind === 'absent_table') {
    return !(await probeExists(db, { kind: 'table', name: probe.name }));
  }
  if (probe.kind === 'absent_constraint') {
    return !(await probeExists(db, { kind: 'constraint', name: probe.name }));
  }
  if (probe.kind === 'absent_function') {
    return !(await probeExists(db, { kind: 'function', name: probe.name }));
  }
  return false;
};

const main = async () => {
  console.log('Migration reconciliation');
  console.log(apply ? 'APPLY MODE - take a backup before proceeding.' : 'DRY RUN - no changes will be written.');

  const db = new DatabaseConnection();
  await db.connect();
  await db.createMigrationsTable();

  const files = (await fs.readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort();
  const applied = new Set((await db.getAppliedMigrations()).map(row => row.version));

  let verified = 0;
  let inserted = 0;
  let unverifiable = 0;

  for (const file of files) {
    const version = versionFromFilename(file);
    if (applied.has(version)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, 'utf8');
    const probes = manualProbeOverridesByVersion[version]
      ? [...manualProbeOverridesByVersion[version]]
      : extractProbes(sql);
    for (const probe of manualProbesByVersion[version] ?? []) {
      if (!probes.some(item => JSON.stringify(item) === JSON.stringify(probe))) {
        probes.push(probe);
      }
    }
    if (probes.length === 0) {
      unverifiable += 1;
      console.log(`SKIP unverifiable ${file}: no object probes found`);
      continue;
    }

    const results = await Promise.all(probes.map(probe => probeExists(db, probe)));
    const ok = results.every(Boolean);
    if (!ok) {
      unverifiable += 1;
      const missing = probes
        .filter((_probe, index) => !results[index])
        .map(probe => JSON.stringify(probe))
        .join(', ');
      console.log(`SKIP unverifiable ${file}: missing ${missing}`);
      continue;
    }

    verified += 1;
    console.log(`${apply ? 'INSERT' : 'WOULD INSERT'} ${file}`);
    if (apply) {
      await db.recordMigration(version, nameFromFilename(file), 0, checksum(sql));
      inserted += 1;
    }
  }

  console.log(`Summary: verified=${verified} inserted=${inserted} unverifiable=${unverifiable}`);
  await db.disconnect();
};

main().catch(async error => {
  console.error('Reconciliation failed:', error.message);
  process.exit(1);
});
