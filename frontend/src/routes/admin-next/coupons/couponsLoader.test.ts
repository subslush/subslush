import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin-next coupons loader contract', () => {
  it('loads expired coupons so the client toggle can reveal them', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '+page.server.ts'), 'utf8');

    expect(source).toContain(
      'admin.listCoupons({ limit: 200, include_expired: true })'
    );
  });
});
