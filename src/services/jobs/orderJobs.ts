import { orderService } from '../orderService';
import { Logger } from '../../utils/logger';

export async function runOrderDeliveryEmailWatchdogSweep(): Promise<void> {
  Logger.info('Order delivery email watchdog sweep started');
  try {
    const result = await orderService.runDeliveryEmailWatchdogSweep();
    Logger.info('Order delivery email watchdog sweep completed', result);
  } catch (error) {
    Logger.error('Order delivery email watchdog sweep failed:', error);
  }
}
