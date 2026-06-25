import { buildTikTokProductProperties } from '../services/tiktokEventsService';

describe('buildTikTokProductProperties', () => {
  it('includes a nonblank content_id in the top-level properties and contents array', () => {
    const properties = buildTikTokProductProperties({
      value: 19.99,
      currency: 'usd',
      contentId: '  netflix-premium-12m  ',
      contentName: 'Netflix Premium',
      contentCategory: 'Streaming',
      price: 19.99,
      brand: 'Netflix',
    });

    expect(properties).toEqual({
      value: 19.99,
      currency: 'USD',
      content_id: 'netflix-premium-12m',
      content_type: 'product',
      content_name: 'Netflix Premium',
      content_category: 'Streaming',
      price: 19.99,
      brand: 'Netflix',
      contents: [
        {
          content_id: 'netflix-premium-12m',
          content_type: 'product',
          content_name: 'Netflix Premium',
          content_category: 'Streaming',
          price: 19.99,
          quantity: 1,
        },
      ],
    });
  });

  it('does not emit blank content identifiers', () => {
    const properties = buildTikTokProductProperties({
      currency: 'eur',
      contentId: '   ',
      contentName: '  ',
      contentCategory: null,
      price: null,
    });

    expect(properties).toEqual({
      currency: 'EUR',
      content_type: 'product',
    });
  });
});
