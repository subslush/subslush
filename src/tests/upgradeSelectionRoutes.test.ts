import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { upgradeSelectionService } from '../services/upgradeSelectionService';
import { subscriptionService } from '../services/subscriptionService';

jest.mock('../services/upgradeSelectionService');
jest.mock('../services/subscriptionService');
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
      sessionId: 'session-1',
      isAdmin: false,
    };
  }),
}));
jest.mock('../utils/logger');

const mockUpgradeSelectionService = upgradeSelectionService as jest.Mocked<
  typeof upgradeSelectionService
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

describe('Upgrade selection routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a valid upgrade selection submission', async () => {
    const subscriptionId = '3d1eeb94-9f94-4bdf-8a9a-8b50f1cd8974';
    const selectionSnapshot = {
      allow_new_account: true,
      allow_own_account: false,
      manual_monthly_upgrade: false,
    };

    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: subscriptionId,
        order_id: 'order-1',
      },
    } as any);

    mockUpgradeSelectionService.getSelectionForSubscriptionUser.mockResolvedValue(
      {
        subscription_id: subscriptionId,
        selection_type: null,
        account_identifier: null,
        credentials_encrypted: null,
        manual_monthly_acknowledged_at: null,
        submitted_at: null,
        locked_at: null,
        reminder_24h_at: null,
        reminder_48h_at: null,
        auto_selected_at: null,
        upgrade_options_snapshot: selectionSnapshot,
        created_at: new Date(),
        updated_at: new Date(),
      } as any
    );

    mockUpgradeSelectionService.submitSelection.mockResolvedValue({
      subscription_id: subscriptionId,
      selection_type: 'upgrade_new_account',
      account_identifier: null,
      credentials_encrypted: null,
      manual_monthly_acknowledged_at: null,
      submitted_at: new Date(),
      locked_at: new Date(),
      reminder_24h_at: null,
      reminder_48h_at: null,
      auto_selected_at: null,
      upgrade_options_snapshot: selectionSnapshot,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    mockSubscriptionService.createCredentialProvisionTask.mockResolvedValue(
      true
    );
    mockSubscriptionService.completeSelectionPendingTasks.mockResolvedValue();
    mockSubscriptionService.updateSubscriptionForAdmin.mockResolvedValue({
      success: true,
      data: {},
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/upgrade-selection`,
      payload: {
        selection_type: 'upgrade_new_account',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.locked).toBe(true);
    expect(body.data.selection.selection_type).toBe('upgrade_new_account');
  });

  it('accepts own-account selection with email only when password is not required', async () => {
    const subscriptionId = 'a2f5dd1e-e7fd-4f8b-9f43-2cadcbca8db0';
    const selectionSnapshot = {
      allow_new_account: false,
      allow_own_account: true,
      manual_monthly_upgrade: false,
      own_account_credential_requirement: 'email_only',
    };

    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: subscriptionId,
        order_id: 'order-2',
      },
    } as any);

    mockUpgradeSelectionService.getSelectionForSubscriptionUser.mockResolvedValue(
      {
        subscription_id: subscriptionId,
        selection_type: null,
        account_identifier: null,
        credentials_encrypted: null,
        manual_monthly_acknowledged_at: null,
        submitted_at: null,
        locked_at: null,
        reminder_24h_at: null,
        reminder_48h_at: null,
        auto_selected_at: null,
        upgrade_options_snapshot: selectionSnapshot,
        created_at: new Date(),
        updated_at: new Date(),
      } as any
    );

    mockUpgradeSelectionService.submitSelection.mockResolvedValue({
      subscription_id: subscriptionId,
      selection_type: 'upgrade_own_account',
      account_identifier: 'user@example.com',
      credentials_encrypted: null,
      manual_monthly_acknowledged_at: null,
      submitted_at: new Date(),
      locked_at: new Date(),
      reminder_24h_at: null,
      reminder_48h_at: null,
      auto_selected_at: null,
      upgrade_options_snapshot: selectionSnapshot,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    mockSubscriptionService.createCredentialProvisionTask.mockResolvedValue(
      true
    );
    mockSubscriptionService.completeSelectionPendingTasks.mockResolvedValue();
    mockSubscriptionService.updateSubscriptionForAdmin.mockResolvedValue({
      success: true,
      data: {},
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/upgrade-selection`,
      payload: {
        selection_type: 'upgrade_own_account',
        account_identifier: 'user@example.com',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockUpgradeSelectionService.submitSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId,
        selectionType: 'upgrade_own_account',
        accountIdentifier: 'user@example.com',
        credentials: null,
      })
    );
  });

  it('rejects own-account selection without password when password is required', async () => {
    const subscriptionId = '4b62eeaf-3404-433f-abff-a87db4306408';
    const selectionSnapshot = {
      allow_new_account: false,
      allow_own_account: true,
      manual_monthly_upgrade: false,
      own_account_credential_requirement: 'email_and_password',
    };

    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: subscriptionId,
        order_id: 'order-3',
      },
    } as any);

    mockUpgradeSelectionService.getSelectionForSubscriptionUser.mockResolvedValue(
      {
        subscription_id: subscriptionId,
        selection_type: null,
        account_identifier: null,
        credentials_encrypted: null,
        manual_monthly_acknowledged_at: null,
        submitted_at: null,
        locked_at: null,
        reminder_24h_at: null,
        reminder_48h_at: null,
        auto_selected_at: null,
        upgrade_options_snapshot: selectionSnapshot,
        created_at: new Date(),
        updated_at: new Date(),
      } as any
    );

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/upgrade-selection`,
      payload: {
        selection_type: 'upgrade_own_account',
        account_identifier: 'user@example.com',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(
      'Account password is required for this own-account upgrade'
    );
  });
});
