import { redactSensitiveLogValue } from '../utils/logger';

describe('logger secret redaction', () => {
  it('redacts nested credentials, tokens, signatures, request bodies and errors', () => {
    const credential = 'qa-credential-SHOULD-NOT-LOG';
    const token = 'qa-token-SHOULD-NOT-LOG';
    const signature = 'qa-signature-SHOULD-NOT-LOG';
    const error = Object.assign(new Error(`Bearer ${token}`), {
      statusCode: 401,
      responseBody: { access_token: token },
    });

    const redacted = redactSensitiveLogValue({
      subscriptionId: 'sub-1',
      updates: {
        credentials_encrypted: credential,
        activation_link: `https://activate.test/?token=${token}`,
      },
      signature,
      requestBody: { password: credential },
      error,
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).toContain('sub-1');
    expect(serialized).not.toContain(credential);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(signature);
    expect(serialized).toContain('[REDACTED]');
  });

  it('redacts secret-bearing strings even without a sensitive object key', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const value = redactSensitiveLogValue(
      `Claim: https://example.test/claim?token=${token} Authorization: Bearer eyJabc.def.ghi`
    );

    expect(value).not.toContain(token);
    expect(value).not.toContain('eyJabc.def.ghi');
    expect(value).toContain('token=[REDACTED]');
  });
});
