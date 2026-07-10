import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../database/migrations/20251016_110000_backfill_users_from_auth.sql'
);

describe('Migration: auth users backfill guard', () => {
  it('guards Supabase auth.users access for local fresh databases', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("table_schema = 'auth'");
    expect(sql).toContain("table_name = 'users'");
    expect(sql).toContain(
      'Skipping auth.users backfill because Supabase auth.users is not present.'
    );
    expect(sql).toContain(
      'users_from_auth skipped because Supabase auth.users is not present.'
    );
  });
});
