import {
  ServiceType,
  ServicePlan,
  ServicePlanDetails,
  SubscriptionMetadata,
} from '../../types/subscription';

export interface ServiceHandler {
  serviceType: ServiceType;

  /**
   * Validate if a user can purchase a specific plan
   * @param userId - User ID
   * @param plan - Service plan to validate
   * @returns Promise<boolean> - Whether the purchase is allowed
   */
  validatePurchase(userId: string, plan: ServicePlan): Promise<boolean>;

  /**
   * Get pricing for a specific plan
   * @param plan - Service plan
   * @returns number - Price in credits
   */
  getPlanPricing(plan: ServicePlan): number;

  /**
   * Get detailed information about a plan
   * @param plan - Service plan
   * @returns ServicePlanDetails - Plan details
   */
  getPlanDetails(plan: ServicePlan): ServicePlanDetails;

  /**
   * Validate metadata for this service type
   * @param metadata - Metadata to validate
   * @returns boolean - Whether metadata is valid
   */
  validateMetadata(metadata: SubscriptionMetadata): boolean;

  /**
   * Get all available plans for this service
   * @returns ServicePlanDetails[] - Array of available plans
   */
  getAvailablePlans(): ServicePlanDetails[];

  /**
   * Check if user has reached subscription limit for this service
   * @param userId - User ID
   * @returns Promise<boolean> - Whether user can add another subscription
   */
  canAddSubscription(userId: string): Promise<boolean>;

  /**
   * Get maximum allowed subscriptions for this service
   * @returns number - Maximum subscriptions allowed
   */
  getMaxSubscriptions(): number;
}

export abstract class BaseServiceHandler implements ServiceHandler {
  abstract serviceType: ServiceType;
  protected abstract planPricing: Record<ServicePlan, number>;
  protected abstract planDetails: Record<ServicePlan, ServicePlanDetails>;
  protected abstract maxSubscriptions: number;

  async validatePurchase(userId: string, plan: ServicePlan): Promise<boolean> {
    // Check if plan is valid for this service
    if (!this.isValidPlan(plan)) {
      return false;
    }

    // Check subscription limits
    return this.canAddSubscription(userId);
  }

  getPlanPricing(plan: ServicePlan): number {
    if (!this.isValidPlan(plan)) {
      throw new Error(`Invalid plan ${plan} for service ${this.serviceType}`);
    }
    return this.planPricing[plan] || 0;
  }

  getPlanDetails(plan: ServicePlan): ServicePlanDetails {
    if (!this.isValidPlan(plan)) {
      throw new Error(`Invalid plan ${plan} for service ${this.serviceType}`);
    }
    const details = this.planDetails[plan];
    if (!details) {
      throw new Error(
        `Missing plan details for ${plan} on ${this.serviceType}`
      );
    }
    return details;
  }

  getAvailablePlans(): ServicePlanDetails[] {
    return Object.values(this.planDetails).filter(
      plan => this.planPricing[plan.plan] !== undefined
    );
  }

  async canAddSubscription(_userId: string): Promise<boolean> {
    // This will be implemented in the main subscription service
    // For now, we'll assume it's allowed and let the service handle the logic
    return true;
  }

  getMaxSubscriptions(): number {
    return this.maxSubscriptions;
  }

  abstract validateMetadata(metadata: SubscriptionMetadata): boolean;

  protected isValidPlan(plan: ServicePlan): boolean {
    return this.planPricing[plan] !== undefined;
  }
}
