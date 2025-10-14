import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import {
  Subscription,
  SubscriptionStatus,
  ServiceType,
  ServicePlan,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionQuery,
  SubscriptionResult,
  SubscriptionsResult,
  SubscriptionOperationResult,
  SubscriptionPurchaseValidation,
  BatchUpdateResponse,
  VALID_STATUS_TRANSITIONS,
} from '../types/subscription';
import { createSuccessResult, createErrorResult } from '../types/service';
import { Logger } from '../utils/logger';
import { serviceHandlerRegistry } from './handlers';
import { getSubscriptionStatus } from '../utils/subscriptionHelpers';

export class SubscriptionService {
  private readonly CACHE_PREFIX = 'subscription:';
  private readonly USER_SUBS_CACHE_TTL = 300; // 5 minutes
  private readonly SUBSCRIPTION_CACHE_TTL = 300; // 5 minutes
  // private readonly STATS_CACHE_TTL = 600; // 10 minutes

  // CRUD Operations

  async createSubscription(
    userId: string,
    input: CreateSubscriptionInput
  ): Promise<SubscriptionResult> {
    try {
      Logger.info('Creating subscription', {
        userId,
        serviceType: input.service_type,
        plan: input.service_plan,
      });

      // Validate business logic
      const validationResult = await this.canPurchaseSubscription(
        userId,
        input.service_type,
        input.service_plan
      );
      if (!validationResult.canPurchase) {
        return createErrorResult(
          `Cannot purchase subscription: ${validationResult.reason}`
        );
      }

      // Validate dates
      if (
        !this.validateSubscriptionDates(
          input.start_date,
          input.end_date,
          input.renewal_date
        )
      ) {
        return createErrorResult('Invalid subscription dates');
      }

      // Validate service plan compatibility
      if (!this.validateServicePlan(input.service_type, input.service_plan)) {
        return createErrorResult(
          'Invalid service plan for the specified service type'
        );
      }

      // Validate metadata if provided
      if (
        input.metadata &&
        !this.validateMetadata(input.service_type, input.metadata)
      ) {
        return createErrorResult(
          'Invalid metadata for the specified service type'
        );
      }

      const subscriptionId = uuidv4();
      const pool = getDatabasePool();

      // Calculate the correct initial status based on subscription dates
      const initialStatus = getSubscriptionStatus(
        input.start_date,
        input.end_date,
        'pending'
      );

      const result = await pool.query(
        `INSERT INTO subscriptions (
          id, user_id, service_type, service_plan, start_date, end_date,
          renewal_date, credentials_encrypted, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, user_id, service_type, service_plan, start_date, end_date,
                  renewal_date, credentials_encrypted, status, metadata, created_at`,
        [
          subscriptionId,
          userId,
          input.service_type,
          input.service_plan,
          input.start_date,
          input.end_date,
          input.renewal_date,
          input.credentials_encrypted || null,
          initialStatus,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to create subscription');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Clear relevant caches
      await this.clearUserSubscriptionsCache(userId);
      await this.clearStatsCache();

      Logger.info('Subscription created successfully', {
        subscriptionId,
        userId,
      });
      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error creating subscription:', error);
      return createErrorResult('Failed to create subscription');
    }
  }

  async getSubscriptionById(
    subscriptionId: string,
    userId?: string
  ): Promise<SubscriptionResult> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}sub:${subscriptionId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        const subscription = JSON.parse(cached);
        // Verify user ownership if userId provided
        if (userId && subscription.user_id !== userId) {
          return createErrorResult('Subscription not found');
        }
        return createSuccessResult(subscription);
      }

      const pool = getDatabasePool();
      const query = userId
        ? 'SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2'
        : 'SELECT * FROM subscriptions WHERE id = $1';

      const params = userId ? [subscriptionId, userId] : [subscriptionId];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Cache the result
      await redisClient
        .getClient()
        .setex(
          cacheKey,
          this.SUBSCRIPTION_CACHE_TTL,
          JSON.stringify(subscription)
        );

      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error getting subscription:', error);
      return createErrorResult('Failed to retrieve subscription');
    }
  }

  async getUserSubscriptions(
    userId: string,
    query?: SubscriptionQuery
  ): Promise<SubscriptionsResult> {
    try {
      const {
        service_type,
        status,
        limit = 20,
        offset = 0,
        include_expired = false,
      } = query || {};

      // Try cache for simple queries (no filters)
      const cacheKey = `${this.CACHE_PREFIX}user:${userId}:${JSON.stringify(query || {})}`;
      if (!service_type && !status) {
        const cached = await redisClient.getClient().get(cacheKey);
        if (cached) {
          return createSuccessResult(JSON.parse(cached));
        }
      }

      const pool = getDatabasePool();
      let sql = 'SELECT * FROM subscriptions WHERE user_id = $1';
      const params: any[] = [userId];
      let paramCount = 1;

      // Add filters
      if (service_type) {
        sql += ` AND service_type = $${++paramCount}`;
        params.push(service_type);
      }

      if (status) {
        sql += ` AND status = $${++paramCount}`;
        params.push(status);
      }

      if (!include_expired) {
        sql += ` AND status != 'expired'`;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);
      const subscriptions = result.rows.map(row =>
        this.mapRowToSubscription(row)
      );

      // Cache simple queries
      if (!service_type && !status) {
        await redisClient
          .getClient()
          .setex(
            cacheKey,
            this.USER_SUBS_CACHE_TTL,
            JSON.stringify(subscriptions)
          );
      }

      return createSuccessResult(subscriptions);
    } catch (error) {
      Logger.error('Error getting user subscriptions:', error);
      return createErrorResult('Failed to retrieve subscriptions');
    }
  }

  async updateSubscription(
    subscriptionId: string,
    userId: string,
    updates: UpdateSubscriptionInput
  ): Promise<SubscriptionResult> {
    try {
      Logger.info('Updating subscription', { subscriptionId, userId, updates });

      const pool = getDatabasePool();

      // First, get current subscription to validate ownership and current state
      const currentResult = await pool.query(
        'SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2',
        [subscriptionId, userId]
      );

      if (currentResult.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const currentSub = this.mapRowToSubscription(currentResult.rows[0]);

      // Validate date changes if provided
      if (updates.end_date || updates.renewal_date) {
        const endDate = updates.end_date || currentSub.end_date;
        const renewalDate = updates.renewal_date || currentSub.renewal_date;

        if (
          !this.validateSubscriptionDates(
            currentSub.start_date,
            endDate,
            renewalDate
          )
        ) {
          return createErrorResult('Invalid date update');
        }
      }

      // Validate service plan change if provided
      if (updates.service_plan) {
        if (
          !this.validateServicePlan(
            currentSub.service_type,
            updates.service_plan
          )
        ) {
          return createErrorResult(
            'Invalid service plan for this service type'
          );
        }
      }

      // Validate metadata if provided
      if (
        updates.metadata &&
        !this.validateMetadata(currentSub.service_type, updates.metadata)
      ) {
        return createErrorResult('Invalid metadata for this service type');
      }

      // Build update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCount = 0;

      if (updates.service_plan) {
        updateFields.push(`service_plan = $${++paramCount}`);
        updateValues.push(updates.service_plan);
      }

      if (updates.end_date) {
        updateFields.push(`end_date = $${++paramCount}`);
        updateValues.push(updates.end_date);
      }

      if (updates.renewal_date) {
        updateFields.push(`renewal_date = $${++paramCount}`);
        updateValues.push(updates.renewal_date);
      }

      if (updates.credentials_encrypted !== undefined) {
        updateFields.push(`credentials_encrypted = $${++paramCount}`);
        updateValues.push(updates.credentials_encrypted);
      }

      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${++paramCount}`);
        updateValues.push(
          updates.metadata ? JSON.stringify(updates.metadata) : null
        );
      }

      if (updateFields.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      const sql = `
        UPDATE subscriptions
        SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount} AND user_id = $${++paramCount}
        RETURNING id, user_id, service_type, service_plan, start_date, end_date,
                  renewal_date, credentials_encrypted, status, metadata, created_at
      `;
      updateValues.push(subscriptionId, userId);

      const result = await pool.query(sql, updateValues);

      if (result.rows.length === 0) {
        return createErrorResult('Failed to update subscription');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Clear caches
      await this.clearSubscriptionCache(subscriptionId);
      await this.clearUserSubscriptionsCache(userId);

      Logger.info('Subscription updated successfully', {
        subscriptionId,
        userId,
      });
      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error updating subscription:', error);
      return createErrorResult('Failed to update subscription');
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    userId: string,
    reason: string
  ): Promise<SubscriptionOperationResult> {
    try {
      Logger.info('Cancelling subscription', {
        subscriptionId,
        userId,
        reason,
      });

      // const statusUpdate: StatusUpdateInput = {
      //   status: 'cancelled',
      //   reason,
      //   updated_by: userId
      // };

      const result = await this.updateSubscriptionStatus(
        subscriptionId,
        'cancelled',
        reason,
        userId
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error as string,
        };
      }

      return {
        success: true,
        data: true,
        subscription_id: subscriptionId,
      };
    } catch (error) {
      Logger.error('Error cancelling subscription:', error);
      return {
        success: false,
        error: 'Failed to cancel subscription',
      };
    }
  }

  // Status Management

  async updateSubscriptionStatus(
    subscriptionId: string,
    newStatus: SubscriptionStatus,
    reason: string,
    updatedBy: string
  ): Promise<SubscriptionResult> {
    try {
      const pool = getDatabasePool();

      // Get current subscription
      const currentResult = await pool.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );

      if (currentResult.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const currentSub = this.mapRowToSubscription(currentResult.rows[0]);

      // Validate status transition
      if (!this.validateStatusTransition(currentSub.status, newStatus)) {
        return createErrorResult(
          `Invalid status transition from ${currentSub.status} to ${newStatus}`
        );
      }

      // Update status
      const result = await pool.query(
        `UPDATE subscriptions
         SET status = $1
         WHERE id = $2
         RETURNING id, user_id, service_type, service_plan, start_date, end_date,
                   renewal_date, credentials_encrypted, status, metadata, created_at`,
        [newStatus, subscriptionId]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to update subscription status');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Clear caches
      await this.clearSubscriptionCache(subscriptionId);
      await this.clearUserSubscriptionsCache(subscription.user_id);
      await this.clearStatsCache();

      Logger.info('Subscription status updated', {
        subscriptionId,
        oldStatus: currentSub.status,
        newStatus,
        reason,
        updatedBy,
      });

      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error updating subscription status:', error);
      return createErrorResult('Failed to update subscription status');
    }
  }

  private validateStatusTransition(
    currentStatus: SubscriptionStatus,
    newStatus: SubscriptionStatus
  ): boolean {
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
    return validTransitions.includes(newStatus);
  }

  async updateExpiredSubscriptions(): Promise<BatchUpdateResponse> {
    try {
      Logger.info('Starting batch update of expired subscriptions');

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE subscriptions
         SET status = 'expired'
         WHERE status = 'active'
         AND end_date < NOW()
         RETURNING id, user_id`
      );

      const updatedCount = result.rows.length;
      const subscriptionIds = result.rows.map(row => row.id);
      const userIds = [...new Set(result.rows.map(row => row.user_id))];

      // Clear caches for affected users
      await Promise.all(
        userIds.map(userId => this.clearUserSubscriptionsCache(userId))
      );
      await Promise.all(
        subscriptionIds.map(id => this.clearSubscriptionCache(id))
      );
      await this.clearStatsCache();

      Logger.info('Batch update completed', {
        updatedCount,
        affectedUsers: userIds.length,
      });

      return createSuccessResult({
        updated: updatedCount,
        errors: [],
        subscription_ids: subscriptionIds,
      });
    } catch (error) {
      Logger.error('Error updating expired subscriptions:', error);
      return createErrorResult('Failed to update expired subscriptions');
    }
  }

  // Validation Logic

  private validateSubscriptionDates(
    startDate: Date,
    endDate: Date,
    renewalDate: Date
  ): boolean {
    return (
      startDate < endDate && renewalDate >= startDate && renewalDate <= endDate
    );
  }

  private validateServicePlan(
    serviceType: ServiceType,
    servicePlan: ServicePlan
  ): boolean {
    return serviceHandlerRegistry.validateServicePlan(serviceType, servicePlan);
  }

  private validateMetadata(serviceType: ServiceType, metadata: any): boolean {
    const handler = serviceHandlerRegistry.getHandler(serviceType);
    return handler ? handler.validateMetadata(metadata) : false;
  }

  // Business Logic

  async canPurchaseSubscription(
    userId: string,
    serviceType: ServiceType,
    _servicePlan: ServicePlan
  ): Promise<SubscriptionPurchaseValidation> {
    try {
      // Check if user has reached subscription limit for this service
      const activeCount = await this.getActiveSubscriptionsCount(
        userId,
        serviceType
      );
      const maxAllowed =
        serviceHandlerRegistry.getMaxSubscriptionsForService(serviceType);

      if (activeCount >= maxAllowed) {
        return {
          canPurchase: false,
          reason: `Maximum ${maxAllowed} ${serviceType} subscription(s) allowed`,
          existing_subscription: undefined,
        };
      }

      // Check for duplicate active subscriptions (service-specific logic)
      const hasDuplicate = await this.hasDuplicateSubscription(
        userId,
        serviceType
      );
      if (hasDuplicate) {
        const existingResult = await this.getUserSubscriptions(userId, {
          service_type: serviceType,
          status: 'active',
        });

        return {
          canPurchase: false,
          reason: `Active ${serviceType} subscription already exists`,
          existing_subscription: existingResult.success
            ? existingResult.data[0]
            : undefined,
        };
      }

      return {
        canPurchase: true,
      };
    } catch (error) {
      Logger.error('Error checking purchase eligibility:', error);
      return {
        canPurchase: false,
        reason: 'Failed to validate purchase eligibility',
      };
    }
  }

  async getActiveSubscriptionsCount(
    userId: string,
    serviceType?: ServiceType
  ): Promise<number> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}count:${userId}:${serviceType || 'all'}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        return parseInt(cached, 10);
      }

      const pool = getDatabasePool();
      let sql = `SELECT COUNT(*) as count FROM subscriptions
                 WHERE user_id = $1 AND status = 'active'`;
      const params: any[] = [userId];

      if (serviceType) {
        sql += ` AND service_type = $2`;
        params.push(serviceType);
      }

      const result = await pool.query(sql, params);
      const count = parseInt(result.rows[0]?.count || '0', 10);

      // Cache for 10 minutes
      await redisClient.getClient().setex(cacheKey, 600, count.toString());

      return count;
    } catch (error) {
      Logger.error('Error getting active subscriptions count:', error);
      return 0;
    }
  }

  async hasDuplicateSubscription(
    userId: string,
    serviceType: ServiceType
  ): Promise<boolean> {
    const activeCount = await this.getActiveSubscriptionsCount(
      userId,
      serviceType
    );
    return activeCount > 0;
  }

  // Utility Methods

  private mapRowToSubscription(row: any): Subscription {
    return {
      id: row.id,
      user_id: row.user_id,
      service_type: row.service_type,
      service_plan: row.service_plan,
      start_date: row.start_date,
      end_date: row.end_date,
      renewal_date: row.renewal_date,
      credentials_encrypted: row.credentials_encrypted,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    };
  }

  // Cache Management

  private async clearSubscriptionCache(subscriptionId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}sub:${subscriptionId}`;
    await redisClient.getClient().del(cacheKey);
  }

  private async clearUserSubscriptionsCache(userId: string): Promise<void> {
    // Clear all user subscription caches (with different query patterns)
    const pattern = `${this.CACHE_PREFIX}user:${userId}:*`;
    const keys = await redisClient.getClient().keys(pattern);
    if (keys.length > 0) {
      await redisClient.getClient().del(...keys);
    }

    // Clear count caches
    const countPattern = `${this.CACHE_PREFIX}count:${userId}:*`;
    const countKeys = await redisClient.getClient().keys(countPattern);
    if (countKeys.length > 0) {
      await redisClient.getClient().del(...countKeys);
    }
  }

  private async clearStatsCache(): Promise<void> {
    const pattern = `${this.CACHE_PREFIX}stats:*`;
    const keys = await redisClient.getClient().keys(pattern);
    if (keys.length > 0) {
      await redisClient.getClient().del(...keys);
    }
  }

  // Health Check

  async healthCheck(): Promise<boolean> {
    try {
      // Test database connection
      const pool = getDatabasePool();
      await pool.query('SELECT 1');

      // Test Redis connection
      await redisClient.getClient().ping();

      // Test service handlers
      const handlerHealth = await serviceHandlerRegistry.healthCheck();
      const allHandlersHealthy = Object.values(handlerHealth).every(
        healthy => healthy
      );

      return allHandlersHealthy;
    } catch (error) {
      Logger.error('Subscription service health check failed:', error);
      return false;
    }
  }
}

export const subscriptionService = new SubscriptionService();
