import Fastify from 'fastify';
import { adminFulfillmentRoutes } from '../routes/admin/fulfillment';
import { adminNextRoutes } from '../routes/admin/next';
import { adminTaskRoutes } from '../routes/admin/tasks';
import { adminSubscriptionRoutes } from '../routes/admin/subscriptions';
import { getDatabasePool } from '../config/database';
import { logAdminAction } from '../services/auditLogService';
import { subscriptionService } from '../services/subscriptionService';
import { upgradeSelectionService } from '../services/upgradeSelectionService';

jest.mock('../config/database');
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'admin-user',
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true,
    };
  }),
}));
jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));
jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
}));
jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    getSubscriptionById: jest.fn(),
    updateSubscriptionCredentialsEncryptedValue: jest.fn(),
    updateSubscriptionCredentialsForAdmin: jest.fn(),
    updateSubscriptionStatus: jest.fn(),
  },
}));
jest.mock('../services/upgradeSelectionService', () => ({
  upgradeSelectionService: {
    getSelectionForSubscription: jest.fn(),
    updateSelectionCredentialsEncryptedValue: jest.fn(),
  },
}));
jest.mock('../services/orderService', () => ({
  orderService: {
    listOrders: jest.fn(),
    getOrderById: jest.fn(),
  },
}));
jest.mock('../services/paymentFailureService', () => ({
  paymentFailureService: {
    getFailedPayments: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../services/notificationService', () => ({
  notificationService: {
    createNotification: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockUpgradeSelectionService = upgradeSelectionService as jest.Mocked<
  typeof upgradeSelectionService
>;

const taskA = '123e4567-e89b-42d3-a456-426614174001';
const taskB = '123e4567-e89b-42d3-a456-426614174002';
const subscriptionId = '123e4567-e89b-42d3-a456-426614174010';

const assertNoCredentialMaterial = (payload: unknown): void => {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain('credentials_encrypted');
  expect(serialized).not.toContain('"ciphertext"');
  expect(serialized).not.toMatch(/"credentials"\s*:/);
};

const buildOrderRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  account_email: 'account@example.com',
  account_status: 'active',
  last_login: null,
  is_guest: false,
  guest_claimed_at: null,
  contact_email: 'delivery@example.com',
  total_cents: 2500,
  currency: 'USD',
  coupon_id: null,
  coupon_code: null,
  payment_provider: 'stripe',
  payment_reference: 'pi_123',
  updated_at: new Date('2026-01-01T00:00:00Z'),
  status: 'paid',
  ...overrides,
});

const buildItemRow = (overrides: Record<string, unknown> = {}) => ({
  id: subscriptionId,
  order_item_id: 'item-1',
  product_name: 'Netflix',
  variant_name: 'Premium',
  term_months: 1,
  item_metadata: {},
  product_metadata: {},
  credentials_encrypted: 'delivered-secret',
  subscription_credentials_on_file: true,
  selection_type: 'upgrade_own_account',
  account_identifier: 'customer-login@example.com',
  selection_credentials_on_file: true,
  task_id: taskA,
  task_type: 'credential_provision',
  task_is_issue: false,
  status: 'pending',
  activation_handshake_state: 'none',
  delivered_at: null,
  delivered_by: null,
  delivery_email_sent_at: null,
  revealed_by_customer: false,
  rules_acknowledged: null,
  ...overrides,
});

describe('Admin fulfillment aggregate endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionService.updateSubscriptionCredentialsEncryptedValue.mockResolvedValue(
      true
    );
    mockUpgradeSelectionService.updateSelectionCredentialsEncryptedValue.mockResolvedValue(
      true
    );
  });

  it('returns order aggregate item metadata without decrypted secret fields or credential-view audit logs', async () => {
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [buildOrderRow()] })
      .mockResolvedValueOnce({
        rows: [
          buildItemRow(),
          buildItemRow({
            id: '123e4567-e89b-42d3-a456-426614174011',
            order_item_id: 'item-2',
            product_name: 'Spotify',
            credentials_encrypted: 'second-delivered-secret',
            selection_type: 'upgrade_new_account',
            account_identifier: null,
            selection_credentials_on_file: false,
            task_id: taskB,
          }),
        ],
      });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminFulfillmentRoutes, {
      prefix: '/admin/fulfillment',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/orders/order-1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    assertNoCredentialMaterial(body);
    expect(JSON.stringify(body)).not.toContain('delivered-secret');
    expect(JSON.stringify(body)).not.toContain('second-delivered-secret');
    expect(body.data.items[0]).toMatchObject({
      credentials_on_file: true,
      task_id: taskA,
      task_status: 'open',
      selection_type: 'own_account',
      submitted_account_identifier: 'customer-login@example.com',
      own_account_credentials_on_file: true,
    });
    expect(body.data.items[1]).toMatchObject({
      task_id: taskB,
      selection_type: 'new_account',
      submitted_account_identifier: null,
    });
    expect(body.data.items[0].task_id).not.toBe(body.data.items[1].task_id);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns MMU detail without credentials payload or credential-view audit logs', async () => {
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskA,
            subscription_id: subscriptionId,
            task_type: 'manual_monthly_upgrade',
            due_date: new Date('2026-01-03T00:00:00Z'),
            completed_at: null,
            is_issue: false,
            mmu_cycle_index: 1,
            mmu_cycle_total: 6,
            term_months: 6,
            term_start_at: new Date('2026-01-01T00:00:00Z'),
            service_type: 'Netflix',
            service_plan: 'Premium',
            order_id: 'order-1',
            contact_email: 'delivery@example.com',
            account_email: 'account@example.com',
            upgrade_options_snapshot: {
              manual_monthly_upgrade_interval_months: 1,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskA,
            due_date: new Date('2026-01-03T00:00:00Z'),
            completed_at: null,
            mmu_cycle_index: 1,
            mmu_cycle_total: 6,
          },
        ],
      });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminFulfillmentRoutes, {
      prefix: '/admin/fulfillment',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/fulfillment/mmu-tasks/${taskA}`,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    assertNoCredentialMaterial(body);
    expect(body.data.task).toMatchObject({
      month_label: 'Month 2 of 6',
      next_month_label: 'Month 3 of 6',
      covers_months_from: 2,
      covers_months_to: 2,
      term_months: 6,
      term_start: expect.anything(),
    });
    expect(body.data.cycle_history[0]).toMatchObject({
      month_label: 'Month 2 of 6',
      covers_months_from: 2,
      covers_months_to: 2,
      term_months: 6,
      term_start: expect.anything(),
    });
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns admin-next subscription detail without credential material and without credential-view audit logs', async () => {
    const encryptedPayload =
      '{"version":1,"ciphertext":"abc","iv":"def","tag":"ghi"}';
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: subscriptionId,
            order_id: 'order-1',
            user_id: 'user-1',
            service_type: 'Netflix',
            service_plan: 'Premium',
            status: 'active',
            term_months: 6,
            term_start_at: new Date('2026-01-01T00:00:00Z'),
            start_date: new Date('2026-01-01T00:00:00Z'),
            end_date: new Date('2026-07-01T00:00:00Z'),
            credentials_encrypted: encryptedPayload,
            credentials_on_file: true,
            own_account_credentials_on_file: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskA,
            task_type: 'manual_monthly_upgrade',
            due_date: new Date('2026-02-01T00:00:00Z'),
            completed_at: null,
            is_issue: false,
            notes: null,
            mmu_cycle_index: 1,
            mmu_cycle_total: 6,
          },
        ],
      });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminNextRoutes, { prefix: '/admin/next' });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/next/subscriptions/${subscriptionId}`,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    assertNoCredentialMaterial(body);
    expect(body.data.subscription.credentials_on_file).toBe(true);
    expect(body.data.tasks[0]).toMatchObject({
      month_label: 'Month 2 of 6',
      covers_months_from: 2,
      covers_months_to: 2,
      term_months: 6,
      term_start: expect.anything(),
    });
    expect(mockQuery.mock.calls[0][0]).not.toContain('SELECT s.*');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns admin-next order detail without credential material and without credential-view audit logs', async () => {
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [buildOrderRow()] })
      .mockResolvedValueOnce({ rows: [buildItemRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminNextRoutes, { prefix: '/admin/next' });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/next/orders/order-1',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    assertNoCredentialMaterial(response.json());
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns fulfillment queue and admin-next subscription list without credential material', async () => {
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'order-1',
            contact_email: 'delivery@example.com',
            account_email: 'account@example.com',
            is_guest: false,
            paid_at: new Date('2026-01-01T00:00:00Z'),
            payment_provider: 'stripe',
            payment_reference: 'pi_123',
            total_cents: 2500,
            currency: 'USD',
            subscription_id: subscriptionId,
            subscription_status: 'pending',
            product_name: 'Netflix',
            variant_name: 'Premium',
            term_months: 6,
            product_metadata: {},
            selection_type: 'upgrade_own_account',
            task_id: taskA,
            task_type: 'manual_monthly_upgrade',
            due_date: new Date('2026-02-01T00:00:00Z'),
            mmu_cycle_index: 1,
            mmu_cycle_total: 6,
            upgrade_options_snapshot: {
              manual_monthly_upgrade_interval_months: 1,
            },
            credentials_encrypted: '{"ciphertext":"queue"}',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: subscriptionId,
            order_id: 'order-1',
            status: 'active',
            term_months: 6,
            customer_email: 'customer@example.com',
            product_name: 'Netflix',
            variant_name: 'Premium',
            task_id: taskA,
            task_type: 'manual_monthly_upgrade',
            due_date: new Date('2026-02-01T00:00:00Z'),
            mmu_cycle_index: 1,
            mmu_cycle_total: 6,
            credentials_encrypted: '{"ciphertext":"list"}',
            credentials_on_file: true,
          },
        ],
      });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminFulfillmentRoutes, {
      prefix: '/admin/fulfillment',
    });
    await app.register(adminNextRoutes, { prefix: '/admin/next' });

    const queueResponse = await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/queue?tab=mmu',
    });
    const subscriptionListResponse = await app.inject({
      method: 'GET',
      url: '/admin/next/subscriptions',
    });

    await app.close();

    expect(queueResponse.statusCode).toBe(200);
    expect(subscriptionListResponse.statusCode).toBe(200);
    assertNoCredentialMaterial(queueResponse.json());
    assertNoCredentialMaterial(subscriptionListResponse.json());
    expect(queueResponse.json().data.orders[0].items[0].selection_type).toBe(
      'own_account'
    );
  });

  it('writes one audit entry per MMU task credential reveal request', async () => {
    const mockQuery = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          id: taskA,
          task_type: 'manual_monthly_upgrade',
          subscription_id: subscriptionId,
        },
      ],
    });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: subscriptionId,
        credentials_encrypted: 'mmu-secret',
      },
    } as any);

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/tasks/${taskA}/credentials`,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.credentials).toBe('mmu-secret');
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'subscriptions.credentials.view',
        entityId: subscriptionId,
        metadata: expect.objectContaining({
          context: 'mmu_task_view',
          task_id: taskA,
        }),
      })
    );
  });

  it('writes one audit entry per own-account credential reveal request', async () => {
    mockUpgradeSelectionService.getSelectionForSubscription.mockResolvedValue({
      subscription_id: subscriptionId,
      order_id: 'order-1',
      selection_type: 'upgrade_own_account',
      account_identifier: 'customer-login@example.com',
      credentials_encrypted: 'own-account-password',
      manual_monthly_acknowledged_at: null,
      submitted_at: new Date('2026-01-01T00:00:00Z'),
      locked_at: null,
      reminder_24h_at: null,
      reminder_48h_at: null,
      auto_selected_at: null,
      upgrade_options_snapshot: {},
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    } as any);

    const app = Fastify();
    await app.register(adminSubscriptionRoutes, {
      prefix: '/admin/subscriptions',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/admin/subscriptions/${subscriptionId}/upgrade-selection/credentials`,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      subscription_id: subscriptionId,
      account_identifier: 'customer-login@example.com',
      credentials: 'own-account-password',
    });
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'subscriptions.selection_credentials.view',
        entityId: subscriptionId,
        metadata: expect.objectContaining({
          accountIdentifier: 'customer-login@example.com',
        }),
      })
    );
  });

  it('flags only the selected item task as an issue', async () => {
    const mockQuery = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          id: taskA,
          completed_at: null,
          is_issue: true,
        },
      ],
    });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: `/admin/tasks/${taskA}/issue`,
      payload: { note: 'Item A has a supplier issue' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe(taskA);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $2 AND completed_at IS NULL'),
      [expect.stringContaining('Item A has a supplier issue'), taskA]
    );
    expect(mockQuery).not.toHaveBeenCalledWith(expect.anything(), [
      expect.anything(),
      taskB,
    ]);
  });

  it('orders queue results server-side oldest-paid-first and MMU due-date-first', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(adminFulfillmentRoutes, {
      prefix: '/admin/fulfillment',
    });

    await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/queue?tab=new_orders&limit=2&offset=0',
    });
    await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/queue?tab=mmu&limit=2&offset=0',
    });
    await app.inject({
      method: 'GET',
      url: '/admin/fulfillment/queue?tab=new_orders&sort=recent&limit=8&offset=0',
    });

    await app.close();

    expect(mockQuery.mock.calls[0][0]).toContain(
      'ORDER BY o.updated_at ASC NULLS LAST, o.id ASC, s.created_at ASC LIMIT $1 OFFSET $2'
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([2, 0]);
    expect(mockQuery.mock.calls[1][0]).toContain(
      'ORDER BY t.due_date ASC NULLS LAST, o.id ASC, t.id ASC LIMIT $1 OFFSET $2'
    );
    expect(mockQuery.mock.calls[1][1]).toEqual([2, 0]);
    expect(mockQuery.mock.calls[2][0]).toContain(
      'ORDER BY o.updated_at DESC NULLS LAST, o.id ASC, s.created_at ASC LIMIT $1 OFFSET $2'
    );
    expect(mockQuery.mock.calls[2][1]).toEqual([8, 0]);
  });
});
