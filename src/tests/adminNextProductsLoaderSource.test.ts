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
  const detailLoader = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../frontend/src/routes/admin-next/products/[productId=uuid]/+page.server.ts'
    ),
    'utf8'
  );
  const detailPage = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../frontend/src/routes/admin-next/products/[productId=uuid]/+page.svelte'
    ),
    'utf8'
  );

  it('does not load variant administration data', () => {
    expect(source).not.toContain('listVariants');
    expect(source).not.toContain('variantCounts');
    expect(page).not.toContain('Variants & Terms');
    expect(page).toContain('Fixed Catalog Fields');
    expect(detailLoader).not.toContain('listVariants');
    expect(detailLoader).not.toContain('listVariantTerms');
    expect(detailPage).not.toMatch(/createVariant|updateVariant|deleteVariant/);
    expect(detailPage).not.toMatch(
      /createVariantTerm|updateVariantTerm|deleteVariantTerm/
    );
    expect(detailPage).not.toContain('Variants & Terms');
    expect(detailPage).toContain('Fixed Catalog Fields');
  });

  it('keeps loaded products visible when the product request succeeds', () => {
    expect(source).toContain("productsResult.status === 'fulfilled'");
    expect(page).toContain('data.products.length === 0 && !data.error');
  });
});
