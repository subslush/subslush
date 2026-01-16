import {
  ServicePlan,
  ServicePlanDetails,
  SubscriptionMetadata,
  SpotifyMetadata,
} from '../../types/subscription';
import { BaseServiceHandler } from './baseServiceHandler';

export class SpotifyHandler extends BaseServiceHandler {
  serviceType = 'spotify' as const;
  protected maxSubscriptions = 1; // Only one Spotify subscription per user

  protected planPricing: Record<ServicePlan, number> = {
    premium: 50,
    family: 80,
    // Invalid plans for Spotify
    basic: 0,
    standard: 0,
    pro: 0,
    individual: 0,
  };

  protected planDetails: Record<ServicePlan, ServicePlanDetails> = {
    premium: {
      plan: 'premium',
      name: 'Spotify Premium Individual',
      description: 'Ad-free music streaming with offline downloads',
      price: 50,
      features: [
        'No ads interruption',
        'Download music for offline listening',
        'High-quality audio (320kbps)',
        'Unlimited skips',
        'Play any song',
      ],
      limitations: ['Single user account'],
    },
    family: {
      plan: 'family',
      name: 'Spotify Premium Family',
      description: 'Premium for up to 6 family members',
      price: 80,
      features: [
        'All Premium features',
        'Up to 6 accounts',
        'Family mix playlist',
        'Parental controls',
        'Individual profiles',
      ],
    },
    // Invalid plans for Spotify - should not be used
    basic: {
      plan: 'basic',
      name: 'Invalid Plan',
      description: 'Not available for Spotify',
      price: 0,
      features: [],
    },
    standard: {
      plan: 'standard',
      name: 'Invalid Plan',
      description: 'Not available for Spotify',
      price: 0,
      features: [],
    },
    pro: {
      plan: 'pro',
      name: 'Invalid Plan',
      description: 'Not available for Spotify',
      price: 0,
      features: [],
    },
    individual: {
      plan: 'individual',
      name: 'Invalid Plan',
      description: 'Not available for Spotify',
      price: 0,
      features: [],
    },
  };

  override validateMetadata(metadata: SubscriptionMetadata): boolean {
    try {
      const spotifyMetadata = metadata as SpotifyMetadata;

      // Check required fields
      if (!spotifyMetadata.region || !spotifyMetadata.payment_method) {
        return false;
      }

      // Validate region format (ISO country codes)
      if (
        spotifyMetadata.region.length < 2 ||
        spotifyMetadata.region.length > 10
      ) {
        return false;
      }

      // Validate payment method
      if (
        spotifyMetadata.payment_method.length === 0 ||
        spotifyMetadata.payment_method.length > 50
      ) {
        return false;
      }

      // Validate screens if provided
      if (spotifyMetadata.screens !== undefined) {
        if (spotifyMetadata.screens < 1 || spotifyMetadata.screens > 6) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  protected override isValidPlan(plan: ServicePlan): boolean {
    return plan === 'premium' || plan === 'family';
  }

  override getAvailablePlans(): ServicePlanDetails[] {
    const plans = ['premium', 'family']
      .map(plan => this.planDetails[plan])
      .filter(Boolean) as ServicePlanDetails[];
    return plans;
  }

  override async validatePurchase(
    userId: string,
    plan: ServicePlan
  ): Promise<boolean> {
    // Check if plan is valid for Spotify
    if (!this.isValidPlan(plan)) {
      return false;
    }

    // Spotify only allows one subscription per user
    return this.canAddSubscription(userId);
  }

  /**
   * Get region-specific pricing adjustments
   * @param region - ISO country code
   * @param basePricing - Base pricing in credits
   * @returns Adjusted pricing for region
   */
  getRegionalPricing(region: string, basePricing: number): number {
    // Regional pricing adjustments (could be moved to config)
    const regionalMultipliers: Record<string, number> = {
      US: 1.0,
      CA: 0.95,
      GB: 1.1,
      EU: 1.05,
      AU: 1.1,
      IN: 0.6,
      BR: 0.7,
      MX: 0.8,
    };

    const multiplier = regionalMultipliers[region.toUpperCase()] || 1.0;
    return Math.round(basePricing * multiplier);
  }

  /**
   * Validate specific Spotify account requirements
   * @param metadata - Spotify metadata
   * @returns Validation result with details
   */
  validateSpotifyAccount(metadata: SpotifyMetadata): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate region
    if (!metadata.region || metadata.region.length < 2) {
      errors.push('Invalid region code');
    }

    // Validate payment method
    if (
      !metadata.payment_method ||
      metadata.payment_method.trim().length === 0
    ) {
      errors.push('Payment method is required');
    }

    // Family plan specific validations
    if (metadata.screens && metadata.screens > 6) {
      errors.push('Family plan supports maximum 6 accounts');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const spotifyHandler = new SpotifyHandler();
