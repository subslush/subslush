import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('frontend durable product identity flow', () => {
  it('persists product identity in cart state and sends it in pricing and checkout', () => {
    const cart = read('src/lib/stores/cart.ts');
    const pricingSync = read('src/lib/utils/cartPricingSync.ts');
    const checkout = read('src/routes/checkout/+page.svelte');

    expect(cart).toContain('productId?: string');
    expect(cart).toContain('pricingSnapshotId?: string');
    expect(cart).toContain('candidate.product_id');
    expect(pricingSync).toContain('product_id: item.productId');
    expect(pricingSync).not.toContain('variant_id: item.variantId');
    expect(checkout).toContain('product_id: productId');
    expect(checkout).toContain('pricing_snapshot_id: item.pricingSnapshotId');
    expect(checkout).toContain('item.productId ||');
  });

  it('quarantines variant-only saved carts with a recoverable notice', () => {
    const cart = read('src/lib/stores/cart.ts');
    const checkout = read('src/routes/checkout/+page.svelte');

    expect(cart).toContain('!item.productId');
    expect(cart).toContain('cartRecoveryNotice');
    expect(cart).toContain('product information was outdated');
    expect(checkout).toContain('$cartRecoveryNotice');
    expect(checkout).toContain('role="status"');
    expect(checkout).toContain("errorCode === 'STALE_PRICE'");
    expect(checkout).toContain('please review the updated total');
  });

  it('uses product identity in the authenticated purchase flow', () => {
    const purchaseFlow = read('src/lib/components/PurchaseFlow.svelte');
    const paymentTypes = read('src/lib/types/payment.ts');

    expect(purchaseFlow).toContain('product_id: selectedPlan.product_id');
    expect(purchaseFlow).toContain("selectedPlan.catalog_mode === 'legacy_variant'");
    expect(paymentTypes).toContain('product_id: string');
    expect(paymentTypes).toContain('@deprecated Legacy compatibility only');
  });

  it('sets a product id at every current public add-to-cart entry point', () => {
    for (const path of [
      'src/lib/components/home/SubscriptionGrid.svelte',
      'src/lib/components/home/HomeNav.svelte',
      'src/routes/browse/products/[slug]/+page.svelte',
    ]) {
      const source = read(path);
      const addCalls = source.split('cart.addItem({').slice(1);
      expect(addCalls.length).toBeGreaterThan(0);
      for (const call of addCalls) {
        expect(call.split('});', 1)[0]).toMatch(/\bproductId\s*(?::|,)/);
      }
    }
  });
});
