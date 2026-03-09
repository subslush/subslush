import { env } from '../config/environment';
import { pay4bitProvider } from '../services/payments/pay4bitProvider';

describe('pay4bitProvider signatures', () => {
  beforeEach(() => {
    (env as any).PAY4BIT_SECRET_KEY = 'pay4bit_secret_for_tests';
    (env as any).PAY4BIT_PUBLIC_KEY = 'pay4bit_public_for_tests';
    (env as any).PAY4BIT_BASE_URL = 'https://api.pay4bit.net';
  });

  it('generates and verifies check_sign (SHA256)', () => {
    const checkSign = pay4bitProvider.generateCheckSign({
      description: 'Balance reload',
      account: 'user-1',
      amount: '10.00',
    });

    expect(
      pay4bitProvider.verifyCheckSign({
        provided: checkSign,
        description: 'Balance reload',
        account: 'user-1',
        amount: '10.00',
      })
    ).toBe(true);
    expect(
      pay4bitProvider.verifyCheckSign({
        provided: checkSign,
        description: 'Balance reload',
        account: 'user-1',
        amount: '10.01',
      })
    ).toBe(false);
  });

  it('generates and verifies sign (MD5)', () => {
    const sign = pay4bitProvider.generateSign({
      localpayId: '123456',
      account: 'order-1',
      sum: '10.00',
    });

    expect(
      pay4bitProvider.verifySign({
        provided: sign,
        localpayId: '123456',
        account: 'order-1',
        sum: '10.00',
      })
    ).toBe(true);
    expect(
      pay4bitProvider.verifySign({
        provided: sign,
        localpayId: '123456',
        account: 'order-2',
        sum: '10.00',
      })
    ).toBe(false);
  });

  it('builds hosted checkout URL with mandatory signature fields', () => {
    const checkout = pay4bitProvider.buildHostedCheckoutUrl({
      account: 'order-1',
      description: 'Subscription order',
      amount: '10',
      currency: 'usd',
    });

    const url = new globalThis.URL(checkout.checkoutUrl);
    expect(url.origin).toBe('https://api.pay4bit.net');
    expect(url.pathname).toBe('/pay');
    expect(url.searchParams.get('public_key')).toBe('pay4bit_public_for_tests');
    expect(url.searchParams.get('account')).toBe('order-1');
    expect(url.searchParams.get('desc')).toBe('Subscription order');
    expect(url.searchParams.get('sum')).toBe('10.00');
    expect(url.searchParams.get('currency')).toBe('USD');
    expect(url.searchParams.get('sign')).toBe(checkout.checkSign);
    expect(url.searchParams.get('check_sign')).toBe(checkout.checkSign);
  });
});
