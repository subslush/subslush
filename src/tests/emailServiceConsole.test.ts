jest.mock('../config/environment', () => ({
  env: {
    EMAIL_PROVIDER: 'console',
    EMAIL_FROM: null,
    EMAIL_REPLY_TO: null,
    APP_BASE_URL: 'http://localhost:3000',
  },
}));

jest.mock('../utils/logger', () => ({
  Logger: { info: jest.fn() },
}));

import { emailService } from '../services/emailService';
import { Logger } from '../utils/logger';

describe('console email transport', () => {
  it('logs a complete one-time guest claim URL without truncation', async () => {
    const token = 'a'.repeat(64);
    const claimUrl = `http://localhost:3000/checkout/claim?token=${token}`;
    const text = `Your order has been delivered.\n\nClaim it here:\n${claimUrl}`;

    await expect(
      emailService.send({
        to: 'qa@example.test',
        subject: 'Claim your order',
        text,
      })
    ).resolves.toEqual({ success: true });

    expect(Logger.info).toHaveBeenCalledWith('Email dispatch (console mode)', {
      to: 'qa@example.test',
      bcc: undefined,
      subject: 'Claim your order',
      text,
    });
    expect((Logger.info as jest.Mock).mock.calls[0][1].text).toContain(token);
  });
});
