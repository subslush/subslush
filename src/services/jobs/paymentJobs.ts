import { env } from '../../config/environment';
import { paymentService } from '../paymentService';
import { Logger } from '../../utils/logger';

export async function runNowPaymentsCurrencyRefresh(): Promise<void> {
  Logger.info('NOWPayments currency refresh started');
  try {
    const currencies = await paymentService.refreshSupportedCurrencies();
    Logger.info('NOWPayments currency refresh completed', {
      count: currencies.length,
    });
  } catch (error) {
    Logger.error('NOWPayments currency refresh failed:', error);
  }
}

export async function runCheckoutAbandonSweep(): Promise<void> {
  Logger.info('Checkout abandonment sweep started', {
    ttlMinutes: env.CHECKOUT_ABANDON_TTL_MINUTES,
    batchSize: env.CHECKOUT_ABANDON_SWEEP_BATCH_SIZE,
  });
  try {
    const result = await paymentService.sweepStaleStripeCheckouts();
    Logger.info('Checkout abandonment sweep completed', result);
  } catch (error) {
    Logger.error('Checkout abandonment sweep failed:', error);
  }
}
