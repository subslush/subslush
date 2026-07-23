import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('product-centric API contract sources', () => {
  it('keeps runtime routes and exported schemas product-first and additive', () => {
    const subscriptionsRoute = read('src/routes/subscriptions.ts');
    const subscriptionsSchema = read('src/schemas/subscription.ts');
    const paymentsRoute = read('src/routes/payments.ts');

    for (const source of [
      subscriptionsRoute,
      subscriptionsSchema,
      paymentsRoute,
    ]) {
      expect(source).toContain("{ required: ['product_id'] }");
      expect(source).toContain("{ required: ['variant_id'] }");
    }
    expect(subscriptionsSchema).toContain('pricing_snapshot_id');
    expect(paymentsRoute).toContain("context: 'payment_quote'");
    expect(paymentsRoute).toContain("context: 'payment_checkout'");
    expect(paymentsRoute).toContain('sendSellableProductError');
  });

  it('keeps the canonical core free of the legacy pricing adapter', () => {
    const checkoutPricing = read('src/services/checkoutPricingService.ts');
    const subscriptionsRoute = read('src/routes/subscriptions.ts');
    const paymentsRoute = read('src/routes/payments.ts');
    const legacyAdapter = read('src/services/variantPricingService.ts');

    expect(checkoutPricing).toContain("from './sellableProductService'");
    expect(checkoutPricing).not.toContain("from './variantPricingService'");
    expect(subscriptionsRoute).not.toContain('resolveVariantPricing');
    expect(paymentsRoute).not.toContain('resolveVariantPricing');
    expect(legacyAdapter).toContain('resolveSellableProduct');
  });

  it('documents every stable code, deprecation signal, and removal gate', () => {
    const docs = read('docs/product-api-contract.md');
    const errors = read('src/utils/catalogApiErrors.ts');
    const frontendPaymentTypes = read('frontend/src/lib/types/payment.ts');

    for (const code of [
      'PRODUCT_UNAVAILABLE',
      'INVALID_FIXED_CONFIGURATION',
      'STALE_PRICE',
      'UNSUPPORTED_CURRENCY',
      'LEGACY_IDENTIFIER_CONFLICT',
      'INVALID_DURATION',
    ]) {
      expect(errors).toContain(code);
      expect(docs).toContain(code);
    }
    expect(docs).toContain('## Removal gates');
    expect(docs).toContain('catalog_api_legacy_variant_used');
    expect(frontendPaymentTypes).toContain('product_id: string');
    expect(frontendPaymentTypes).toContain('catalog_pricing_snapshot_id');
  });
});
