import {
  ServicePlan,
  ServicePlanDetails,
  SubscriptionMetadata,
  TradingViewMetadata,
} from '../../types/subscription';
import { BaseServiceHandler } from './baseServiceHandler';

export class TradingViewHandler extends BaseServiceHandler {
  serviceType = 'tradingview' as const;
  protected maxSubscriptions = 1; // Only one TradingView subscription per user

  protected planPricing: Record<ServicePlan, number> = {
    pro: 150,
    individual: 100,
    // Invalid plans for TradingView
    premium: 0,
    family: 0,
    basic: 0,
    standard: 0,
  };

  protected planDetails: Record<ServicePlan, ServicePlanDetails> = {
    pro: {
      plan: 'pro',
      name: 'TradingView Pro',
      description: 'Professional trading platform with advanced features',
      price: 150,
      features: [
        'Unlimited server-side alerts',
        'Priority customer support',
        'No ads',
        'More indicators per chart (25)',
        'More charts per layout (8)',
        'Custom time intervals',
        'Volume profile indicators',
        'Multiple watchlists (10)',
        'Intraday exotic charts',
      ],
      limitations: ['25 indicators per chart', '8 charts per layout'],
    },
    individual: {
      plan: 'individual',
      name: 'TradingView Pro+',
      description: 'Enhanced features for individual traders',
      price: 100,
      features: [
        'Everything in Pro plan',
        'Unlimited indicators per chart',
        'Unlimited charts per layout',
        'Seconds-based intervals',
        'Extended trading hours data',
        'Multiple watchlists (20)',
        'Alerts on indicators',
      ],
    },
    // Invalid plans for TradingView
    premium: {
      plan: 'premium',
      name: 'Invalid Plan',
      description: 'Not available for TradingView',
      price: 0,
      features: [],
    },
    family: {
      plan: 'family',
      name: 'Invalid Plan',
      description: 'Not available for TradingView',
      price: 0,
      features: [],
    },
    basic: {
      plan: 'basic',
      name: 'Invalid Plan',
      description: 'Not available for TradingView',
      price: 0,
      features: [],
    },
    standard: {
      plan: 'standard',
      name: 'Invalid Plan',
      description: 'Not available for TradingView',
      price: 0,
      features: [],
    },
  };

  override validateMetadata(metadata: SubscriptionMetadata): boolean {
    try {
      const tradingViewMetadata = metadata as TradingViewMetadata;

      // Check required fields
      if (
        !tradingViewMetadata.region ||
        !tradingViewMetadata.charts ||
        tradingViewMetadata.alerts_count === undefined
      ) {
        return false;
      }

      // Validate region format
      if (
        tradingViewMetadata.region.length < 2 ||
        tradingViewMetadata.region.length > 10
      ) {
        return false;
      }

      // Validate charts setting
      if (!['limited', 'unlimited'].includes(tradingViewMetadata.charts)) {
        return false;
      }

      // Validate alerts count
      if (
        tradingViewMetadata.alerts_count < 0 ||
        tradingViewMetadata.alerts_count > 10000
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  protected override isValidPlan(plan: ServicePlan): boolean {
    return plan === 'pro' || plan === 'individual';
  }

  override getAvailablePlans(): ServicePlanDetails[] {
    return [this.planDetails.pro, this.planDetails.individual];
  }

  override async validatePurchase(
    userId: string,
    plan: ServicePlan
  ): Promise<boolean> {
    // Check if plan is valid for TradingView
    if (!this.isValidPlan(plan)) {
      return false;
    }

    // TradingView only allows one subscription per user
    return this.canAddSubscription(userId);
  }

  /**
   * Validate plan compatibility with metadata
   * @param plan - TradingView plan
   * @param metadata - TradingView metadata
   * @returns Validation result
   */
  validatePlanMetadataCompatibility(
    plan: ServicePlan,
    metadata: TradingViewMetadata
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (plan) {
      case 'pro':
        if (metadata.charts === 'unlimited') {
          errors.push('Pro plan has limited charts per layout (8 max)');
        }
        if (metadata.alerts_count > 1000) {
          errors.push('Pro plan supports up to 1000 alerts');
        }
        break;

      case 'individual':
        // Individual plan supports unlimited charts and high alert counts
        if (metadata.alerts_count > 5000) {
          errors.push('Individual plan supports up to 5000 alerts');
        }
        break;

      default:
        errors.push('Invalid TradingView plan');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get recommended plan based on requirements
   * @param chartsNeeded - Number of charts needed per layout
   * @param alertsNeeded - Number of alerts needed
   * @returns Recommended plan
   */
  getRecommendedPlan(
    chartsNeeded: number,
    alertsNeeded: number
  ): ServicePlan | null {
    if (chartsNeeded <= 8 && alertsNeeded <= 1000) {
      return 'pro';
    }

    if (chartsNeeded > 8 || alertsNeeded > 1000) {
      return 'individual';
    }

    return null;
  }

  /**
   * Get plan limits and features
   * @param plan - TradingView plan
   * @returns Plan limits
   */
  getPlanLimits(plan: ServicePlan): {
    maxChartsPerLayout: number | 'unlimited';
    maxIndicatorsPerChart: number | 'unlimited';
    maxAlerts: number;
    maxWatchlists: number;
    hasExtendedHours: boolean;
    hasVolumeProfile: boolean;
  } {
    switch (plan) {
      case 'pro':
        return {
          maxChartsPerLayout: 8,
          maxIndicatorsPerChart: 25,
          maxAlerts: 1000,
          maxWatchlists: 10,
          hasExtendedHours: false,
          hasVolumeProfile: true,
        };
      case 'individual':
        return {
          maxChartsPerLayout: 'unlimited',
          maxIndicatorsPerChart: 'unlimited',
          maxAlerts: 5000,
          maxWatchlists: 20,
          hasExtendedHours: true,
          hasVolumeProfile: true,
        };
      default:
        return {
          maxChartsPerLayout: 0,
          maxIndicatorsPerChart: 0,
          maxAlerts: 0,
          maxWatchlists: 0,
          hasExtendedHours: false,
          hasVolumeProfile: false,
        };
    }
  }

  /**
   * Calculate regional pricing adjustments
   * @param region - Region code
   * @param basePricing - Base pricing in credits
   * @returns Adjusted pricing
   */
  getRegionalPricing(region: string, basePricing: number): number {
    const regionalMultipliers: Record<string, number> = {
      US: 1.0,
      CA: 0.95,
      GB: 1.1,
      EU: 1.05,
      AU: 1.1,
      IN: 0.4,
      BR: 0.5,
      MX: 0.6,
      JP: 1.15,
      SG: 1.0,
      HK: 1.0,
    };

    const multiplier = regionalMultipliers[region.toUpperCase()] || 1.0;
    return Math.round(basePricing * multiplier);
  }

  /**
   * Check if user qualifies for TradingView subscription
   * Additional business logic for TradingView subscriptions
   * @param userId - User ID
   * @param tradingExperience - User's trading experience level
   * @returns Qualification result
   */
  async checkTradingQualification(
    _userId: string,
    tradingExperience: 'beginner' | 'intermediate' | 'advanced'
  ): Promise<{ qualified: boolean; reason?: string }> {
    // For beginners, recommend starting with basic features
    if (tradingExperience === 'beginner') {
      return {
        qualified: true,
        reason: 'Consider starting with Pro plan to learn advanced features',
      };
    }

    return { qualified: true };
  }

  /**
   * Get account rotation schedule for TradingView subscriptions
   * TradingView accounts may need monthly rotation for security
   * @returns Rotation schedule in days
   */
  getAccountRotationSchedule(): number {
    return 30; // Rotate every 30 days
  }

  /**
   * Validate TradingView specific requirements
   * @param metadata - TradingView metadata
   * @returns Validation with specific TradingView rules
   */
  validateTradingViewRequirements(metadata: TradingViewMetadata): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate alert count is reasonable
    if (metadata.alerts_count > 1000) {
      warnings.push('High alert count may impact performance');
    }

    // Check if unlimited charts is really needed
    if (metadata.charts === 'unlimited') {
      warnings.push('Unlimited charts requires Individual plan');
    }

    // Regional availability check
    const supportedRegions = [
      'US',
      'CA',
      'GB',
      'EU',
      'AU',
      'IN',
      'BR',
      'MX',
      'JP',
      'SG',
      'HK',
    ];
    if (!supportedRegions.includes(metadata.region.toUpperCase())) {
      warnings.push('Region may have limited TradingView availability');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export const tradingViewHandler = new TradingViewHandler();
