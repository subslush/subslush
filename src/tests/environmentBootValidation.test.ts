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
    process.env['PAYPAL_ENABLED'] = 'false';

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    expect(() => {
      const moduleRef = require('../config/environment');
      expect(moduleRef.env.STRIPE_ENABLED).toBe(false);
      expect(moduleRef.env.PAY4BIT_ENABLED).toBe(true);
      expect(moduleRef.env.PAYPAL_ENABLED).toBe(false);
      expect(moduleRef.env.PAY4BIT_BASE_URL).toBe('https://api.pay4bit.net');
    }).not.toThrow();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('allows Antom sandbox mode in a production deployment for controlled test purchases', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['EMAIL_PROVIDER'] = 'resend';
    process.env['EMAIL_FROM'] = 'SubSlush <support@example.com>';
    process.env['RESEND_API_KEY'] = 'resend_api_key';

    process.env['STRIPE_ENABLED'] = 'false';
    process.env['PAY4BIT_ENABLED'] = 'false';
    process.env['PAYOP_ENABLED'] = 'false';
    process.env['PAYPAL_ENABLED'] = 'false';
    process.env['NOWPAYMENTS_SANDBOX_MODE'] = 'false';

    process.env['ANTOM_ENABLED'] = 'true';
    process.env['ANTOM_ENVIRONMENT'] = 'sandbox';
    process.env['ANTOM_CLIENT_ID'] = 'antom_client_id';
    process.env['ANTOM_PRIVATE_KEY'] = 'antom_private_key';
    process.env['ANTOM_PUBLIC_KEY'] = 'antom_public_key';
    process.env['ANTOM_API_DOMAIN'] = 'https://open-sea-global.alipay.com';
    process.env['ANTOM_WEBHOOK_URL'] =
      'https://www.subslush.com/api/v1/payments/antom/webhook';
    process.env['ANTOM_MERCHANT_REGION'] = 'HK';

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    expect(() => {
      const moduleRef = require('../config/environment');
      expect(moduleRef.env.NODE_ENV).toBe('production');
      expect(moduleRef.env.ANTOM_ENABLED).toBe(true);
      expect(moduleRef.env.ANTOM_ENVIRONMENT).toBe('sandbox');
    }).not.toThrow();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      'Warning: Production environment detected but Antom is configured in sandbox mode.\n'
    );
  });
});
