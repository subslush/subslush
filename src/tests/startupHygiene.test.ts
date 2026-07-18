import { Logger } from '../utils/logger';
import {
  NOWPaymentsClient,
  NOWPaymentsError,
} from '../utils/nowpaymentsClient';
import { env } from '../config/environment';
import { startJobs } from '../services/jobs';
import { paymentMonitoringService } from '../services/paymentMonitoringService';

jest.mock('../utils/logger');

describe('startup hygiene', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs the NOWPayments currencies-full fallback warning once per client', async () => {
    const client = new NOWPaymentsClient();
    (client as any).makeRequest = jest
      .fn()
      .mockRejectedValue(new NOWPaymentsError('missing', 404, 'not found'));

    await expect(client.getCurrenciesFull()).resolves.toEqual([]);
    await expect(client.getCurrenciesFull()).resolves.toEqual([]);

    const fallbackWarnings = (Logger.warn as jest.Mock).mock.calls.filter(
      call =>
        typeof call[0] === 'string' &&
        call[0].includes('currencies-full returned 404')
    );
    expect(fallbackWarnings).toHaveLength(1);
    expect(fallbackWarnings[0][0]).toContain('falling back to /currencies');
  });

  it('does not start scheduled jobs or payment monitoring when JOBS_ENABLED=false', async () => {
    const originalJobsEnabled = env.JOBS_ENABLED;
    (env as any).JOBS_ENABLED = false;
    const monitoringSpy = jest.spyOn(
      paymentMonitoringService,
      'startMonitoring'
    );

    try {
      await startJobs();
    } finally {
      (env as any).JOBS_ENABLED = originalJobsEnabled;
      monitoringSpy.mockRestore();
    }

    expect(Logger.info).toHaveBeenCalledWith('Background jobs are disabled');
    expect(monitoringSpy).not.toHaveBeenCalled();
  });

  it('skips email verification sync once when local users are absent from auth.users', async () => {
    jest.resetModules();
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: '11111111-1111-4111-8111-111111111111' },
        { id: '22222222-2222-4222-8222-222222222222' },
      ],
    });
    const getUserById = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'User not found' },
    });

    jest.doMock('../config/database', () => ({
      getDatabasePool: () => ({ query }),
    }));
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        auth: {
          admin: {
            listUsers: jest.fn().mockResolvedValue({
              data: { users: [{ id: 'supabase-user' }] },
              error: null,
            }),
            getUserById,
          },
        },
      }),
    }));
    jest.doMock('../utils/logger', () => ({ Logger }));

    const { runEmailVerificationSync } = await import(
      '../services/jobs/authJobs'
    );

    await runEmailVerificationSync();

    expect(getUserById).toHaveBeenCalledTimes(1);
    const skipLogs = (Logger.info as jest.Mock).mock.calls.filter(
      call =>
        call[0] ===
        'auth.users unavailable/empty - skipping email verification sync'
    );
    expect(skipLogs).toHaveLength(1);
    expect(Logger.warn).not.toHaveBeenCalledWith(
      'Email verification lookup failed',
      expect.anything()
    );
  });
});
