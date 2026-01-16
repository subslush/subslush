describe('NOWPayments client base URL selection', () => {
  const originalFetch = globalThis.fetch;
  const originalSandboxMode = process.env['NOWPAYMENTS_SANDBOX_MODE'];
  const originalBaseUrl = process.env['NOWPAYMENTS_BASE_URL'];

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env['NOWPAYMENTS_SANDBOX_MODE'] = originalSandboxMode;
    process.env['NOWPAYMENTS_BASE_URL'] = originalBaseUrl;
  });

  it('uses sandbox base URL when sandbox mode is enabled', async () => {
    jest.resetModules();

    process.env['NOWPAYMENTS_SANDBOX_MODE'] = 'true';
    process.env['NOWPAYMENTS_BASE_URL'] = 'https://api.nowpayments.io/v1';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ message: 'ok' }),
    });
    globalThis.fetch = fetchSpy as any;

    const { nowpaymentsClient } = require('../utils/nowpaymentsClient');
    await nowpaymentsClient.getStatus();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api-sandbox.nowpayments.io/v1/status',
      expect.any(Object)
    );
  });
});
