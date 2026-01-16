import { env } from '../../config/environment';
import { nowpaymentsClient } from '../../utils/nowpaymentsClient';
import { PaymentStatus, UnifiedPaymentStatus } from '../../types/payment';
import {
  PaymentProvider,
  ProviderPaymentCreateRequest,
  ProviderPaymentDetails,
} from './paymentProvider';

function mapStatus(status: PaymentStatus): UnifiedPaymentStatus {
  switch (status) {
    case 'finished':
      return 'succeeded';
    case 'failed':
    case 'refunded':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'pending':
    case 'waiting':
    case 'confirming':
    case 'confirmed':
    case 'sending':
    case 'partially_paid':
    default:
      return 'processing';
  }
}

export class NowPaymentsProvider implements PaymentProvider {
  async createPayment(
    request: ProviderPaymentCreateRequest
  ): Promise<ProviderPaymentDetails> {
    const payment = await nowpaymentsClient.createPayment({
      price_amount: request.amount,
      price_currency: request.priceCurrency.toLowerCase(),
      pay_currency: request.payCurrency.toLowerCase(),
      order_id: request.orderId || `credit-${request.userId}-${Date.now()}`,
      order_description: request.description || '',
      ipn_callback_url: env.NOWPAYMENTS_WEBHOOK_URL,
    });

    const details: ProviderPaymentDetails = {
      providerPaymentId: payment.payment_id,
      providerStatus: payment.payment_status,
      normalizedStatus: mapStatus(payment.payment_status),
      amount: payment.price_amount,
      priceCurrency: payment.price_currency,
      payCurrency: payment.pay_currency,
      ...(payment.price_currency?.toLowerCase() === 'usd'
        ? { amountUsd: payment.price_amount }
        : {}),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      raw: payment,
    };

    if (payment.pay_amount) {
      details.payAmount = payment.pay_amount;
    }

    if (payment.pay_address) {
      details.payAddress = payment.pay_address;
    }

    return details;
  }

  async getPaymentStatus(paymentId: string): Promise<ProviderPaymentDetails> {
    const status = await nowpaymentsClient.getPaymentStatus(paymentId);

    const details: ProviderPaymentDetails = {
      providerPaymentId: status.payment_id,
      providerStatus: status.payment_status,
      normalizedStatus: mapStatus(status.payment_status),
      amount: status.price_amount,
      priceCurrency: status.price_currency,
      payCurrency: status.pay_currency,
      ...(status.price_currency?.toLowerCase() === 'usd'
        ? { amountUsd: status.price_amount }
        : {}),
      raw: status,
    };

    if (status.pay_amount) {
      details.payAmount = status.pay_amount;
    }

    if (status.pay_address) {
      details.payAddress = status.pay_address;
    }

    if (status.created_at) {
      details.expiresAt = new Date(
        new Date(status.created_at).getTime() + 30 * 60 * 1000
      );
    }

    return details;
  }

  async supportsCurrency(currency: string): Promise<boolean> {
    return nowpaymentsClient.isCurrencySupported(currency);
  }
}

export const nowPaymentsProvider = new NowPaymentsProvider();
