import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../database/migrations/20260427_120000_add_order_compliance_evidence_logs.sql'
);

const extractSection = (content: string, marker: RegExp): string => {
  const match = content.match(marker);
  return match?.[1]?.trim() || '';
};

describe('Migration: add order compliance evidence logs', () => {
  it('contains valid UP and DOWN sections', () => {
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

  it('creates evidence columns required for payment and delivery disputes', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS order_compliance_evidence_logs'
    );
    expect(sql).toContain('customer_email TEXT');
    expect(sql).toContain('paypal_transaction_id TEXT');
    expect(sql).toContain('ip_address TEXT');
    expect(sql).toContain('product_delivered JSONB');
    expect(sql).toContain('delivery_timestamp TIMESTAMP');
    expect(sql).toContain('license_account_access_evidence JSONB');
    expect(sql).toContain(
      "CHECK (event_type IN ('paypal_payment_capture', 'order_delivery', 'credential_reveal'))"
    );
  });
});
