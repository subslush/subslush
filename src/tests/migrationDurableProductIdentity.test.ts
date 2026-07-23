import fs from 'fs';
import path from 'path';

const readMigration = (name: string): string =>
  fs.readFileSync(
    path.join(__dirname, '../../database/migrations', name),
    'utf8'
  );

describe('durable product identity migrations', () => {
  const expand = readMigration(
    '20260721_130000_expand_durable_product_identity.sql'
  );
  const backfill = readMigration(
    '20260721_140000_backfill_durable_product_identity.sql'
  );

  it('expands with nullable product references, indexed NOT VALID FKs and snapshots', () => {
    expect(expand).toContain('ADD COLUMN IF NOT EXISTS product_id UUID');
    expect(expand).toContain(
      'FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT NOT VALID'
    );
    expect(expand).toContain('product_name_snapshot TEXT');
    expect(expand).toContain('fulfillment_config_snapshot JSONB');
    expect(expand).not.toMatch(/product_id UUID NOT NULL/i);
  });

  it('records resolved, unresolved, conflict and aggregate outcomes without deleting history', () => {
    expect(backfill).toContain('product_identity_backfill_audit');
    expect(backfill).toContain("'unresolved'");
    expect(backfill).toContain("'conflict'");
    expect(backfill).toContain("'aggregate'");
    expect(backfill).not.toMatch(
      /DELETE\s+FROM\s+(product_variants|product_variant_terms|price_history|order_items|subscriptions)/i
    );
  });
});
