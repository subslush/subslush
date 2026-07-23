import { Logger } from '../utils/logger';
import {
  getProductIdentityTelemetry,
  resetProductIdentityTelemetry,
  resolveDurableProductIdentity,
} from '../utils/productIdentity';

describe('durable product identity resolution', () => {
  beforeEach(() => {
    resetProductIdentityTelemetry();
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('prefers the explicit product and records a conflict without guessing', () => {
    const result = resolveDurableProductIdentity({
      context: 'test',
      recordId: 'row-1',
      explicitProductId: 'product-a',
      parentProductId: 'product-b',
      variantProductId: 'product-a',
    });

    expect(result).toEqual({
      productId: 'product-a',
      source: 'explicit_product_id',
      conflict: true,
      candidates: ['product-a', 'product-b'],
    });
    expect(getProductIdentityTelemetry().conflict).toBe(1);
    expect(Logger.error).toHaveBeenCalledWith(
      'Product identity conflict detected',
      expect.objectContaining({ event: 'catalog_product_identity_conflict' })
    );
  });

  it('supports legacy fallback observably and reports true orphans', () => {
    expect(
      resolveDurableProductIdentity({
        context: 'legacy',
        variantProductId: 'product-a',
      }).source
    ).toBe('legacy_variant_product_id');
    expect(
      resolveDurableProductIdentity({ context: 'orphan', recordId: 'row-2' })
        .productId
    ).toBeNull();

    expect(getProductIdentityTelemetry()).toMatchObject({
      legacy_variant_product_id: 1,
      unresolved: 1,
    });
    expect(Logger.warn).toHaveBeenCalledWith(
      'Legacy product identity fallback used',
      expect.objectContaining({ event: 'catalog_product_identity_fallback' })
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      'Product identity unresolved',
      expect.objectContaining({ event: 'catalog_product_identity_unresolved' })
    );
  });
});
