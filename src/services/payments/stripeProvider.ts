import Stripe from 'stripe';
import { env } from '../../config/environment';
import {
  PaymentProvider,
  ProviderPaymentCreateRequest,
  ProviderPaymentDetails,
} from './paymentProvider';
import { UnifiedPaymentStatus } from '../../types/payment';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

function mapStripeStatus(
  status: Stripe.PaymentIntent.Status
): UnifiedPaymentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'processing';
    case 'requires_action':
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_capture':
      return status === 'requires_payment_method'
        ? 'requires_payment_method'
        : 'requires_action';
    case 'canceled':
      return 'canceled';
    default:
      return 'pending';
  }
}

export class StripeProvider implements PaymentProvider {
  private normalizeMetadata(
    metadata?: Record<string, any>
  ): Record<string, string> {
    if (!metadata) return {};
    return Object.entries(metadata).reduce(
      (acc, [key, value]) => {
        if (value === undefined || value === null) return acc;
        acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
        return acc;
      },
      {} as Record<string, string>
    );
  }

  async createPayment(
    request: ProviderPaymentCreateRequest
  ): Promise<ProviderPaymentDetails> {
    const amountCents = Math.round(request.amount * 100);
    const autoRenew =
      request.metadata?.['auto_renew'] === true ||
      request.metadata?.['auto_renew'] === 'true' ||
      request.metadata?.['auto_renew'] === 1 ||
      request.metadata?.['auto_renew'] === '1';

    // Stripe metadata values must be strings; coerce everything to strings to keep the API happy
    const rawMetadata = {
      userId: request.userId,
      orderId: request.orderId || '',
      ...(request.metadata || {}),
    };
    const metadata = this.normalizeMetadata(rawMetadata);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: request.priceCurrency.toLowerCase(),
      description: request.description || '',
      metadata,
      payment_method_types: ['card'],
      ...(request.customerId ? { customer: request.customerId } : {}),
      ...(autoRenew && { setup_future_usage: 'off_session' }),
    });

    const details: ProviderPaymentDetails = {
      providerPaymentId: paymentIntent.id,
      providerStatus: paymentIntent.status,
      normalizedStatus: mapStripeStatus(paymentIntent.status),
      amount: request.amount,
      priceCurrency: request.priceCurrency.toLowerCase(),
      payCurrency: request.payCurrency.toLowerCase(),
      metadata: paymentIntent.metadata as Record<string, any>,
      raw: paymentIntent,
    };

    if (paymentIntent.client_secret) {
      details.clientSecret = paymentIntent.client_secret;
    }

    return details;
  }

  async getPaymentStatus(paymentId: string): Promise<ProviderPaymentDetails> {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);

    const details: ProviderPaymentDetails = {
      providerPaymentId: paymentIntent.id,
      providerStatus: paymentIntent.status,
      normalizedStatus: mapStripeStatus(paymentIntent.status),
      amount: paymentIntent.amount / 100,
      priceCurrency: paymentIntent.currency,
      payCurrency: paymentIntent.currency,
      metadata: paymentIntent.metadata as Record<string, any>,
      raw: paymentIntent,
    };

    if (paymentIntent.client_secret) {
      details.clientSecret = paymentIntent.client_secret;
    }

    return details;
  }

  async supportsCurrency(currency: string): Promise<boolean> {
    const normalized = currency.toLowerCase();
    return ['usd', 'gbp', 'cad', 'eur'].includes(normalized);
  }

  async createCustomer(params: {
    email?: string | null;
    metadata?: Record<string, any>;
  }): Promise<Stripe.Customer> {
    return stripe.customers.create({
      ...(params.email ? { email: params.email } : {}),
      ...(params.metadata
        ? { metadata: this.normalizeMetadata(params.metadata) }
        : {}),
    });
  }

  async createSetupIntent(params: {
    customerId: string;
    metadata?: Record<string, any>;
  }): Promise<Stripe.SetupIntent> {
    return stripe.setupIntents.create({
      customer: params.customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
      ...(params.metadata
        ? { metadata: this.normalizeMetadata(params.metadata) }
        : {}),
    });
  }

  async retrieveSetupIntent(
    setupIntentId: string
  ): Promise<Stripe.SetupIntent> {
    return stripe.setupIntents.retrieve(setupIntentId);
  }

  async retrievePaymentMethod(
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    return stripe.paymentMethods.retrieve(paymentMethodId);
  }

  async attachPaymentMethod(params: {
    paymentMethodId: string;
    customerId: string;
  }): Promise<Stripe.PaymentMethod> {
    return stripe.paymentMethods.attach(params.paymentMethodId, {
      customer: params.customerId,
    });
  }

  async createOffSessionPaymentIntent(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<Stripe.PaymentIntent> {
    const amountCents = Math.round(params.amount * 100);
    return stripe.paymentIntents.create({
      amount: amountCents,
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      description: params.description || '',
      ...(params.metadata
        ? { metadata: this.normalizeMetadata(params.metadata) }
        : {}),
    });
  }

  async cancelPaymentIntent(
    paymentIntentId: string
  ): Promise<Stripe.PaymentIntent> {
    return stripe.paymentIntents.cancel(paymentIntentId);
  }
}

export const stripeProvider = new StripeProvider();
