import { paymentService } from '../services/paymentService';
import { pay4bitProvider } from '../services/payments/pay4bitProvider';
import { paymentRepository } from '../services/paymentRepository';
import { orderService } from '../services/orderService';
import { couponService } from '../services/couponService';
import { paymentEventRepository } from '../services/paymentEventRepository';
import { subscriptionService } from '../services/subscriptionService';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';

jest.mock('../services/paymentRepository');
jest.mock('../services/orderService');
jest.mock('../services/couponService');
jest.mock('../services/paymentEventRepository');
jest.mock('../services/subscriptionService');
jest.mock('../utils/logger');
jest.mock('../config/database');

const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockCouponService = couponService as jest.Mocked<typeof couponService>;
const mockPaymentEventRepository = paymentEventRepository as jest.Mocked<
  typeof paymentEventRepository
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const ORDER_ID = 'f8d0dbca-5aaf-4e4d-b3c3-4ed4fddf8f11';
const USER_ID = '67d9f0e1-f7c3-4ef3-a81d-fc8fc8345601';

describe('Pay4bit callback flow', () => {
  const paymentByProviderId = new Map<string, any>();
  const paymentById = new Map<string, any>();
  let paymentCounter = 0;
  let currentOrderStatus: 'pending_payment' | 'in_process' = 'pending_payment';
  let createSubscriptionsSpy: jest.SpyInstance;
  let createPaymentAllocationsSpy: jest.SpyInstance;

  const mockDbClient = {
    query: jest.fn<Promise<any>, [string, any[]?]>(),
    release: jest.fn<void, []>(),
  };

  const mockPool = {
    query: jest.fn<Promise<any>, [string, any[]?]>(),
    connect: jest.fn().mockResolvedValue(mockDbClient),
  };

  const buildCallbackPayload = (
    method: 'check' | 'pay' | 'error',
    overrides?: Partial<{
      localpayId: string;
      account: string;
      sum: string;
      amount: string;
      currency: string;
      description: string;
    }>
  ) => {
    const base = {
      localpayId: '1234567',
      account: ORDER_ID,
      sum: '10.00',
      amount: '10.00',
      currency: 'USD',
      description: 'Balance reload',
      ...overrides,
    };

    return {
      method,
      localpayId: base.localpayId,
      account: base.account,
      sum: base.sum,
      amount: base.amount,
      currency: base.currency,
      description: base.description,
      sign: pay4bitProvider.generateSign({
        localpayId: base.localpayId,
        account: base.account,
        sum: base.sum,
      }),
      checkSign: pay4bitProvider.generateCheckSign({
        description: base.description,
        account: base.account,
        amount: base.amount,
      }),
    } as const;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    paymentByProviderId.clear();
    paymentById.clear();
    paymentCounter = 0;
    currentOrderStatus = 'pending_payment';

    (env as any).PAY4BIT_ENABLED = true;
    (env as any).PAY4BIT_SECRET_KEY = 'pay4bit_secret_for_callback_tests';
    (env as any).PAY4BIT_PUBLIC_KEY = 'pay4bit_public_for_callback_tests';
    (env as any).PAY4BIT_BASE_URL = 'https://api.pay4bit.net';
    (env as any).PAY4BIT_CALLBACK_URL =
      'https://api.example.com/api/v1/payments/pay4bit/callback';

    mockGetDatabasePool.mockReturnValue(mockPool as any);

    mockDbClient.query.mockResolvedValue({ rows: [] });

    mockPool.query.mockImplementation(async (sql: string, params?: any[]) => {
      if (
        sql.includes('UPDATE orders') &&
        sql.includes("SET status = 'in_process'")
      ) {
        if (currentOrderStatus === 'pending_payment') {
          currentOrderStatus = 'in_process';
          return { rows: [{ id: ORDER_ID }] };
        }
        return { rows: [] };
      }

      if (
        sql.includes('UPDATE payments') &&
        sql.includes('SET metadata = $1') &&
        Array.isArray(params) &&
        params.length >= 2
      ) {
        const paymentId = String(params[1]);
        const payment = paymentById.get(paymentId);
        if (payment) {
          try {
            payment.metadata =
              typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0];
          } catch {
            payment.metadata = params[0];
          }
        }
      }

      return { rows: [] };
    });

    mockOrderService.getOrderWithItems.mockImplementation(async orderId => {
      if (orderId !== ORDER_ID) {
        return null;
      }
      return {
        id: ORDER_ID,
        user_id: USER_ID,
        status: currentOrderStatus,
        status_reason: 'awaiting_payment',
        currency: 'USD',
        settlement_currency: 'USD',
        total_cents: 1000,
        settlement_total_cents: 1000,
        payment_provider: 'pay4bit',
        payment_reference: null,
        items: [
          {
            id: 'item-1',
            order_id: ORDER_ID,
            product_variant_id: 'variant-1',
            quantity: 1,
            unit_price_cents: 1000,
            total_price_cents: 1000,
            currency: 'USD',
            auto_renew: false,
            coupon_discount_cents: 0,
            description: 'Netflix Basic',
            metadata: {
              service_type: 'netflix',
              service_plan: 'basic',
              duration_months: 1,
            },
            created_at: new Date(),
          },
        ],
      } as any;
    });
    mockOrderService.updateOrderPayment.mockResolvedValue({ success: true } as any);
    mockOrderService.updateOrderStatus.mockResolvedValue({ success: true } as any);
    mockOrderService.sendOrderPaymentConfirmationEmail.mockResolvedValue({
      success: true,
    } as any);
    mockOrderService.getOrderById.mockImplementation(async orderId => {
      if (orderId !== ORDER_ID) {
        return null;
      }
      return {
        id: ORDER_ID,
        user_id: USER_ID,
        status: currentOrderStatus,
        payment_provider: 'pay4bit',
        payment_reference: '1234567',
      } as any;
    });

    mockCouponService.finalizeRedemptionForOrder.mockResolvedValue(true as any);
    mockCouponService.voidRedemptionForOrder.mockResolvedValue(true as any);
    mockPaymentEventRepository.recordEvent.mockResolvedValue(true);

    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: false,
      error: 'not_found',
    } as any);

    mockPaymentRepository.findByProviderPaymentId.mockImplementation(
      async (_provider, providerPaymentId) =>
        paymentByProviderId.get(providerPaymentId) || null
    );
    mockPaymentRepository.findLatestByOrderId.mockImplementation(
      async (_provider, orderId) => {
        const latest = [...paymentByProviderId.values()]
          .filter(payment => payment.orderId === orderId)
          .slice(-1)[0];
        return latest || null;
      }
    );
    mockPaymentRepository.create.mockImplementation(async input => {
      paymentCounter += 1;
      const created = {
        id: `payment-${paymentCounter}`,
        userId: input.userId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        status: input.status,
        providerStatus: input.providerStatus || null,
        purpose: input.purpose,
        amount: input.amount,
        currency: input.currency,
        metadata: input.metadata || {},
        orderId: input.orderId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      paymentByProviderId.set(input.providerPaymentId, created);
      paymentById.set(created.id, created);
      return created as any;
    });
    mockPaymentRepository.updateStatusByProviderPaymentId.mockImplementation(
      async (_provider, providerPaymentId, status, providerStatus, metadata) => {
        const existing = paymentByProviderId.get(providerPaymentId);
        if (!existing) {
          return null;
        }
        existing.status = status;
        existing.providerStatus = providerStatus || null;
        if (metadata !== undefined) {
          existing.metadata = metadata;
        }
        return existing as any;
      }
    );

    createSubscriptionsSpy = jest
      .spyOn(paymentService as any, 'createSubscriptionsForOrder')
      .mockResolvedValue([
        {
          id: 'sub-1',
          orderItemId: 'item-1',
          autoRenew: false,
        },
      ]);
    createPaymentAllocationsSpy = jest
      .spyOn(paymentService as any, 'createPaymentItemAllocations')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    createSubscriptionsSpy.mockRestore();
    createPaymentAllocationsSpy.mockRestore();
  });

  it('processes check -> pay and fulfills once', async () => {
    const check = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('check')
    );
    const pay = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('pay')
    );

    expect(check.statusCode).toBe(200);
    expect(check.body.result.message).toBe('Request successfully processed');
    expect(pay.statusCode).toBe(200);
    expect(pay.body.result.message).toBe('Request successfully processed');
    expect(createSubscriptionsSpy).toHaveBeenCalledTimes(1);
    expect(mockCouponService.finalizeRedemptionForOrder).toHaveBeenCalledTimes(1);
  });

  it('handles check -> error -> pay recovery', async () => {
    const check = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('check', { localpayId: '20001' })
    );
    const error = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('error', { localpayId: '20001' })
    );
    const pay = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('pay', { localpayId: '20001' })
    );

    expect(check.statusCode).toBe(200);
    expect(error.statusCode).toBe(200);
    expect(pay.statusCode).toBe(200);
    expect(createSubscriptionsSpy).toHaveBeenCalledTimes(1);
  });

  it('returns prior response for duplicate check/pay and avoids duplicate fulfillment', async () => {
    const firstCheck = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('check', { localpayId: '30001' })
    );
    const duplicateCheck = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('check', { localpayId: '30001' })
    );
    const firstPay = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('pay', { localpayId: '30001' })
    );
    const duplicatePay = await paymentService.handlePay4bitCallback(
      buildCallbackPayload('pay', { localpayId: '30001' })
    );

    expect(duplicateCheck).toEqual(firstCheck);
    expect(duplicatePay).toEqual(firstPay);
    expect(createSubscriptionsSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects tampered signatures and amount mismatches', async () => {
    const badSignaturePayload = {
      ...buildCallbackPayload('check', { localpayId: '40001' }),
      sign: 'deadbeef',
    };
    const badSignature = await paymentService.handlePay4bitCallback(
      badSignaturePayload as any
    );

    const mismatchedAmountPayload = buildCallbackPayload('check', {
      localpayId: '40002',
      sum: '11.00',
      amount: '11.00',
    });
    const mismatchedAmount = await paymentService.handlePay4bitCallback(
      mismatchedAmountPayload
    );

    expect(badSignature.statusCode).toBe(401);
    expect(badSignature.body.result.message).toBe('invalid_signature');
    expect(mismatchedAmount.statusCode).toBe(400);
    expect(mismatchedAmount.body.result.message).toBe(
      'payment_amount_mismatch'
    );
  });
});
