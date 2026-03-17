import { getDatabasePool } from '../config/database';
import { emailService } from '../services/emailService';
import { notificationService } from '../services/notificationService';
import {
  isSubscriptionReminderDue,
  runSubscriptionReminderSweep,
} from '../services/jobs/subscriptionJobs';

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  notificationService: {
    createNotification: jest.fn(),
  },
}));

jest.mock('../services/emailService', () => ({
  emailService: {
    send: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type ReminderCandidateRow = {
  id: string;
  user_id: string;
  user_email: string;
  service_type: string;
  service_plan: string;
  end_date: Date;
  term_months: number;
  product_name: string;
  variant_name: string;
};

type ReminderEventRow = {
  id: string;
  notification_id: string | null;
  email_sent_at: Date | null;
};

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockNotificationService = notificationService as jest.Mocked<
  typeof notificationService
>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

function eventKey(
  subscriptionId: string,
  reminderStage: string,
  targetExpiryAt: Date
): string {
  return `${subscriptionId}:${reminderStage}:${targetExpiryAt.toISOString()}`;
}

function createReminderPool(candidates: ReminderCandidateRow[]) {
  const events = new Map<string, ReminderEventRow>();
  let eventCounter = 1;

  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM subscriptions s')) {
      return { rows: candidates };
    }

    if (sql.includes('INSERT INTO subscription_reminder_events')) {
      const subscriptionId = String(params[0]);
      const reminderStage = String(params[1]);
      const targetExpiryAt = new Date(params[2]);
      const key = eventKey(subscriptionId, reminderStage, targetExpiryAt);

      if (events.has(key)) {
        return { rows: [] };
      }

      const row: ReminderEventRow = {
        id: `event-${eventCounter++}`,
        notification_id: null,
        email_sent_at: null,
      };
      events.set(key, row);

      return {
        rows: [
          {
            id: row.id,
            notification_id: row.notification_id,
            email_sent_at: row.email_sent_at,
          },
        ],
      };
    }

    if (sql.includes('FROM subscription_reminder_events')) {
      const subscriptionId = String(params[0]);
      const reminderStage = String(params[1]);
      const targetExpiryAt = new Date(params[2]);
      const key = eventKey(subscriptionId, reminderStage, targetExpiryAt);
      const row = events.get(key);
      if (!row) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            id: row.id,
            notification_id: row.notification_id,
            email_sent_at: row.email_sent_at,
          },
        ],
      };
    }

    if (
      sql.includes('UPDATE subscription_reminder_events') &&
      sql.includes('notification_id')
    ) {
      const eventId = String(params[0]);
      const notificationId = String(params[1]);
      for (const row of events.values()) {
        if (row.id === eventId) {
          row.notification_id = row.notification_id ?? notificationId;
          break;
        }
      }
      return { rows: [] };
    }

    if (
      sql.includes('UPDATE subscription_reminder_events') &&
      sql.includes('email_sent_at')
    ) {
      const eventId = String(params[0]);
      for (const row of events.values()) {
        if (row.id === eventId && !row.email_sent_at) {
          row.email_sent_at = new Date();
          break;
        }
      }
      return { rows: [] };
    }

    if (sql.includes('SELECT id') && sql.includes('FROM notifications')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  return {
    pool: {
      query,
    },
    events,
  };
}

describe('subscription reminder jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('evaluates exact 7d/3d/24h reminder windows', () => {
    const now = new Date('2026-02-24T10:00:00.000Z');

    expect(
      isSubscriptionReminderDue({
        targetExpiryAt: new Date('2026-03-03T10:00:00.000Z'),
        reminderHours: 168,
        now,
      })
    ).toBe(true);

    expect(
      isSubscriptionReminderDue({
        targetExpiryAt: new Date('2026-02-27T09:00:00.000Z'),
        reminderHours: 72,
        now,
      })
    ).toBe(true);

    expect(
      isSubscriptionReminderDue({
        targetExpiryAt: new Date('2026-02-25T10:00:00.000Z'),
        reminderHours: 24,
        now,
      })
    ).toBe(true);

    expect(
      isSubscriptionReminderDue({
        targetExpiryAt: new Date('2026-03-03T07:59:59.000Z'),
        reminderHours: 168,
        now,
      })
    ).toBe(false);
  });

  it('creates reminder events once, creates notifications once, and never sends reminder emails on rerun', async () => {
    const now = new Date('2026-02-24T10:00:00.000Z');
    const candidates: ReminderCandidateRow[] = [
      {
        id: 'sub-7d',
        user_id: 'user-1',
        user_email: 'user1@example.com',
        service_type: 'spotify',
        service_plan: 'premium',
        end_date: new Date('2026-03-03T10:00:00.000Z'),
        term_months: 1,
        product_name: 'Spotify',
        variant_name: 'Premium',
      },
      {
        id: 'sub-3d',
        user_id: 'user-2',
        user_email: 'user2@example.com',
        service_type: 'netflix',
        service_plan: 'standard',
        end_date: new Date('2026-02-27T10:00:00.000Z'),
        term_months: 1,
        product_name: 'Netflix',
        variant_name: 'Standard',
      },
      {
        id: 'sub-24h',
        user_id: 'user-3',
        user_email: 'user3@example.com',
        service_type: 'youtube',
        service_plan: 'family',
        end_date: new Date('2026-02-25T10:00:00.000Z'),
        term_months: 1,
        product_name: 'YouTube',
        variant_name: 'Family',
      },
    ];

    const { pool, events } = createReminderPool(candidates);
    mockGetDatabasePool.mockReturnValue(pool as any);

    let notificationCounter = 1;
    mockNotificationService.createNotification.mockImplementation(
      async () =>
        ({
          success: true,
          data: {
            id: `notif-${notificationCounter++}`,
          },
        }) as any
    );

    await runSubscriptionReminderSweep(now);
    await runSubscriptionReminderSweep(now);

    expect(events.size).toBe(3);
    expect(mockNotificationService.createNotification).toHaveBeenCalledTimes(3);
    expect(mockEmailService.send).not.toHaveBeenCalled();

    for (const event of events.values()) {
      expect(event.notification_id).toBeTruthy();
      expect(event.email_sent_at).toBeNull();
    }
  });
});
