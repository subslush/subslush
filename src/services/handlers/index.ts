import { ServiceType } from '../../types/subscription';
import { ServiceHandler } from './baseServiceHandler';
import { spotifyHandler } from './spotifyHandler';
import { netflixHandler } from './netflixHandler';
import { tradingViewHandler } from './tradingviewHandler';

export class ServiceHandlerRegistry {
  private handlers: Map<ServiceType, ServiceHandler>;

  constructor() {
    this.handlers = new Map();
    this.initializeHandlers();
  }

  /**
   * Initialize all service handlers
   */
  private initializeHandlers(): void {
    this.registerHandler(spotifyHandler);
    this.registerHandler(netflixHandler);
    this.registerHandler(tradingViewHandler);
  }

  /**
   * Register a service handler
   * @param handler - Service handler to register
   */
  registerHandler(handler: ServiceHandler): void {
    this.handlers.set(handler.serviceType, handler);
  }

  /**
   * Get handler for a specific service type
   * @param serviceType - Service type
   * @returns Service handler or null if not found
   */
  getHandler(serviceType: ServiceType): ServiceHandler | null {
    return this.handlers.get(serviceType) || null;
  }

  /**
   * Get all registered handlers
   * @returns Array of all service handlers
   */
  getAllHandlers(): ServiceHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all supported service types
   * @returns Array of supported service types
   */
  getSupportedServiceTypes(): ServiceType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a service type is supported
   * @param serviceType - Service type to check
   * @returns Boolean indicating support
   */
  isServiceSupported(serviceType: ServiceType): boolean {
    return this.handlers.has(serviceType);
  }

  /**
   * Get handler or throw error if not found
   * @param serviceType - Service type
   * @returns Service handler
   * @throws Error if handler not found
   */
  requireHandler(serviceType: ServiceType): ServiceHandler {
    const handler = this.getHandler(serviceType);
    if (!handler) {
      throw new Error(`No handler registered for service type: ${serviceType}`);
    }
    return handler;
  }

  /**
   * Get aggregated pricing for all services
   * @returns Map of service types to their plan pricing
   */
  getAllServicePricing(): Map<ServiceType, Record<string, number>> {
    const pricing = new Map();

    this.handlers.forEach((handler, serviceType) => {
      const servicePricing: Record<string, number> = {};
      const plans = handler.getAvailablePlans();

      plans.forEach(plan => {
        servicePricing[plan.plan] = plan.price;
      });

      pricing.set(serviceType, servicePricing);
    });

    return pricing;
  }

  /**
   * Get aggregated plan details for all services
   * @returns Map of service types to their plan details
   */
  getAllServicePlans(): Map<ServiceType, any[]> {
    const plans = new Map();

    this.handlers.forEach((handler, serviceType) => {
      plans.set(serviceType, handler.getAvailablePlans());
    });

    return plans;
  }

  /**
   * Validate service and plan combination
   * @param serviceType - Service type
   * @param servicePlan - Service plan
   * @returns Boolean indicating validity
   */
  validateServicePlan(serviceType: ServiceType, servicePlan: string): boolean {
    const handler = this.getHandler(serviceType);
    if (!handler) {
      return false;
    }

    const availablePlans = handler.getAvailablePlans();
    return availablePlans.some(plan => plan.plan === servicePlan);
  }

  /**
   * Get maximum subscriptions allowed for a service
   * @param serviceType - Service type
   * @returns Maximum subscriptions allowed
   */
  getMaxSubscriptionsForService(serviceType: ServiceType): number {
    const handler = this.getHandler(serviceType);
    return handler ? handler.getMaxSubscriptions() : 0;
  }

  /**
   * Health check for all handlers
   * @returns Health status for all services
   */
  async healthCheck(): Promise<Record<ServiceType, boolean>> {
    const healthStatus: Record<string, boolean> = {};

    for (const [serviceType, handler] of this.handlers) {
      try {
        // Basic validation that handler is working
        const plans = handler.getAvailablePlans();
        healthStatus[serviceType] = plans.length > 0;
      } catch {
        healthStatus[serviceType] = false;
      }
    }

    return healthStatus as Record<ServiceType, boolean>;
  }

  /**
   * Get handler statistics
   * @returns Statistics about registered handlers
   */
  getStatistics(): {
    totalHandlers: number;
    totalPlans: number;
    serviceTypes: ServiceType[];
    handlerHealth: Record<ServiceType, boolean>;
  } {
    const serviceTypes = this.getSupportedServiceTypes();
    let totalPlans = 0;
    const handlerHealth: Record<string, boolean> = {};

    this.handlers.forEach((handler, serviceType) => {
      try {
        const plans = handler.getAvailablePlans();
        totalPlans += plans.length;
        handlerHealth[serviceType] = true;
      } catch {
        handlerHealth[serviceType] = false;
      }
    });

    return {
      totalHandlers: this.handlers.size,
      totalPlans,
      serviceTypes,
      handlerHealth: handlerHealth as Record<ServiceType, boolean>,
    };
  }
}

// Singleton instance
export const serviceHandlerRegistry = new ServiceHandlerRegistry();

// Export individual handlers for direct use if needed
export { spotifyHandler } from './spotifyHandler';
export { netflixHandler } from './netflixHandler';
export { tradingViewHandler } from './tradingviewHandler';
export type { ServiceHandler } from './baseServiceHandler';
export { BaseServiceHandler } from './baseServiceHandler';
