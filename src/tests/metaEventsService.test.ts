import crypto from 'crypto';
import type { FastifyRequest } from 'fastify';
import {
  buildMetaCustomData,
  buildMetaRequestContext,
  buildMetaServerEvent,
  buildMetaUserData,
} from '../services/metaEventsService';

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

describe('Meta Conversions API payload construction', () => {
  it('normalizes and hashes identifiers while preserving network match data', () => {
    expect(
      buildMetaUserData({
        email: '  Buyer@Example.COM ',
        phone: '+46 (70) 123-45-67',
        externalId: 'user-123',
        context: {
          ip: '203.0.113.10',
          userAgent: 'Meta CAPI test agent',
          fbp: 'fb.1.1700000000.123456789',
          fbc: 'fb.1.1700000000.click-id',
        },
      })
    ).toEqual({
      em: [sha256('buyer@example.com')],
      ph: [sha256('46701234567')],
      external_id: [sha256('user-123')],
      client_ip_address: '203.0.113.10',
      client_user_agent: 'Meta CAPI test agent',
      fbp: 'fb.1.1700000000.123456789',
      fbc: 'fb.1.1700000000.click-id',
    });
  });

  it('maps the existing commerce model to Meta custom_data', () => {
    expect(
      buildMetaCustomData({
        value: 29.99,
        currency: 'sek',
        content_name: 'Premium plan',
        content_category: 'streaming',
        contents: [{ content_id: 'variant-1', quantity: 2, price: 14.995 }],
      })
    ).toEqual({
      value: 29.99,
      currency: 'SEK',
      content_ids: ['variant-1'],
      content_type: 'product',
      content_name: 'Premium plan',
      content_category: 'streaming',
      contents: [{ id: 'variant-1', quantity: 2, item_price: 14.995 }],
    });
  });

  it('builds a valid Purchase event with the browser/server deduplication ID', () => {
    const event = buildMetaServerEvent({
      eventName: 'Purchase',
      eventId: 'order-123_purchase',
      eventTime: 1_750_000_000,
      email: 'buyer@example.com',
      context: {
        url: 'https://subslush.com/checkout/antom?status=success',
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
      },
      customData: { currency: 'USD', value: 19.99 },
    });

    expect(event).toMatchObject({
      event_name: 'Purchase',
      event_time: 1_750_000_000,
      event_id: 'order-123_purchase',
      event_source_url: 'https://subslush.com/checkout/antom?status=success',
      action_source: 'website',
      custom_data: { currency: 'USD', value: 19.99 },
    });
  });

  it('rejects website events without a user agent and Purchases without value', () => {
    expect(
      buildMetaServerEvent({
        eventName: 'Search',
        eventId: 'search-1',
        email: 'buyer@example.com',
        context: { url: 'https://subslush.com/search' },
      })
    ).toBeNull();

    expect(
      buildMetaServerEvent({
        eventName: 'Purchase',
        eventId: 'purchase-1',
        email: 'buyer@example.com',
        context: {
          url: 'https://subslush.com/checkout/success',
          userAgent: 'Mozilla/5.0',
        },
        customData: { currency: 'USD' },
      })
    ).toBeNull();
  });

  it('captures source URL, forwarded IP, browser cookies, and click ID', () => {
    const request = {
      headers: {
        referer:
          'https://subslush.com/browse/products/example?fbclid=click-123',
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '198.51.100.8, 10.0.0.1',
      },
      query: {},
      cookies: { _fbp: 'fb.1.1700000000.browser-id' },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    expect(buildMetaRequestContext(request)).toMatchObject({
      ip: '198.51.100.8',
      userAgent: 'Mozilla/5.0',
      url: 'https://subslush.com/browse/products/example?fbclid=click-123',
      fbp: 'fb.1.1700000000.browser-id',
    });
    expect(buildMetaRequestContext(request).fbc).toMatch(
      /^fb\.1\.\d+\.click-123$/
    );
  });
});
