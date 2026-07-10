import Fastify from 'fastify';
import { adminOrderRoutes } from '../routes/admin/orders';
import { getDatabasePool } from '../config/database';
import { paymentService } from '../services/paymentService';
import { subscriptionService } from '../services/subscriptionService';
import { orderService } from '../services/orderService';
import { logAdminAction } from '../services/auditLogService';

jest.mock('../config/database');
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true,
    };
  }),
}));
jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));
jest.mock('../services/paymentService', () => ({
  paymentService: {
    confirmManualOrderPayment: jest.fn(),
  },
}));
jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    updateSubscriptionForAdmin: jest.fn(),
    activateSubscriptionForOrderItem: jest.fn(),
    createCredentialProvisionTask: jest.fn(),
  },
}));
jest.mock('../services/orderService', () => ({
  orderService: {
    getOrderWithItems: jest.fn(),
    getOrderById: jest.fn(),
    updateOrderStatus: jest.fn(),
    sendItemDeliveredEmail: jest.fn(),
    listOrders: jest.fn(),
    listOrderItems: jest.fn(),
  },
}));
jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
}));
jest.mock('../services/orderComplianceEvidenceService', () => ({
  orderComplianceEvidenceService: {
    recordGenericEvidence: jest.fn(),
    recordCredentialRevealEvidence: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;

describe('Admin order actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue({ query: jest.fn() } as any);
  });

  const register = async () => {
    const app = Fastify();
    await app.register(adminOrderRoutes, { prefix: '/admin/orders' });
    return app;
  };

  it('requires a note for manual mark-paid', async () => {
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/mark-paid',
      payload: { note: '   ' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockPaymentService.confirmManualOrderPayment).not.toHaveBeenCalled();
  });

  it('marks a pending order paid through payment service and audits it', async () => {
    mockPaymentService.confirmManualOrderPayment.mockResolvedValue({
      success: true,
      orderStatus: 'in_process',
      subscriptionsCreated: 2,
      tasksOpen: 2,
    });
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/mark-paid',
      payload: { note: 'Verified in provider dashboard' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPaymentService.confirmManualOrderPayment).toHaveBeenCalledWith({
      orderId: 'order-1',
      adminUserId: 'admin-1',
      note: 'Verified in provider dashboard',
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'orders.mark_paid.manual',
        entityId: 'order-1',
        metadata: expect.objectContaining({
          note: 'Verified in provider dashboard',
          subscriptions_created: 2,
          open_tasks: 2,
        }),
      })
    );
  });

  it('rejects manual mark-paid outside pending_payment with no audit row', async () => {
    mockPaymentService.confirmManualOrderPayment.mockResolvedValue({
      success: false,
      status: 'invalid_state',
      orderStatus: 'delivered',
      error: 'order_not_pending_payment',
    });
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/mark-paid',
      payload: { note: 'Verified' },
    });

    await app.close();

    expect(response.statusCode).toBe(409);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('rejects activation link before customer readiness without side effects', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [{ activation_handshake_state: 'awaiting_customer' }],
    });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/items/sub-1/activation-link',
      payload: { activation_link: 'https://activate.example/link' },
    });

    await app.close();

    expect(response.statusCode).toBe(409);
    expect(
      mockSubscriptionService.updateSubscriptionForAdmin
    ).not.toHaveBeenCalled();
    expect(mockOrderService.sendItemDeliveredEmail).not.toHaveBeenCalled();
  });

  it('allows activation link from customer_ready', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ activation_handshake_state: 'customer_ready' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            user_id: 'user-1',
            status: 'paid',
            contact_email: 'c@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            status: 'pending',
            credentials_encrypted: 'secret',
            order_item_id: 'item-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    mockSubscriptionService.updateSubscriptionForAdmin.mockResolvedValue({
      success: true,
    } as any);
    mockSubscriptionService.activateSubscriptionForOrderItem.mockResolvedValue({
      updated: true,
    } as any);
    mockOrderService.updateOrderStatus.mockResolvedValue({
      success: true,
    } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/items/sub-1/activation-link',
      payload: { activation_link: 'https://activate.example/link' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(
      mockSubscriptionService.updateSubscriptionForAdmin
    ).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({
        credentials_encrypted: 'https://activate.example/link',
        activation_handshake_state: 'link_delivered',
      })
    );
  });

  it('delivers one item, sends one item email, and keeps multi-item order in process', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            user_id: 'user-1',
            status: 'paid',
            contact_email: 'c@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            status: 'pending',
            credentials_encrypted: 'secret',
            order_item_id: 'item-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 1 }] });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    mockSubscriptionService.activateSubscriptionForOrderItem.mockResolvedValue({
      updated: true,
    } as any);
    mockOrderService.updateOrderStatus.mockResolvedValue({
      success: true,
    } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/items/sub-1/deliver',
      payload: { reason: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockOrderService.sendItemDeliveredEmail).toHaveBeenCalledTimes(1);
    expect(mockOrderService.sendItemDeliveredEmail).toHaveBeenCalledWith({
      orderId: 'order-1',
      subscriptionId: 'sub-1',
    });
    expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'in_process',
      'partial_delivery'
    );
  });

  it('delivers the final item and flips the order delivered without duplicate email', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            user_id: 'user-1',
            status: 'in_process',
            contact_email: 'c@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-2',
            status: 'pending',
            credentials_encrypted: 'secret',
            order_item_id: 'item-2',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ remaining: 0 }] });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    mockSubscriptionService.activateSubscriptionForOrderItem.mockResolvedValue({
      updated: true,
    } as any);
    mockOrderService.updateOrderStatus.mockResolvedValue({
      success: true,
    } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/orders/order-1/items/sub-2/deliver',
      payload: { reason: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockOrderService.sendItemDeliveredEmail).toHaveBeenCalledTimes(1);
    expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'delivered',
      'order_delivered'
    );
  });

  it('returns old-console fulfillment data without serialized credential material', async () => {
    const encryptedPayload =
      '{"version":1,"ciphertext":"abc","iv":"def","tag":"ghi"}';
    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: 'order-1',
      user_id: 'user-1',
      status: 'paid',
      items: [],
    } as any);
    mockOrderService.listOrderItems.mockResolvedValue([]);
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', status: 'active' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1',
            user_id: 'user-1',
            status: 'pending',
            subscription_credentials_on_file: true,
            credentials_encrypted: encryptedPayload,
            has_user_credentials: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ balance: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ spent: 0 }] });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    const app = await register();

    const response = await app.inject({
      method: 'GET',
      url: '/admin/orders/order-1/fulfillment',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('credentials_encrypted');
    expect(serialized).not.toContain('"ciphertext"');
    expect(body.data.subscriptions[0].has_credentials).toBe(true);
  });
});
