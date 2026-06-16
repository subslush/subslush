jest.mock('../services/paymentRepository', () => ({
  paymentRepository: {
    findLatestByOrderId: jest.fn(),
  },
}));

import { orderService } from '../services/orderService';
import { paymentRepository } from '../services/paymentRepository';

const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;

const buildAntomOrder = (metadata: Record<string, unknown>) =>
  ({
    id: '751b6c42-1111-4222-8333-444455556666',
    payment_provider: 'antom',
    metadata,
    settlement_total_cents: null,
    display_total_cents: 0,
    total_cents: 0,
  }) as any;

describe('OrderService payment confirmation totals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not let stale zero PayOp or Antom metadata override positive Antom components', async () => {
    const totalCents = await (
      orderService as any
    ).resolvePaymentConfirmationDisplayTotalCents(
      buildAntomOrder({
        payop_display_total_cents: 0,
        antom_processing_currency: 'USD',
        antom_processing_total_cents: 0,
        antom_processing_subtotal_cents: 3091,
        antom_processing_fee_cents: 160,
        antom_processing_tax_cents: 276,
      })
    );

    expect(totalCents).toBe(3527);
    expect(mockPaymentRepository.findLatestByOrderId).not.toHaveBeenCalled();
  });

  it('falls back to the latest Antom payment amount when order metadata only has a stale zero total', async () => {
    mockPaymentRepository.findLatestByOrderId.mockResolvedValue({
      amount: 33.67,
      currency: 'usd',
      metadata: {
        antom_processing_total_cents: 0,
      },
    } as any);

    const totalCents = await (
      orderService as any
    ).resolvePaymentConfirmationDisplayTotalCents(
      buildAntomOrder({
        antom_processing_currency: 'USD',
        antom_processing_total_cents: 0,
      })
    );

    expect(totalCents).toBe(3367);
    expect(mockPaymentRepository.findLatestByOrderId).toHaveBeenCalledWith(
      'antom',
      '751b6c42-1111-4222-8333-444455556666',
      'subscription'
    );
  });
});
