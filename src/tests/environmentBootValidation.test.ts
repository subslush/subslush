describe('environment boot validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('boots with Stripe disabled and Pay4bit enabled', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['STRIPE_ENABLED'] = 'false';
    process.env['STRIPE_SECRET_KEY'] = '';
    process.env['STRIPE_WEBHOOK_SECRET'] = '';

    process.env['PAY4BIT_ENABLED'] = 'true';
    process.env['PAY4BIT_PUBLIC_KEY'] = 'p4b_public_key';
    process.env['PAY4BIT_SECRET_KEY'] = 'p4b_secret_key';
    process.env['PAY4BIT_CALLBACK_URL'] =
      'https://api.example.com/api/v1/payments/pay4bit/callback';
    process.env['PAY4BIT_BASE_URL'] = 'https://api.pay4bit.net';
    process.env['CURRENCYAPI_KEY'] = 'currencyapi_key';

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);

    expect(() => {
      const moduleRef = require('../config/environment');
      expect(moduleRef.env.STRIPE_ENABLED).toBe(false);
      expect(moduleRef.env.PAY4BIT_ENABLED).toBe(true);
      expect(moduleRef.env.PAY4BIT_BASE_URL).toBe('https://api.pay4bit.net');
    }).not.toThrow();

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
