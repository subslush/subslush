import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../database/migrations/20260223_120000_add_pay4bit_fx_pricing_foundations.sql'
);

function extractSection(content: string, marker: RegExp): string {
  const match = content.match(marker);
  return match?.[1]?.trim() || '';
}

describe('Milestone 1 migration: pay4bit + FX foundations', () => {
  it('contains non-empty UP and DOWN migrations', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const upSql = extractSection(
      sql,
      /-- Up Migration\s*\n([\s\S]*?)(?=-- Down Migration|$)/i
    );
    const downSql = extractSection(sql, /-- Down Migration\s*\n([\s\S]*?)$/i);

    expect(upSql.length).toBeGreaterThan(0);
    expect(downSql.length).toBeGreaterThan(0);
    expect(upSql).toContain('BEGIN;');
    expect(upSql).toContain('COMMIT;');
    expect(downSql).toContain('BEGIN;');
    expect(downSql).toContain('COMMIT;');
  });

  it('adds required milestone 1 tables, columns, and provider constraints', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const upSql = extractSection(
      sql,
      /-- Up Migration\s*\n([\s\S]*?)(?=-- Down Migration|$)/i
    );

    expect(upSql).toContain('CREATE TABLE IF NOT EXISTS fx_rate_fetches');
    expect(upSql).toContain('CREATE TABLE IF NOT EXISTS fx_rate_cache');
    expect(upSql).toContain('CREATE TABLE IF NOT EXISTS pricing_publish_runs');
    expect(upSql).toContain(
      'CREATE TABLE IF NOT EXISTS subscription_reminder_events'
    );

    expect(upSql).toContain('ADD COLUMN IF NOT EXISTS pricing_snapshot_id');
    expect(upSql).toContain('ADD COLUMN IF NOT EXISTS settlement_currency');
    expect(upSql).toContain('ADD COLUMN IF NOT EXISTS settlement_total_cents');
    expect(upSql).toContain(
      'ADD COLUMN IF NOT EXISTS settlement_total_price_cents'
    );

    expect(upSql).toContain(
      "CHECK (provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin'))"
    );
    expect(upSql).toContain(
      "payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')"
    );
    expect(upSql).toContain(
      "payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')"
    );
  });

  it('restores pre-milestone provider constraints in DOWN migration', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const downSql = extractSection(sql, /-- Down Migration\s*\n([\s\S]*?)$/i);

    expect(downSql).toContain(
      "CHECK (provider IN ('nowpayments', 'stripe', 'manual', 'admin'))"
    );
    expect(downSql).toContain(
      "payment_provider IN ('nowpayments', 'stripe', 'manual', 'admin')"
    );

    expect(downSql).toContain('DROP TABLE IF EXISTS subscription_reminder_events');
    expect(downSql).toContain('DROP TABLE IF EXISTS pricing_publish_runs');
    expect(downSql).toContain('DROP TABLE IF EXISTS fx_rate_cache');
    expect(downSql).toContain('DROP TABLE IF EXISTS fx_rate_fetches');
  });
});
