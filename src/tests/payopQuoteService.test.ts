import { catalogService } from '../services/catalogService';
import {
  buildPayopMethodQuotes,
  type PayopMethodQuote,
} from '../services/payments/payopQuoteService';

const livePayDo = {
  identifier: 700001,
  type: 'ewallet',
  formType: 'redirect',
  title: 'PayDo',
  logo: null,
  currencies: ['USD'],
  countries: ['US'],
  config: { fields: [] },
};

const price = (priceCents: number, fxRate: number) => ({
  price_cents: priceCents,
  metadata: { fx_rate: fxRate },
});

describe('Payop quote snapshot resolution', () => {
  afterEach(() => jest.restoreAllMocks());

  const assertUsableQuote = (quotes: PayopMethodQuote[], itemCount: number) => {
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      methodId: 700001,
      processingCurrency: 'USD',
      convertedFromDisplayCurrency: false,
    });
    expect(quotes[0]?.items).toHaveLength(itemCount);
    expect(quotes[0]?.processingTotalCents).toBeGreaterThan(
      quotes[0]?.processingSubtotalCents || 0
    );
  };

  it('quotes a multi-item order from each line snapshot when FX metadata is valid', async () => {
    jest
      .spyOn(catalogService, 'getSnapshotPriceForCurrency')
      .mockImplementation(async ({ variantId, currency, snapshotId }) => {
        const values: Record<string, ReturnType<typeof price>> = {
          'variant-1:snapshot-1:USD': price(1000, 1.1),
          'variant-1:snapshot-1:EUR': price(910, 1),
          'variant-2:snapshot-2:USD': price(2000, 1.1),
          'variant-2:snapshot-2:EUR': price(1818, 1),
        };
        return (values[`${variantId}:${snapshotId}:${currency}`] ||
          null) as any;
      });

    const quotes = await buildPayopMethodQuotes({
      order: {
        id: 'order-multi',
        status: 'pending_payment',
        currency: 'USD',
        total_cents: 3000,
        metadata: { display_currency: 'USD', display_total_cents: 3000 },
        items: [
          {
            id: 'item-1',
            product_variant_id: 'variant-1',
            quantity: 1,
            term_months: 1,
            product_name: 'One',
            metadata: { pricing_snapshot_id: 'snapshot-1' },
          },
          {
            id: 'item-2',
            product_variant_id: 'variant-2',
            quantity: 1,
            term_months: 1,
            product_name: 'Two',
            metadata: { pricing_snapshot_id: 'snapshot-2' },
          },
        ],
      } as any,
      selectedCountry: 'US',
      liveMethods: [livePayDo],
    });

    assertUsableQuote(quotes, 2);
    expect(quotes[0]?.processingSubtotalCents).toBe(3000);
  });

  it('retains the legacy header-snapshot fallback when FX metadata is valid', async () => {
    jest
      .spyOn(catalogService, 'getSnapshotPriceForCurrency')
      .mockImplementation(async ({ currency, snapshotId }) => {
        if (snapshotId !== 'legacy-snapshot') return null;
        return (currency === 'EUR' ? price(1364, 1) : price(1500, 1.1)) as any;
      });

    const quotes = await buildPayopMethodQuotes({
      order: {
        id: 'order-legacy',
        status: 'pending_payment',
        currency: 'USD',
        total_cents: 1500,
        pricing_snapshot_id: 'legacy-snapshot',
        items: [
          {
            id: 'item-legacy',
            product_variant_id: 'variant-legacy',
            quantity: 1,
            term_months: 1,
            product_name: 'Legacy',
            metadata: {},
          },
        ],
      } as any,
      selectedCountry: 'US',
      liveMethods: [livePayDo],
    });

    assertUsableQuote(quotes, 1);
    expect(quotes[0]?.processingSubtotalCents).toBe(1500);
  });
});
