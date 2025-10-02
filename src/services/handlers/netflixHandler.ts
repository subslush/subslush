import {
  ServicePlan,
  ServicePlanDetails,
  SubscriptionMetadata,
  NetflixMetadata,
} from '../../types/subscription';
import { BaseServiceHandler } from './baseServiceHandler';

export class NetflixHandler extends BaseServiceHandler {
  serviceType = 'netflix' as const;
  protected maxSubscriptions = 2; // Allow up to 2 Netflix subscriptions per user

  protected planPricing: Record<ServicePlan, number> = {
    basic: 30,
    standard: 50,
    premium: 70,
    // Invalid plans for Netflix
    family: 0,
    pro: 0,
    individual: 0,
  };

  protected planDetails: Record<ServicePlan, ServicePlanDetails> = {
    basic: {
      plan: 'basic',
      name: 'Netflix Basic',
      description: 'Standard definition streaming on 1 screen',
      price: 30,
      features: [
        'Unlimited movies and TV shows',
        'Watch on 1 screen at a time',
        'Watch on phone, tablet, computer, TV',
        'Standard definition (SD)',
      ],
      limitations: ['1 screen only', 'SD quality', 'No HDR'],
    },
    standard: {
      plan: 'standard',
      name: 'Netflix Standard',
      description: 'HD streaming on up to 2 screens simultaneously',
      price: 50,
      features: [
        'Everything in Basic plan',
        'Watch on 2 screens at the same time',
        'High definition (HD) available',
        'Download on 2 devices',
      ],
      limitations: ['2 screens maximum', 'No Ultra HD'],
    },
    premium: {
      plan: 'premium',
      name: 'Netflix Premium',
      description: 'Ultra HD streaming on up to 4 screens simultaneously',
      price: 70,
      features: [
        'Everything in Standard plan',
        'Watch on 4 screens at the same time',
        'Ultra High Definition (UHD/4K) available',
        'HDR and Dolby Vision',
        'Download on 6 devices',
        'Netflix spatial audio',
      ],
    },
    // Invalid plans for Netflix
    family: {
      plan: 'family',
      name: 'Invalid Plan',
      description: 'Not available for Netflix',
      price: 0,
      features: [],
    },
    pro: {
      plan: 'pro',
      name: 'Invalid Plan',
      description: 'Not available for Netflix',
      price: 0,
      features: [],
    },
    individual: {
      plan: 'individual',
      name: 'Invalid Plan',
      description: 'Not available for Netflix',
      price: 0,
      features: [],
    },
  };

  override validateMetadata(metadata: SubscriptionMetadata): boolean {
    try {
      const netflixMetadata = metadata as NetflixMetadata;

      // Check required fields
      if (
        !netflixMetadata.region ||
        !netflixMetadata.quality ||
        netflixMetadata.screens === undefined
      ) {
        return false;
      }

      // Validate region format
      if (
        netflixMetadata.region.length < 2 ||
        netflixMetadata.region.length > 10
      ) {
        return false;
      }

      // Validate screens count
      if (netflixMetadata.screens < 1 || netflixMetadata.screens > 4) {
        return false;
      }

      // Validate quality
      if (!['SD', 'HD', '4K'].includes(netflixMetadata.quality)) {
        return false;
      }

      // Validate profiles if provided
      if (netflixMetadata.profiles !== undefined) {
        if (netflixMetadata.profiles < 1 || netflixMetadata.profiles > 5) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  protected override isValidPlan(plan: ServicePlan): boolean {
    return plan === 'basic' || plan === 'standard' || plan === 'premium';
  }

  override getAvailablePlans(): ServicePlanDetails[] {
    return [
      this.planDetails.basic,
      this.planDetails.standard,
      this.planDetails.premium,
    ];
  }

  override async validatePurchase(
    userId: string,
    plan: ServicePlan
  ): Promise<boolean> {
    // Check if plan is valid for Netflix
    if (!this.isValidPlan(plan)) {
      return false;
    }

    // Netflix allows up to 2 subscriptions per user
    return this.canAddSubscription(userId);
  }

  /**
   * Validate plan compatibility with metadata
   * @param plan - Netflix plan
   * @param metadata - Netflix metadata
   * @returns Validation result
   */
  validatePlanMetadataCompatibility(
    plan: ServicePlan,
    metadata: NetflixMetadata
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    switch (plan) {
      case 'basic':
        if (metadata.screens > 1) {
          errors.push('Basic plan only supports 1 screen');
        }
        if (metadata.quality !== 'SD') {
          errors.push('Basic plan only supports SD quality');
        }
        break;

      case 'standard':
        if (metadata.screens > 2) {
          errors.push('Standard plan supports maximum 2 screens');
        }
        if (metadata.quality === '4K') {
          errors.push('Standard plan does not support 4K quality');
        }
        break;

      case 'premium':
        if (metadata.screens > 4) {
          errors.push('Premium plan supports maximum 4 screens');
        }
        // Premium supports all quality levels
        break;

      default:
        errors.push('Invalid Netflix plan');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get recommended plan based on requirements
   * @param screens - Number of screens needed
   * @param quality - Desired quality level
   * @returns Recommended plan
   */
  getRecommendedPlan(screens: number, quality: string): ServicePlan | null {
    if (screens === 1 && quality === 'SD') {
      return 'basic';
    }

    if (screens <= 2 && quality !== '4K') {
      return 'standard';
    }

    if (screens <= 4) {
      return 'premium';
    }

    return null; // Requirements exceed maximum plan
  }

  /**
   * Get maximum features for a plan
   * @param plan - Netflix plan
   * @returns Maximum features available
   */
  getPlanLimits(plan: ServicePlan): {
    maxScreens: number;
    maxQuality: string;
    maxDownloads: number;
  } {
    switch (plan) {
      case 'basic':
        return {
          maxScreens: 1,
          maxQuality: 'SD',
          maxDownloads: 1,
        };
      case 'standard':
        return {
          maxScreens: 2,
          maxQuality: 'HD',
          maxDownloads: 2,
        };
      case 'premium':
        return {
          maxScreens: 4,
          maxQuality: '4K',
          maxDownloads: 6,
        };
      default:
        return {
          maxScreens: 0,
          maxQuality: 'SD',
          maxDownloads: 0,
        };
    }
  }

  /**
   * Calculate region-specific pricing
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
      AU: 1.15,
      IN: 0.5,
      BR: 0.6,
      MX: 0.7,
      JP: 1.2,
    };

    const multiplier = regionalMultipliers[region.toUpperCase()] || 1.0;
    return Math.round(basePricing * multiplier);
  }
}

export const netflixHandler = new NetflixHandler();
