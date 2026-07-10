import fs from 'node:fs';
import path from 'node:path';

describe('admin-next products loader contract', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../frontend/src/routes/admin-next/products/+page.server.ts'
    ),
    'utf8'
  );
  const page = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../frontend/src/routes/admin-next/products/+page.svelte'
    ),
    'utf8'
  );

  it('paginates variant requests within the backend limit', () => {
    expect(source).toContain('const VARIANT_PAGE_SIZE = 200');
    expect(source).toContain('offset');
    expect(source).not.toContain('listVariants({ limit: 500 })');
  });

  it('keeps loaded products visible when variant loading fails', () => {
    expect(source).toContain("Couldn't load variant data — retry.");
    expect(source).toContain("productsResult.status === 'fulfilled'");
    expect(page).toContain('data.products.length === 0 && !data.error');
  });
});
