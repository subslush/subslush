import { paymentService } from '../services/paymentService';
import { paymentRepository } from '../services/paymentRepository';
import { orderService } from '../services/orderService';
import { couponService } from '../services/couponService';
import { subscriptionService } from '../services/subscriptionService';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';

jest.mock('../services/paymentRepository');
jest.mock('../services/orderService');
jest.mock('../services/couponService');
jest.mock('../services/subscriptionService');
jest.mock('../services/orderItemUpgradeSelectionService', () => ({
  orderItemUpgradeSelectionService: {
    listSelectionsForOrder: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('../services/upgradeSelectionService', () => ({
  upgradeSelectionService: {
    ensureSelection: jest.fn(),
    submitSelection: jest.fn(),
    acknowledgeManualMonthly: jest.fn(),
  },
}));
jest.mock('../services/orderEntitlementService', () => ({
  orderEntitlementService: {
    upsertEntitlement: jest.fn().mockResolvedValue({ id: 'ent-1' }),
  },
}));
jest.mock('../utils/logger');
jest.mock('../config/database');

const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockCouponService = couponService as jest.Mocked<typeof couponService>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Manual mark-paid pipeline and stale Payop/Antom sweep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (env as any).CHECKOUT_ABANDON_TTL_MINUTES = 30;
    (env as any).CHECKOUT_ABANDON_SWEEP_BATCH_SIZE = 100;
    (env as any).PAYOP_ANTOM_PENDING_PAYMENT_TTL_HOURS = 72;
    mockCouponService.finalizeRedemptionForOrder.mockResolvedValue(true as any);
    mockOrderService.sendOrderPaymentConfirmationEmail.mockResolvedValue({
      success: true,
    } as any);
  });

  it('manual mark-paid creates payment, subscriptions, tasks, coupon redemption, and email once', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'pending_payment',
      total_cents: 1500,
      currency: 'USD',
      metadata: {},
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          total_price_cents: 1500,
          coupon_discount_cents: 0,
          auto_renew: false,
          metadata: {
            service_type: 'netflix',
            service_plan: 'premium',
            duration_months: 1,
          },
        },
      ],
    };
    const query = jest.fn((sql: string) => {
      if (sql.includes('UPDATE orders')) {
        return Promise.resolve({ rows: [{ id: 'order-1' }] });
      }
      if (sql.includes('SELECT status FROM orders')) {
        return Promise.resolve({ rows: [{ status: 'pending_payment' }] });
      }
      if (sql.includes('COUNT(*)::int AS open_tasks')) {
        return Promise.resolve({ rows: [{ open_tasks: 1 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const client = { query, release: jest.fn() };
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(client),
    } as any);
    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(null);
    mockPaymentRepository.create.mockResolvedValue({ id: 'payment-1' } as any);
    mockSubscriptionService.createSubscription.mockResolvedValue({
      success: true,
      data: {
        id: 'sub-1',
        status: 'pending',
        start_date: new Date('2026-01-01T00:00:00Z'),
        term_start_at: null,
        end_date: new Date('2026-02-01T00:00:00Z'),
      },
    } as any);

    const result = await paymentService.confirmManualOrderPayment({
      orderId: 'order-1',
      adminUserId: 'admin-1',
      note: 'Verified manually',
    });

    expect(result.success).toBe(true);
    expect(mockPaymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'manual',
        providerPaymentId: 'manual_order-1',
        status: 'succeeded',
        orderItemId: 'item-1',
        metadata: expect.objectContaining({ note: 'Verified manually' }),
      }),
      client
    );
    expect(mockSubscriptionService.createSubscription).toHaveBeenCalledTimes(1);
    expect(mockCouponService.finalizeRedemptionForOrder).toHaveBeenCalledWith(
      'order-1',
      client
    );
    expect(
      mockOrderService.sendOrderPaymentConfirmationEmail
    ).toHaveBeenCalledTimes(1);
  });

  it('expires stale Payop and Antom pending payments but leaves succeeded payments untouched', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'payop-order',
            payment_provider: 'payop',
            payment_reference: 'payop-ref',
          },
          {
            order_id: 'antom-order',
            payment_provider: 'antom',
            payment_reference: 'antom-ref',
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    mockOrderService.updateOrderStatus.mockResolvedValue({
      success: true,
    } as any);

    const result = await paymentService.sweepStaleCheckoutSessions({
      batchSize: 10,
    });

    expect(result.cancelled).toBe(2);
    expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
      'payop-order',
      'cancelled',
      'checkout_timeout'
    );
    expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
      'antom-order',
      'cancelled',
      'checkout_timeout'
    );
    expect(query.mock.calls[1][0]).toContain(
      'NOT EXISTS (\n              SELECT 1'
    );
    expect(query.mock.calls[1][0]).toContain("succeeded.status = 'succeeded'");
  });
});
