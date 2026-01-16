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
