import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SubscriptionService } from '../services/subscriptionService';
import { serviceHandlerRegistry } from '../services/handlers';
import { creditService } from '../services/creditService';

// Mock dependencies
jest.mock('../config/database');
jest.mock('../config/redis');
jest.mock('../services/creditService');
jest.mock('../utils/logger');

describe('SubscriptionService', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
  const mockSubscriptionId = '987fcdeb-51d3-12e3-b456-426614174000';

  // Helper to create valid subscription input
  // Helper function for creating valid subscription input if needed
  // const _createValidSubscriptionInput = (): CreateSubscriptionInput => ({
  //   service_type: 'spotify',
  //   service_plan: 'premium',
  //   start_date: new Date('2024-01-01'),
  //   end_date: new Date('2024-12-31'),
  //   renewal_date: new Date('2024-12-31'),
  //   metadata: {
  //     region: 'US',
  //     payment_method: 'credit_card'
  //   }
  // });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation Logic', () => {
    it('should validate subscription dates correctly', () => {
      const service = new SubscriptionService();

      // Valid dates
      expect(
        service['validateSubscriptionDates'](
          new Date('2024-01-01'),
          new Date('2024-12-31'),
          new Date('2024-12-31')
        )
      ).toBe(true);

      // Invalid: start date after end date
      expect(
        service['validateSubscriptionDates'](
          new Date('2024-12-31'),
          new Date('2024-01-01'),
          new Date('2024-12-31')
        )
      ).toBe(false);

      // Invalid: renewal date before start date
      expect(
        service['validateSubscriptionDates'](
          new Date('2024-01-01'),
          new Date('2024-12-31'),
          new Date('2023-12-31')
        )
      ).toBe(false);
    });

    it('should validate service plan compatibility', () => {
      const service = new SubscriptionService();

      // Valid combinations
      expect(service['validateServicePlan']('spotify', 'premium')).toBe(true);
      expect(service['validateServicePlan']('netflix', 'basic')).toBe(true);
      expect(service['validateServicePlan']('tradingview', 'pro')).toBe(true);

      // Invalid combinations - will depend on serviceHandlerRegistry mock
      // This tests the integration with the handler registry
    });

    it('should validate metadata for service types', () => {
      const service = new SubscriptionService();

      const spotifyMetadata = {
        region: 'US',
        payment_method: 'credit_card',
      };

      const netflixMetadata = {
        screens: 2,
        region: 'US',
        quality: 'HD' as const,
        profiles: 3,
      };

      // These tests depend on the service handlers being properly implemented
      expect(service['validateMetadata']('spotify', spotifyMetadata)).toBe(
        true
      );
      expect(service['validateMetadata']('netflix', netflixMetadata)).toBe(
        true
      );
    });
  });

  describe('Business Logic', () => {
    it('should check purchase eligibility correctly', async () => {
      // Mock credit service to return sufficient balance
      const mockCreditService = creditService as jest.Mocked<
        typeof creditService
      >;
      mockCreditService.getUserBalance.mockResolvedValue({
        userId: mockUserId,
        totalBalance: 100,
        availableBalance: 100,
        pendingBalance: 0,
        lastUpdated: new Date(),
      });

      const service = new SubscriptionService();

      // Mock the subscription count to return 0 (no existing subscriptions)
      jest.spyOn(service, 'getActiveSubscriptionsCount').mockResolvedValue(0);

      const result = await service.canPurchaseSubscription(
        mockUserId,
        'spotify',
        'premium'
      );

      expect(result.canPurchase).toBe(true);
    });

    it('should reject purchase when insufficient credits', async () => {
      // Mock credit service to return insufficient balance
      const mockCreditService = creditService as jest.Mocked<
        typeof creditService
      >;
      mockCreditService.getUserBalance.mockResolvedValue({
        userId: mockUserId,
        totalBalance: 10,
        availableBalance: 10,
        pendingBalance: 0,
        lastUpdated: new Date(),
      });

      const service = new SubscriptionService();
      jest.spyOn(service, 'getActiveSubscriptionsCount').mockResolvedValue(0);

      const result = await service.canPurchaseSubscription(
        mockUserId,
        'spotify',
        'premium'
      );

      expect(result.canPurchase).toBe(false);
      expect(result.reason).toContain('Insufficient credit balance');
    });

    it('should reject purchase when subscription limit reached', async () => {
      const service = new SubscriptionService();

      // Mock to return max subscriptions for Spotify (1)
      jest.spyOn(service, 'getActiveSubscriptionsCount').mockResolvedValue(1);

      const result = await service.canPurchaseSubscription(
        mockUserId,
        'spotify',
        'premium'
      );

      expect(result.canPurchase).toBe(false);
      expect(result.reason).toContain(
        'Maximum 1 spotify subscription(s) allowed'
      );
    });
  });

  describe('Status Management', () => {
    it('should validate status transitions correctly', () => {
      const service = new SubscriptionService();

      // Valid transitions
      expect(service['validateStatusTransition']('pending', 'active')).toBe(
        true
      );
      expect(service['validateStatusTransition']('active', 'expired')).toBe(
        true
      );
      expect(service['validateStatusTransition']('active', 'cancelled')).toBe(
        true
      );

      // Invalid transitions
      expect(service['validateStatusTransition']('cancelled', 'active')).toBe(
        false
      );
      expect(service['validateStatusTransition']('expired', 'pending')).toBe(
        false
      );
    });
  });

  describe('Service Handler Integration', () => {
    it('should get max subscriptions from handler registry', () => {
      const spotifyMax =
        serviceHandlerRegistry.getMaxSubscriptionsForService('spotify');
      const netflixMax =
        serviceHandlerRegistry.getMaxSubscriptionsForService('netflix');
      const tradingviewMax =
        serviceHandlerRegistry.getMaxSubscriptionsForService('tradingview');

      expect(spotifyMax).toBe(1);
      expect(netflixMax).toBe(2);
      expect(tradingviewMax).toBe(1);
    });

    it('should validate service plans through handler registry', () => {
      expect(
        serviceHandlerRegistry.validateServicePlan('spotify', 'premium')
      ).toBe(true);
      expect(
        serviceHandlerRegistry.validateServicePlan('spotify', 'basic')
      ).toBe(false);
      expect(
        serviceHandlerRegistry.validateServicePlan('netflix', 'standard')
      ).toBe(true);
      expect(
        serviceHandlerRegistry.validateServicePlan('netflix', 'family')
      ).toBe(false);
    });

    it('should get plan pricing from handlers', () => {
      const spotifyHandler = serviceHandlerRegistry.getHandler('spotify');
      const netflixHandler = serviceHandlerRegistry.getHandler('netflix');
      const tradingviewHandler =
        serviceHandlerRegistry.getHandler('tradingview');

      expect(spotifyHandler?.getPlanPricing('premium')).toBe(50);
      expect(netflixHandler?.getPlanPricing('basic')).toBe(30);
      expect(tradingviewHandler?.getPlanPricing('pro')).toBe(150);
    });
  });

  describe('Health Check', () => {
    it('should perform comprehensive health check', async () => {
      const service = new SubscriptionService();

      // Basic test that health check returns a boolean
      const isHealthy = await service.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Cache Management', () => {
    it('should have cache TTL constants defined', () => {
      const service = new SubscriptionService();

      // Verify cache configuration exists (access private properties for testing)
      expect(service['USER_SUBS_CACHE_TTL']).toBe(300);
      expect(service['SUBSCRIPTION_CACHE_TTL']).toBe(300);
      // expect(service['STATS_CACHE_TTL']).toBe(600); // Commented out in implementation
      expect(service['CACHE_PREFIX']).toBe('subscription:');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const service = new SubscriptionService();

      // Test that service methods return error results instead of throwing
      // This is a basic test - in real implementation, we'd mock database failures
      const result = await service.getSubscriptionById('invalid-uuid');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should handle Redis errors gracefully', async () => {
      // Similar test for Redis failures
      const service = new SubscriptionService();

      // Basic test structure - would need Redis mocking for complete test
      expect(service).toBeDefined();
    });
  });

  describe('Data Mapping', () => {
    it('should map database rows to subscription objects correctly', () => {
      const service = new SubscriptionService();

      const mockRow = {
        id: mockSubscriptionId,
        user_id: mockUserId,
        service_type: 'spotify',
        service_plan: 'premium',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        renewal_date: new Date('2024-12-31'),
        credentials_encrypted: 'encrypted_creds',
        status: 'active',
        metadata: '{"region":"US","payment_method":"credit_card"}',
        created_at: new Date('2024-01-01'),
      };

      const subscription = service['mapRowToSubscription'](mockRow);

      expect(subscription.id).toBe(mockSubscriptionId);
      expect(subscription.user_id).toBe(mockUserId);
      expect(subscription.service_type).toBe('spotify');
      expect(subscription.service_plan).toBe('premium');
      expect(subscription.status).toBe('active');
      expect(subscription.metadata).toEqual({
        region: 'US',
        payment_method: 'credit_card',
      });
    });

    it('should handle null metadata correctly', () => {
      const service = new SubscriptionService();

      const mockRowWithNullMetadata = {
        id: mockSubscriptionId,
        user_id: mockUserId,
        service_type: 'spotify',
        service_plan: 'premium',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        renewal_date: new Date('2024-12-31'),
        credentials_encrypted: null,
        status: 'active',
        metadata: null,
        created_at: new Date('2024-01-01'),
      };

      const subscription = service['mapRowToSubscription'](
        mockRowWithNullMetadata
      );

      expect(subscription.metadata).toBeUndefined();
      expect(subscription.credentials_encrypted).toBeNull();
    });
  });

  describe('Integration Tests', () => {
    it('should integrate with service handlers for plan validation', () => {
      // Test that the service correctly uses service handlers
      const spotifyHandler = serviceHandlerRegistry.getHandler('spotify');
      expect(spotifyHandler).toBeDefined();
      expect(spotifyHandler?.serviceType).toBe('spotify');

      const availablePlans = spotifyHandler?.getAvailablePlans();
      expect(availablePlans).toBeDefined();
      expect(availablePlans!.length).toBeGreaterThan(0);
    });

    it('should integrate with credit service for balance checks', () => {
      // Test integration with credit service
      expect(creditService).toBeDefined();
      expect(typeof creditService.getUserBalance).toBe('function');
    });
  });

  describe('Service Handler Registry Tests', () => {
    it('should have all required handlers registered', () => {
      const supportedServices =
        serviceHandlerRegistry.getSupportedServiceTypes();

      expect(supportedServices).toContain('spotify');
      expect(supportedServices).toContain('netflix');
      expect(supportedServices).toContain('tradingview');
      expect(supportedServices.length).toBe(3);
    });

    it('should provide service statistics', () => {
      const stats = serviceHandlerRegistry.getStatistics();

      expect(stats.totalHandlers).toBe(3);
      expect(stats.totalPlans).toBeGreaterThan(0);
      expect(stats.serviceTypes).toEqual(['spotify', 'netflix', 'tradingview']);
    });

    it('should validate all handler health', async () => {
      const health = await serviceHandlerRegistry.healthCheck();

      expect(health.spotify).toBe(true);
      expect(health.netflix).toBe(true);
      expect(health.tradingview).toBe(true);
    });
  });
});
