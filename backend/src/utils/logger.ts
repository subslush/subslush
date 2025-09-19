import { env } from '../config/environment';

export class Logger {
  static info(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static warn(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  static error(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV !== 'test') {
      console.error(
        `[ERROR] ${new Date().toISOString()} - ${message}`,
        ...args
      );
    }
  }

  static debug(message: string, ...args: unknown[]): void {
    if (env.NODE_ENV === 'development') {
      console.debug(
        `[DEBUG] ${new Date().toISOString()} - ${message}`,
        ...args
      );
    }
  }
}
