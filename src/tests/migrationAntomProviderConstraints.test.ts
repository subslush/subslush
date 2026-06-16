import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../database/migrations/20260615_120000_add_antom_provider_constraints.sql'
);

function extractSection(content: string, marker: RegExp): string {
  const match = content.match(marker);
  return match?.[1]?.trim() || '';
}

describe('Migration: add Antom provider constraints', () => {
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

  it('adds antom to provider constraints while retaining payop/paypal/pay4bit/stripe', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const upSql = extractSection(
      sql,
      /-- Up Migration\s*\n([\s\S]*?)(?=-- Down Migration|$)/i
    );

    expect(upSql).toContain(
      "provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')"
    );
    expect(upSql).toContain(
      "payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')"
    );
    expect(upSql).toContain(
      "payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')"
    );
  });

  it('removes antom in DOWN while keeping payop/paypal/pay4bit/stripe values', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const downSql = extractSection(sql, /-- Down Migration\s*\n([\s\S]*?)$/i);

    expect(downSql).toContain(
      "provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')"
    );
    expect(downSql).toContain(
      "payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')"
    );
    expect(downSql).toContain(
      "payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')"
    );
  });
});
