import Ajv, { type ValidateFunction } from 'ajv';
import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import {
  Subscription,
  SubscriptionStatus,
  ServiceType,
  ServicePlan,
  SubscriptionMetadata,
  SubscriptionWithUserInfo,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionQuery,
  SubscriptionResult,
  SubscriptionsResult,
  SubscriptionOperationResult,
  SubscriptionPurchaseValidation,
  BatchUpdateResponse,
  UpgradeOptionsSnapshot,
  VALID_STATUS_TRANSITIONS,
} from '../types/subscription';
import {
  createSuccessResult,
  createErrorResult,
  ServiceResult,
} from '../types/service';
import { Logger } from '../utils/logger';
import { serviceHandlerRegistry } from './handlers';
import { catalogService } from './catalogService';
import { upgradeSelectionService } from './upgradeSelectionService';
import { notificationService } from './notificationService';
import { getMetadataSchema, shouldUseHandler } from '../utils/catalogRules';
import { parseJsonValue } from '../utils/json';
import {
  formatSubscriptionDisplayName,
  getSubscriptionStatus,
} from '../utils/subscriptionHelpers';
import { credentialsEncryptionService } from '../utils/encryption';
import {
  hasUpgradeOptions,
  normalizeUpgradeOptions,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';
import type { Product, ProductVariant } from '../types/catalog';

const metadataValidator = new Ajv({ allErrors: true, strict: false });
const metadataSchemaCache = new Map<string, ValidateFunction>();
const CREDENTIAL_PROVISION_TASK_CATEGORY = 'order_fulfillment';
const CREDENTIAL_PROVISION_TASK_TYPE = 'credential_provision';
const CREDENTIAL_PROVISION_TASK_PRIORITY = 'high';
const CREDENTIAL_PROVISION_TASK_DUE_HOURS = 72;
const SELECTION_PENDING_TASK_CATEGORY = 'selection_pending';
const SELECTION_PENDING_TASK_TYPE = 'support';
const SELECTION_PENDING_TASK_PRIORITY = 'medium';
const SELECTION_PENDING_TASK_DUE_HOURS = 72;

function resolveSchemaValidator(
  schema: Record<string, any>
): ValidateFunction | null {
  try {
    const cacheKey = JSON.stringify(schema);
    const cached = metadataSchemaCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const validator = metadataValidator.compile(schema);
    metadataSchemaCache.set(cacheKey, validator);
    return validator;
  } catch (error) {
    Logger.warn('Invalid metadata schema for catalog rules', { error });
    return null;
  }
}

function normalizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return parseJsonValue<unknown | null>(value, null);
  }

  return value;
}

export class SubscriptionService {
  private readonly CACHE_PREFIX = 'subscription:';
  private readonly USER_SUBS_CACHE_TTL = 300; // 5 minutes
  private readonly SUBSCRIPTION_CACHE_TTL = 300; // 5 minutes
  // private readonly STATS_CACHE_TTL = 600; // 10 minutes

  private async resolveUpgradeOptionsSnapshot(
    input: CreateSubscriptionInput
  ): Promise<UpgradeOptionsSnapshot | null> {
    if (input.upgrade_options_snapshot) {
      const validation = validateUpgradeOptions(input.upgrade_options_snapshot);
      if (!validation.valid) {
        Logger.warn('Invalid upgrade options snapshot provided', {
          reason: validation.reason,
        });
        return null;
      }
      return input.upgrade_options_snapshot;
    }

    if (input.order_id) {
      try {
        const pool = getDatabasePool();
        const result = await pool.query(
          'SELECT metadata FROM orders WHERE id = $1',
          [input.order_id]
        );
        const orderMetadata = parseJsonValue<Record<string, any>>(
          result.rows[0]?.metadata,
          {}
        );
        const fromOrder = normalizeUpgradeOptions(orderMetadata);
        if (fromOrder) {
          const validation = validateUpgradeOptions(fromOrder);
          if (!validation.valid) {
            Logger.warn('Invalid upgrade options in order metadata', {
              orderId: input.order_id,
              reason: validation.reason,
            });
            return null;
          }
          return fromOrder;
        }
      } catch (error) {
        Logger.warn('Failed to read upgrade options from order metadata', {
          orderId: input.order_id,
          error,
        });
      }
    }

    if (input.product_variant_id) {
      const listing = await this.resolveCatalogListingByVariant(
        input.product_variant_id
      );
      if (listing?.product?.metadata) {
        const fromProduct = normalizeUpgradeOptions(listing.product.metadata);
        if (fromProduct) {
          const validation = validateUpgradeOptions(fromProduct);
          if (!validation.valid) {
            Logger.warn('Invalid upgrade options in product metadata', {
              productId: listing.product.id,
              reason: validation.reason,
            });
            return null;
          }
          return fromProduct;
        }
      }
    }

    return null;
  }

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
        variantId: input.product_variant_id,
      });

      // Validate business logic
      if (!input.product_variant_id) {
        return createErrorResult(
          'Cannot purchase subscription: variant_id is required'
        );
      }
      const validationResult = await this.canPurchaseSubscription(
        userId,
        input.product_variant_id,
        input.metadata
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

      const subscriptionId = uuidv4();
      const pool = getDatabasePool();

      const requestedStatus = input.status ?? 'pending';
      const initialStatus =
        requestedStatus === 'pending'
          ? 'pending'
          : getSubscriptionStatus(
              input.start_date,
              input.end_date,
              requestedStatus
            );

      const upgradeOptionsSnapshot =
        await this.resolveUpgradeOptionsSnapshot(input);
      const selectionRequired = hasUpgradeOptions(upgradeOptionsSnapshot);
      const manualMonthlyOnly =
        upgradeOptionsSnapshot?.manual_monthly_upgrade === true &&
        !selectionRequired;

      const statusReason =
        selectionRequired && initialStatus === 'pending'
          ? 'waiting_for_selection'
          : input.status_reason || null;

      const metadataPayload = input.metadata
        ? {
            ...input.metadata,
            ...(input.auto_renew !== undefined && {
              auto_renew: input.auto_renew,
            }),
          }
        : input.auto_renew !== undefined
          ? { auto_renew: input.auto_renew }
          : null;

      const nextBillingAt =
        input.next_billing_at ?? (input.auto_renew ? input.renewal_date : null);

      const termStartAt =
        input.term_start_at ??
        (initialStatus === 'active' ? input.start_date : null);

      const credentialsEncrypted =
        credentialsEncryptionService.prepareForStorage(
          input.credentials_encrypted ?? null
        );

      const result = await pool.query(
        `INSERT INTO subscriptions (
          id, user_id, service_type, service_plan, start_date, term_start_at,
          end_date, renewal_date, credentials_encrypted, status, metadata, order_id,
          product_variant_id, price_cents, base_price_cents, discount_percent, term_months,
          currency, auto_renew, next_billing_at,
          renewal_method, billing_payment_method_id, auto_renew_enabled_at, auto_renew_disabled_at,
          status_reason, referral_reward_id, pre_launch_reward_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24, $25, $26, $27
        )
        RETURNING *`,
        [
          subscriptionId,
          userId,
          input.service_type,
          input.service_plan,
          input.start_date,
          termStartAt,
          input.end_date,
          input.renewal_date,
          credentialsEncrypted,
          initialStatus,
          metadataPayload ? JSON.stringify(metadataPayload) : null,
          input.order_id || null,
          input.product_variant_id || null,
          input.price_cents ?? null,
          input.base_price_cents ?? null,
          input.discount_percent ?? null,
          input.term_months ?? null,
          input.currency || null,
          input.auto_renew ?? null,
          nextBillingAt,
          input.renewal_method || null,
          input.billing_payment_method_id || null,
          input.auto_renew_enabled_at || null,
          input.auto_renew_disabled_at || null,
          statusReason,
          input.referral_reward_id || null,
          input.pre_launch_reward_id || null,
        ]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to create subscription');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Clear relevant caches
      await this.clearUserSubscriptionsCache(userId);
      await this.clearStatsCache();

      if (upgradeOptionsSnapshot) {
        await upgradeSelectionService.ensureSelection({
          subscriptionId,
          orderId: input.order_id || null,
          upgradeOptions: upgradeOptionsSnapshot,
        });
      }

      if (selectionRequired && upgradeOptionsSnapshot) {
        const noteParts = [
          `Selection required for ${input.service_type} ${input.service_plan}.`,
          `Subscription ${subscriptionId}`,
        ];
        if (input.order_id) {
          noteParts.push(`Order ${input.order_id}`);
        }
        await this.createSelectionPendingTask({
          subscriptionId,
          userId,
          orderId: input.order_id || null,
          notes: noteParts.join(' '),
        });
      } else {
        if (manualMonthlyOnly) {
          await upgradeSelectionService.markSelectionResolved({
            subscriptionId,
          });
        }
        if (subscription.status === 'pending') {
          const noteParts = [
            `Provision credentials for ${input.service_type} ${input.service_plan}.`,
            `Subscription ${subscriptionId}`,
          ];
          if (input.order_id) {
            noteParts.push(`Order ${input.order_id}`);
          }
          await this.createCredentialProvisionTask({
            subscriptionId,
            userId,
            orderId: input.order_id || null,
            notes: noteParts.join(' '),
          });
        }
      }

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

  async createCredentialProvisionTask(params: {
    subscriptionId: string;
    userId: string;
    orderId?: string | null;
    notes?: string;
  }): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      const dueDate = new Date(
        Date.now() + CREDENTIAL_PROVISION_TASK_DUE_HOURS * 60 * 60 * 1000
      );
      const notes =
        params.notes ||
        `Provision credentials for subscription ${params.subscriptionId}.`;

      const result = await pool.query(
        `INSERT INTO admin_tasks
          (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
         SELECT $1, $2, $3, $4::varchar(50), $5, $6, $7, $8::varchar(50), $9
         WHERE NOT EXISTS (
           SELECT 1
           FROM admin_tasks
           WHERE subscription_id = $1
             AND task_type = $4::varchar(50)
             AND task_category = $8::varchar(50)
             AND completed_at IS NULL
         )
         RETURNING id`,
        [
          params.subscriptionId,
          params.userId,
          params.orderId || null,
          CREDENTIAL_PROVISION_TASK_TYPE,
          dueDate,
          CREDENTIAL_PROVISION_TASK_PRIORITY,
          notes,
          CREDENTIAL_PROVISION_TASK_CATEGORY,
          dueDate,
        ]
      );

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      Logger.error('Failed to create credential provision task:', error);
      return false;
    }
  }

  async createSelectionPendingTask(params: {
    subscriptionId: string;
    userId: string;
    orderId?: string | null;
    notes?: string;
  }): Promise<boolean> {
    try {
      const pool = getDatabasePool();
      const dueDate = new Date(
        Date.now() + SELECTION_PENDING_TASK_DUE_HOURS * 60 * 60 * 1000
      );
      const notes =
        params.notes ||
        `Selection pending for subscription ${params.subscriptionId}.`;

      const result = await pool.query(
        `INSERT INTO admin_tasks
          (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
         SELECT $1, $2, $3, $4::varchar(50), $5, $6, $7, $8::varchar(50), $9
         WHERE NOT EXISTS (
           SELECT 1
           FROM admin_tasks
           WHERE subscription_id = $1
             AND task_type = $4::varchar(50)
             AND task_category = $8::varchar(50)
             AND completed_at IS NULL
         )
         RETURNING id`,
        [
          params.subscriptionId,
          params.userId,
          params.orderId || null,
          SELECTION_PENDING_TASK_TYPE,
          dueDate,
          SELECTION_PENDING_TASK_PRIORITY,
          notes,
          SELECTION_PENDING_TASK_CATEGORY,
          dueDate,
        ]
      );

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      Logger.error('Failed to create selection pending task:', error);
      return false;
    }
  }

  async completeSelectionPendingTasks(params: {
    subscriptionId: string;
    adminId?: string | null;
    note?: string;
  }): Promise<void> {
    try {
      const pool = getDatabasePool();
      const note =
        params.note || `[${new Date().toISOString()}] Selection completed`;

      await pool.query(
        `UPDATE admin_tasks
         SET completed_at = COALESCE(completed_at, NOW()),
             assigned_admin = COALESCE(assigned_admin, $2),
             notes = CASE
               WHEN notes IS NULL OR notes = '' THEN $3
               ELSE notes || '\n' || $3
             END
         WHERE subscription_id = $1
           AND task_category = $4
           AND completed_at IS NULL`,
        [
          params.subscriptionId,
          params.adminId || null,
          note,
          SELECTION_PENDING_TASK_CATEGORY,
        ]
      );
    } catch (error) {
      Logger.warn('Failed to complete selection pending tasks', {
        subscriptionId: params.subscriptionId,
        error,
      });
    }
  }

  async getSubscriptionById(
    subscriptionId: string,
    userId?: string
  ): Promise<SubscriptionResult> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}sub:${subscriptionId}`;
      let cached: string | null = null;
      try {
        cached = await redisClient.getClient().get(cacheKey);
      } catch (error) {
        Logger.warn('Subscription cache read failed, skipping cache:', error);
      }

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
        ? `
          SELECT s.*, p.name AS product_name, pv.name AS variant_name
          FROM subscriptions s
          LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
          LEFT JOIN products p ON p.id = pv.product_id
          WHERE s.id = $1 AND s.user_id = $2
        `
        : `
          SELECT s.*, p.name AS product_name, pv.name AS variant_name
          FROM subscriptions s
          LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
          LEFT JOIN products p ON p.id = pv.product_id
          WHERE s.id = $1
        `;

      const params = userId ? [subscriptionId, userId] : [subscriptionId];
      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Cache the result
      try {
        await redisClient
          .getClient()
          .setex(
            cacheKey,
            this.SUBSCRIPTION_CACHE_TTL,
            JSON.stringify(subscription)
          );
      } catch (error) {
        Logger.warn('Subscription cache write failed, continuing:', error);
      }

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

      if (!include_expired && status !== 'expired') {
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

  async getUserSubscriptionsWithCount(
    userId: string,
    query?: SubscriptionQuery
  ): Promise<
    ServiceResult<{
      subscriptions: Subscription[];
      total: number;
    }>
  > {
    try {
      const {
        service_type,
        status,
        limit = 20,
        offset = 0,
        include_expired = false,
      } = query || {};

      const filters: string[] = ['s.user_id = $1'];
      const params: any[] = [userId];
      let paramCount = 1;

      if (service_type) {
        filters.push(`s.service_type = $${++paramCount}`);
        params.push(service_type);
      }

      if (status) {
        filters.push(`s.status = $${++paramCount}`);
        params.push(status);
      }

      if (!include_expired && status !== 'expired') {
        filters.push(`s.status != 'expired'`);
      }

      const whereClause = `WHERE ${filters.join(' AND ')}`;
      const pool = getDatabasePool();

      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM subscriptions s ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.count || '0', 10);

      const listParams = [...params, limit, offset];
      const listSql = `
        SELECT s.*, p.name as product_name, pv.name as variant_name
        FROM subscriptions s
        LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
      const result = await pool.query(listSql, listParams);
      const subscriptions = result.rows.map(row => ({
        ...this.mapRowToSubscription(row),
        product_name: row.product_name ?? null,
        variant_name: row.variant_name ?? null,
      }));

      return createSuccessResult({ subscriptions, total });
    } catch (error) {
      Logger.error('Error getting user subscriptions with count:', error);
      return createErrorResult('Failed to retrieve subscriptions');
    }
  }

  async listSubscriptionsForAdmin(filters?: {
    status?: SubscriptionStatus;
    service_type?: ServiceType;
    auto_renew?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<SubscriptionWithUserInfo[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = `
        SELECT s.*, u.email as user_email,
               CONCAT_WS(' ', u.first_name, u.last_name) as user_full_name,
               (s.credentials_encrypted IS NOT NULL) AS has_credentials
        FROM subscriptions s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE 1=1
      `;

      if (filters?.status) {
        sql += ` AND s.status = $${++paramCount}`;
        params.push(filters.status);
      }

      if (filters?.service_type) {
        sql += ` AND s.service_type = $${++paramCount}`;
        params.push(filters.service_type);
      }

      if (filters?.auto_renew !== undefined) {
        sql += ` AND s.auto_renew = $${++paramCount}`;
        params.push(filters.auto_renew);
      }

      if (filters?.search) {
        sql += ` AND s.id::text ILIKE $${++paramCount}`;
        params.push(`%${filters.search}%`);
      }

      sql += ' ORDER BY s.created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }

      if (filters?.offset) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(row => ({
        ...this.mapRowToSubscription(row),
        user_email: row.user_email,
        user_full_name: row.user_full_name || undefined,
        has_credentials: row.has_credentials ?? false,
      }));
    } catch (error) {
      Logger.error('Error listing subscriptions (admin):', error);
      return [];
    }
  }

  async updateSubscriptionForAdmin(
    subscriptionId: string,
    updates: UpdateSubscriptionInput
  ): Promise<SubscriptionResult> {
    try {
      Logger.info('Admin updating subscription', { subscriptionId, updates });

      const pool = getDatabasePool();
      const currentResult = await pool.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );

      if (currentResult.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const currentSub = this.mapRowToSubscription(currentResult.rows[0]);

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

      if (updates.service_plan) {
        if (
          !(await this.validateServicePlan(
            currentSub.service_type,
            updates.service_plan
          ))
        ) {
          return createErrorResult(
            'Invalid service plan for this service type'
          );
        }
      }

      if (updates.metadata) {
        const planCode = updates.service_plan || currentSub.service_plan;
        const listing = await this.resolveCatalogListing(
          currentSub.service_type,
          planCode
        );
        if (!listing) {
          return createErrorResult(
            'Invalid service plan for this service type'
          );
        }

        const metadataValidation = this.validateMetadataRules(
          listing.product,
          updates.metadata
        );
        if (!metadataValidation.valid) {
          return createErrorResult(
            metadataValidation.reason ||
              'Invalid metadata for this service type'
          );
        }
      }

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

      if (updates.term_start_at !== undefined) {
        updateFields.push(`term_start_at = $${++paramCount}`);
        updateValues.push(updates.term_start_at);
      }

      if (updates.renewal_date) {
        updateFields.push(`renewal_date = $${++paramCount}`);
        updateValues.push(updates.renewal_date);
      }

      if (updates.credentials_encrypted !== undefined) {
        updateFields.push(`credentials_encrypted = $${++paramCount}`);
        updateValues.push(
          updates.credentials_encrypted === null
            ? null
            : credentialsEncryptionService.prepareForStorage(
                updates.credentials_encrypted
              )
        );
      }

      if (updates.auto_renew !== undefined) {
        updateFields.push(`auto_renew = $${++paramCount}`);
        updateValues.push(updates.auto_renew);
      }

      if (updates.next_billing_at !== undefined) {
        updateFields.push(`next_billing_at = $${++paramCount}`);
        updateValues.push(updates.next_billing_at);
      }

      if (updates.renewal_method !== undefined) {
        updateFields.push(`renewal_method = $${++paramCount}`);
        updateValues.push(updates.renewal_method);
      }

      if (updates.billing_payment_method_id !== undefined) {
        updateFields.push(`billing_payment_method_id = $${++paramCount}`);
        updateValues.push(updates.billing_payment_method_id);
      }

      if (updates.auto_renew_enabled_at !== undefined) {
        updateFields.push(`auto_renew_enabled_at = $${++paramCount}`);
        updateValues.push(updates.auto_renew_enabled_at);
      }

      if (updates.auto_renew_disabled_at !== undefined) {
        updateFields.push(`auto_renew_disabled_at = $${++paramCount}`);
        updateValues.push(updates.auto_renew_disabled_at);
      }

      if (updates.status_reason !== undefined) {
        updateFields.push(`status_reason = $${++paramCount}`);
        updateValues.push(updates.status_reason);
      }

      if (updates.price_cents !== undefined) {
        updateFields.push(`price_cents = $${++paramCount}`);
        updateValues.push(updates.price_cents);
      }

      if (updates.base_price_cents !== undefined) {
        updateFields.push(`base_price_cents = $${++paramCount}`);
        updateValues.push(updates.base_price_cents);
      }

      if (updates.discount_percent !== undefined) {
        updateFields.push(`discount_percent = $${++paramCount}`);
        updateValues.push(updates.discount_percent);
      }

      if (updates.term_months !== undefined) {
        updateFields.push(`term_months = $${++paramCount}`);
        updateValues.push(updates.term_months);
      }

      if (updates.currency !== undefined) {
        updateFields.push(`currency = $${++paramCount}`);
        updateValues.push(updates.currency);
      }

      if (updates.order_id !== undefined) {
        updateFields.push(`order_id = $${++paramCount}`);
        updateValues.push(updates.order_id);
      }

      if (updates.product_variant_id !== undefined) {
        updateFields.push(`product_variant_id = $${++paramCount}`);
        updateValues.push(updates.product_variant_id);
      }

      if (updates.referral_reward_id !== undefined) {
        updateFields.push(`referral_reward_id = $${++paramCount}`);
        updateValues.push(updates.referral_reward_id);
      }

      if (updates.pre_launch_reward_id !== undefined) {
        updateFields.push(`pre_launch_reward_id = $${++paramCount}`);
        updateValues.push(updates.pre_launch_reward_id);
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

      updateFields.push('updated_at = NOW()');
      updateValues.push(subscriptionId);

      const sql = `
        UPDATE subscriptions
        SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount}
        RETURNING *
      `;

      const result = await pool.query(sql, updateValues);

      if (result.rows.length === 0) {
        return createErrorResult('Failed to update subscription');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      await this.clearSubscriptionCache(subscriptionId);
      await this.clearUserSubscriptionsCache(subscription.user_id);

      Logger.info('Admin subscription update completed', { subscriptionId });

      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error updating subscription (admin):', error);
      return createErrorResult('Failed to update subscription');
    }
  }

  async updateSubscriptionForRenewalWithGuard(params: {
    subscriptionId: string;
    updates: UpdateSubscriptionInput;
    expectedEndDate?: Date | null;
  }): Promise<{
    success: boolean;
    updated: boolean;
    data?: Subscription;
    error?: string;
    reason?: string;
  }> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const currentResult = await client.query(
        'SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE',
        [params.subscriptionId]
      );

      if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          updated: false,
          error: 'Subscription not found',
        };
      }

      const currentSub = this.mapRowToSubscription(currentResult.rows[0]);
      if (currentSub.status !== 'active') {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: true,
          updated: false,
          data: currentSub,
          reason: 'inactive_status',
        };
      }
      const expectedEndDate = params.expectedEndDate ?? null;
      if (expectedEndDate instanceof Date) {
        const expectedMs = expectedEndDate.getTime();
        const currentMs = new Date(currentSub.end_date).getTime();
        if (
          Number.isFinite(expectedMs) &&
          Number.isFinite(currentMs) &&
          currentMs > expectedMs + 60 * 1000
        ) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return {
            success: true,
            updated: false,
            data: currentSub,
            reason: 'already_renewed',
          };
        }
      }

      if (params.updates.end_date || params.updates.renewal_date) {
        const endDate = params.updates.end_date || currentSub.end_date;
        const renewalDate =
          params.updates.renewal_date || currentSub.renewal_date;
        if (
          !this.validateSubscriptionDates(
            currentSub.start_date,
            endDate,
            renewalDate
          )
        ) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return {
            success: false,
            updated: false,
            error: 'Invalid date update',
          };
        }
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCount = 0;

      if (params.updates.end_date) {
        updateFields.push(`end_date = $${++paramCount}`);
        updateValues.push(params.updates.end_date);
      }

      if (params.updates.term_start_at !== undefined) {
        updateFields.push(`term_start_at = $${++paramCount}`);
        updateValues.push(params.updates.term_start_at);
      }

      if (params.updates.renewal_date) {
        updateFields.push(`renewal_date = $${++paramCount}`);
        updateValues.push(params.updates.renewal_date);
      }

      if (params.updates.next_billing_at !== undefined) {
        updateFields.push(`next_billing_at = $${++paramCount}`);
        updateValues.push(params.updates.next_billing_at);
      }

      if (params.updates.status_reason !== undefined) {
        updateFields.push(`status_reason = $${++paramCount}`);
        updateValues.push(params.updates.status_reason);
      }

      if (params.updates.renewal_method !== undefined) {
        updateFields.push(`renewal_method = $${++paramCount}`);
        updateValues.push(params.updates.renewal_method);
      }

      if (params.updates.price_cents !== undefined) {
        updateFields.push(`price_cents = $${++paramCount}`);
        updateValues.push(params.updates.price_cents);
      }

      if (params.updates.base_price_cents !== undefined) {
        updateFields.push(`base_price_cents = $${++paramCount}`);
        updateValues.push(params.updates.base_price_cents);
      }

      if (params.updates.discount_percent !== undefined) {
        updateFields.push(`discount_percent = $${++paramCount}`);
        updateValues.push(params.updates.discount_percent);
      }

      if (params.updates.term_months !== undefined) {
        updateFields.push(`term_months = $${++paramCount}`);
        updateValues.push(params.updates.term_months);
      }

      if (params.updates.currency !== undefined) {
        updateFields.push(`currency = $${++paramCount}`);
        updateValues.push(params.updates.currency);
      }

      if (updateFields.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          updated: false,
          error: 'No valid fields to update',
        };
      }

      updateFields.push('updated_at = NOW()');
      updateValues.push(params.subscriptionId);

      const result = await client.query(
        `
          UPDATE subscriptions
          SET ${updateFields.join(', ')}
          WHERE id = $${++paramCount}
          RETURNING *
        `,
        updateValues
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          success: false,
          updated: false,
          error: 'Failed to update subscription',
        };
      }

      await client.query('COMMIT');
      transactionOpen = false;

      const subscription = this.mapRowToSubscription(result.rows[0]);
      await this.clearSubscriptionCache(params.subscriptionId);
      await this.clearUserSubscriptionsCache(subscription.user_id);

      return { success: true, updated: true, data: subscription };
    } catch (error) {
      Logger.error('Error updating subscription for renewal:', error);
      try {
        if (transactionOpen) {
          await client.query('ROLLBACK');
          transactionOpen = false;
        }
      } catch (rollbackError) {
        Logger.error('Failed to rollback renewal update', rollbackError);
      }
      return {
        success: false,
        updated: false,
        error: 'Failed to update subscription',
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error('Failed to rollback renewal transaction', rollbackError);
        }
      }
      client.release();
    }
  }

  async updateSubscriptionCredentialsForAdmin(
    subscriptionId: string,
    credentials: string | null
  ): Promise<SubscriptionResult> {
    try {
      const pool = getDatabasePool();
      const currentResult = await pool.query(
        'SELECT * FROM subscriptions WHERE id = $1',
        [subscriptionId]
      );

      if (currentResult.rows.length === 0) {
        return createErrorResult('Subscription not found');
      }

      const encryptedValue =
        credentials === null
          ? null
          : credentialsEncryptionService.prepareForStorage(credentials);

      const result = await pool.query(
        `UPDATE subscriptions
         SET credentials_encrypted = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [encryptedValue, subscriptionId]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to update subscription credentials');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      await this.clearSubscriptionCache(subscriptionId);
      await this.clearUserSubscriptionsCache(subscription.user_id);

      return createSuccessResult(subscription);
    } catch (error) {
      Logger.error('Error updating subscription credentials (admin):', error);
      return createErrorResult('Failed to update subscription credentials');
    }
  }

  async updateSubscriptionCredentialsEncryptedValue(params: {
    subscriptionId: string;
    encryptedValue: string | null;
  }): Promise<void> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE subscriptions
         SET credentials_encrypted = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [params.encryptedValue, params.subscriptionId]
      );
      await this.clearSubscriptionCache(params.subscriptionId);
    } catch (error) {
      Logger.warn('Failed to update encrypted credentials value', {
        subscriptionId: params.subscriptionId,
        error,
      });
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
          !(await this.validateServicePlan(
            currentSub.service_type,
            updates.service_plan
          ))
        ) {
          return createErrorResult(
            'Invalid service plan for this service type'
          );
        }
      }

      // Validate metadata if provided
      if (updates.metadata) {
        const planCode = updates.service_plan || currentSub.service_plan;
        const listing = await this.resolveCatalogListing(
          currentSub.service_type,
          planCode
        );
        if (!listing) {
          return createErrorResult(
            'Invalid service plan for this service type'
          );
        }

        const metadataValidation = this.validateMetadataRules(
          listing.product,
          updates.metadata
        );
        if (!metadataValidation.valid) {
          return createErrorResult(
            metadataValidation.reason ||
              'Invalid metadata for this service type'
          );
        }
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

      if (updates.term_start_at !== undefined) {
        updateFields.push(`term_start_at = $${++paramCount}`);
        updateValues.push(updates.term_start_at);
      }

      if (updates.renewal_date) {
        updateFields.push(`renewal_date = $${++paramCount}`);
        updateValues.push(updates.renewal_date);
      }

      if (updates.credentials_encrypted !== undefined) {
        updateFields.push(`credentials_encrypted = $${++paramCount}`);
        updateValues.push(
          updates.credentials_encrypted === null
            ? null
            : credentialsEncryptionService.prepareForStorage(
                updates.credentials_encrypted
              )
        );
      }

      if (updates.auto_renew !== undefined) {
        updateFields.push(`auto_renew = $${++paramCount}`);
        updateValues.push(updates.auto_renew);
      }

      if (updates.next_billing_at !== undefined) {
        updateFields.push(`next_billing_at = $${++paramCount}`);
        updateValues.push(updates.next_billing_at);
      }

      if (updates.renewal_method !== undefined) {
        updateFields.push(`renewal_method = $${++paramCount}`);
        updateValues.push(updates.renewal_method);
      }

      if (updates.billing_payment_method_id !== undefined) {
        updateFields.push(`billing_payment_method_id = $${++paramCount}`);
        updateValues.push(updates.billing_payment_method_id);
      }

      if (updates.auto_renew_enabled_at !== undefined) {
        updateFields.push(`auto_renew_enabled_at = $${++paramCount}`);
        updateValues.push(updates.auto_renew_enabled_at);
      }

      if (updates.auto_renew_disabled_at !== undefined) {
        updateFields.push(`auto_renew_disabled_at = $${++paramCount}`);
        updateValues.push(updates.auto_renew_disabled_at);
      }

      if (updates.status_reason !== undefined) {
        updateFields.push(`status_reason = $${++paramCount}`);
        updateValues.push(updates.status_reason);
      }

      if (updates.price_cents !== undefined) {
        updateFields.push(`price_cents = $${++paramCount}`);
        updateValues.push(updates.price_cents);
      }

      if (updates.currency !== undefined) {
        updateFields.push(`currency = $${++paramCount}`);
        updateValues.push(updates.currency);
      }

      if (updates.order_id !== undefined) {
        updateFields.push(`order_id = $${++paramCount}`);
        updateValues.push(updates.order_id);
      }

      if (updates.product_variant_id !== undefined) {
        updateFields.push(`product_variant_id = $${++paramCount}`);
        updateValues.push(updates.product_variant_id);
      }

      if (updates.referral_reward_id !== undefined) {
        updateFields.push(`referral_reward_id = $${++paramCount}`);
        updateValues.push(updates.referral_reward_id);
      }

      if (updates.pre_launch_reward_id !== undefined) {
        updateFields.push(`pre_launch_reward_id = $${++paramCount}`);
        updateValues.push(updates.pre_launch_reward_id);
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
        RETURNING *
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
    updatedBy: string,
    dateOverrides?: {
      start_date?: Date;
      term_start_at?: Date | null;
      end_date?: Date;
      renewal_date?: Date;
      next_billing_at?: Date | null;
      term_months?: number;
    }
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

      if (dateOverrides) {
        const startDate = dateOverrides.start_date || currentSub.start_date;
        const endDate = dateOverrides.end_date || currentSub.end_date;
        const renewalDate =
          dateOverrides.renewal_date || currentSub.renewal_date;

        if (!this.validateSubscriptionDates(startDate, endDate, renewalDate)) {
          return createErrorResult('Invalid date update');
        }
      }

      // Update status
      const updateFields: string[] = ['status = $1', 'status_reason = $2'];
      const updateValues: any[] = [newStatus, reason];
      let paramCount = 2;

      if (newStatus === 'expired') {
        updateFields.push(`auto_renew = $${++paramCount}`);
        updateValues.push(false);
        updateFields.push(`next_billing_at = $${++paramCount}`);
        updateValues.push(null);
        if (currentSub.auto_renew) {
          updateFields.push(`auto_renew_disabled_at = $${++paramCount}`);
          updateValues.push(new Date());
        }
      }

      if (dateOverrides?.start_date) {
        updateFields.push(`start_date = $${++paramCount}`);
        updateValues.push(dateOverrides.start_date);
      }
      if (dateOverrides?.term_start_at !== undefined) {
        updateFields.push(`term_start_at = $${++paramCount}`);
        updateValues.push(dateOverrides.term_start_at);
      }
      if (dateOverrides?.end_date) {
        updateFields.push(`end_date = $${++paramCount}`);
        updateValues.push(dateOverrides.end_date);
      }
      if (dateOverrides?.renewal_date) {
        updateFields.push(`renewal_date = $${++paramCount}`);
        updateValues.push(dateOverrides.renewal_date);
      }
      if (
        dateOverrides?.next_billing_at !== undefined &&
        newStatus !== 'expired'
      ) {
        updateFields.push(`next_billing_at = $${++paramCount}`);
        updateValues.push(dateOverrides.next_billing_at);
      }
      if (dateOverrides?.term_months !== undefined) {
        updateFields.push(`term_months = $${++paramCount}`);
        updateValues.push(dateOverrides.term_months);
      }

      updateValues.push(subscriptionId);

      const result = await pool.query(
        `UPDATE subscriptions
         SET ${updateFields.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to update subscription status');
      }

      const subscription = this.mapRowToSubscription(result.rows[0]);

      // Clear caches
      await this.clearSubscriptionCache(subscriptionId);
      await this.clearUserSubscriptionsCache(subscription.user_id);
      await this.clearStatsCache();

      if (currentSub.status !== newStatus && newStatus === 'active') {
        let productName: string | null = null;
        let variantName: string | null = null;
        if (subscription.product_variant_id) {
          const variantResult = await pool.query(
            `
            SELECT pv.name AS variant_name, p.name AS product_name
            FROM product_variants pv
            LEFT JOIN products p ON p.id = pv.product_id
            WHERE pv.id = $1
            `,
            [subscription.product_variant_id]
          );
          productName = variantResult.rows[0]?.product_name ?? null;
          variantName = variantResult.rows[0]?.variant_name ?? null;
        }

        const subscriptionLabel = formatSubscriptionDisplayName({
          productName,
          variantName,
          serviceType: subscription.service_type,
          servicePlan: subscription.service_plan,
          termMonths: subscription.term_months ?? null,
        });
        const subscriptionShortCode = subscription.id.slice(0, 8);
        const updatedAtRaw = (result.rows[0] as { updated_at?: Date | string })
          .updated_at;
        const updatedAt = updatedAtRaw
          ? new Date(updatedAtRaw).toISOString()
          : new Date().toISOString();

        try {
          await notificationService.createNotification({
            userId: subscription.user_id,
            type: 'subscription_activated',
            title: 'Subscription activated',
            message: `Your ${subscriptionLabel} subscription is now active - ${subscriptionShortCode}.`,
            metadata: {
              subscription_id: subscription.id,
              link: '/dashboard/subscriptions',
              status: newStatus,
            },
            orderId: subscription.order_id ?? null,
            subscriptionId: subscription.id,
            dedupeKey: `subscription_activated:${subscription.id}:${updatedAt}`,
          });
        } catch (error) {
          Logger.warn('Failed to create subscription activation notification', {
            subscriptionId,
            error,
          });
        }
      }

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

  async activateSubscriptionsForOrder(
    orderId: string,
    updatedBy: string,
    options?: { requireCredentials?: boolean; reason?: string }
  ): Promise<{ updated: number; skipped: number }> {
    const requireCredentials = options?.requireCredentials ?? true;
    const reason = options?.reason || 'order_delivered';
    try {
      const pool = getDatabasePool();
      const orderResult = await pool.query(
        'SELECT metadata, status, updated_at, term_months FROM orders WHERE id = $1',
        [orderId]
      );
      const orderRow = orderResult.rows[0] || null;
      const orderMetadata = parseJsonValue<Record<string, any>>(
        orderRow?.metadata,
        {}
      );
      const orderUpdatedAt = orderRow?.updated_at
        ? new Date(orderRow.updated_at)
        : null;
      const deliveredAt =
        orderRow?.status === 'delivered' &&
        orderUpdatedAt &&
        !Number.isNaN(orderUpdatedAt.getTime())
          ? orderUpdatedAt
          : new Date();

      const parseDurationMonths = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;
        return Math.floor(parsed);
      };

      const orderDurationMonths =
        parseDurationMonths(orderRow?.term_months) ??
        parseDurationMonths(orderMetadata?.['duration_months']) ??
        parseDurationMonths(orderMetadata?.['term_months']) ??
        parseDurationMonths(orderMetadata?.['durationMonths']) ??
        parseDurationMonths(orderMetadata?.['termMonths']);

      const itemsResult = await pool.query(
        'SELECT product_variant_id, metadata, term_months FROM order_items WHERE order_id = $1 ORDER BY created_at ASC',
        [orderId]
      );
      let itemDurationMonths: number | null = null;
      const durationByVariant = new Map<string, number>();
      for (const item of itemsResult.rows) {
        const itemMetadata = parseJsonValue<Record<string, any>>(
          item.metadata,
          {}
        );
        const candidate =
          parseDurationMonths(item.term_months) ??
          parseDurationMonths(itemMetadata?.['duration_months']) ??
          parseDurationMonths(itemMetadata?.['term_months']) ??
          parseDurationMonths(itemMetadata?.['durationMonths']) ??
          parseDurationMonths(itemMetadata?.['termMonths']);
        if (!candidate) {
          continue;
        }
        if (!itemDurationMonths) {
          itemDurationMonths = candidate;
        }
        if (item.product_variant_id) {
          durationByVariant.set(item.product_variant_id, candidate);
        }
      }

      const result = await pool.query(
        `SELECT id, status, credentials_encrypted, auto_renew, start_date, end_date, product_variant_id, term_months
         FROM subscriptions
         WHERE order_id = $1`,
        [orderId]
      );

      let updated = 0;
      let skipped = 0;

      for (const row of result.rows) {
        if (row.status !== 'pending') {
          skipped += 1;
          continue;
        }
        if (requireCredentials && !row.credentials_encrypted) {
          skipped += 1;
          continue;
        }

        const variantDuration =
          row.product_variant_id &&
          durationByVariant.has(row.product_variant_id)
            ? durationByVariant.get(row.product_variant_id)
            : null;
        let durationMonths =
          parseDurationMonths(row.term_months) ??
          variantDuration ??
          orderDurationMonths ??
          itemDurationMonths;
        if (!durationMonths || durationMonths <= 0) {
          Logger.warn('Invalid subscription duration, defaulting to 1 month', {
            subscriptionId: row.id,
            orderId,
            durationMonths,
          });
          durationMonths = 1;
        }

        const termStartAt = row.term_start_at
          ? new Date(row.term_start_at)
          : new Date(row.start_date || deliveredAt);
        if (Number.isNaN(termStartAt.getTime())) {
          termStartAt.setTime(deliveredAt.getTime());
        }

        const endDate = new Date(termStartAt);
        endDate.setMonth(endDate.getMonth() + durationMonths);
        const renewalDate = new Date(endDate);
        renewalDate.setDate(renewalDate.getDate() - 7);
        const nextBillingAt = row.auto_renew ? renewalDate : null;

        const updateResult = await this.updateSubscriptionStatus(
          row.id,
          'active',
          reason,
          updatedBy,
          {
            term_start_at: termStartAt,
            end_date: endDate,
            renewal_date: renewalDate,
            next_billing_at: nextBillingAt,
            term_months: durationMonths,
          }
        );
        if (updateResult.success) {
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      return { updated, skipped };
    } catch (error) {
      Logger.error('Failed to activate subscriptions for order', {
        orderId,
        error,
      });
      return { updated: 0, skipped: 0 };
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
         SET status = 'expired',
             status_reason = 'expired',
             auto_renew = false,
             next_billing_at = NULL,
             auto_renew_disabled_at = CASE
               WHEN auto_renew = true THEN NOW()
               ELSE auto_renew_disabled_at
             END
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

  private async resolveCatalogListing(
    serviceType: ServiceType,
    servicePlan: ServicePlan
  ): Promise<{ product: Product; variant: ProductVariant } | null> {
    return catalogService.findProductVariantByServicePlan(
      serviceType,
      servicePlan
    );
  }

  private async resolveCatalogListingByVariant(
    variantId: string
  ): Promise<{ product: Product; variant: ProductVariant } | null> {
    if (!variantId) {
      return null;
    }
    return catalogService.getVariantWithProduct(variantId);
  }

  private async validateServicePlan(
    serviceType: ServiceType,
    servicePlan: ServicePlan
  ): Promise<boolean> {
    const listing = await this.resolveCatalogListing(serviceType, servicePlan);
    return Boolean(listing);
  }

  private validateMetadataRules(
    product: Product,
    metadata?: SubscriptionMetadata
  ): { valid: boolean; reason?: string } {
    if (metadata === undefined || metadata === null) {
      return { valid: true };
    }

    const normalizedMetadata = normalizeMetadataValue(metadata);
    if (normalizedMetadata === null) {
      return {
        valid: false,
        reason: 'Subscription metadata could not be parsed',
      };
    }

    const metadataSchema = getMetadataSchema(product.metadata);
    if (metadataSchema) {
      const validator = resolveSchemaValidator(metadataSchema);
      if (!validator) {
        return {
          valid: false,
          reason: 'Subscription metadata rules are invalid',
        };
      }

      const isValid = validator(normalizedMetadata);
      if (!isValid) {
        return {
          valid: false,
          reason: 'Subscription metadata does not match product rules',
        };
      }
    }

    if (shouldUseHandler(product.metadata)) {
      const handler = serviceHandlerRegistry.getHandler(
        product.service_type || ''
      );

      if (!handler) {
        return {
          valid: false,
          reason: `No handler registered for ${product.service_type}`,
        };
      }

      if (
        !handler.validateMetadata(normalizedMetadata as SubscriptionMetadata)
      ) {
        return {
          valid: false,
          reason: 'Subscription metadata does not match handler rules',
        };
      }
    }

    return { valid: true };
  }

  // Business Logic

  async canPurchaseSubscription(
    userId: string,
    variantId: string,
    metadata?: SubscriptionMetadata
  ): Promise<SubscriptionPurchaseValidation> {
    try {
      if (!variantId) {
        return {
          canPurchase: false,
          reason: 'Variant is required to purchase this subscription',
        };
      }

      const listing = await this.resolveCatalogListingByVariant(variantId);
      if (!listing) {
        return {
          canPurchase: false,
          reason: 'Subscription plan is not available',
        };
      }

      const { product, variant } = listing;
      const serviceType = product.service_type || 'subscription';
      const planCode =
        variant.service_plan || variant.variant_code || variant.id;

      if (product.status !== 'active') {
        return {
          canPurchase: false,
          reason: `${serviceType} is not currently available`,
        };
      }

      if (!variant.is_active) {
        return {
          canPurchase: false,
          reason: `Plan ${planCode} is not currently available`,
        };
      }

      const handlerRequired = shouldUseHandler(product.metadata);
      const handler = handlerRequired
        ? serviceHandlerRegistry.getHandler(product.service_type || serviceType)
        : null;

      if (handlerRequired && !handler) {
        return {
          canPurchase: false,
          reason: `No handler registered for ${product.service_type || serviceType}`,
        };
      }

      const metadataValidation = this.validateMetadataRules(product, metadata);
      if (!metadataValidation.valid) {
        const reason =
          metadataValidation.reason ||
          'Subscription metadata does not match product rules';
        return {
          canPurchase: false,
          reason,
        };
      }

      if (handler) {
        const handlerAllows = await handler.validatePurchase(userId, planCode);
        if (!handlerAllows) {
          return {
            canPurchase: false,
            reason: `Purchase not allowed for ${serviceType} ${planCode}`,
          };
        }
      }

      const maxSubscriptions = product.max_subscriptions;
      if (maxSubscriptions !== null && maxSubscriptions !== undefined) {
        if (maxSubscriptions <= 0) {
          return {
            canPurchase: false,
            reason: `No ${serviceType} subscriptions allowed`,
          };
        }

        const activeCount = await this.getActiveSubscriptionsCountByProduct(
          userId,
          product.id,
          product.service_type || serviceType
        );

        if (activeCount >= maxSubscriptions) {
          return {
            canPurchase: false,
            reason: `Maximum ${maxSubscriptions} ${serviceType} subscription(s) allowed`,
          };
        }
      }

      return { canPurchase: true };
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

  async getActiveSubscriptionsCountByProduct(
    userId: string,
    productId: string,
    serviceType?: ServiceType
  ): Promise<number> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}count:${userId}:product:${productId}`;
      const cached = await redisClient.getClient().get(cacheKey);

      if (cached) {
        return parseInt(cached, 10);
      }

      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT COUNT(*) as count
         FROM subscriptions s
         JOIN product_variants pv ON pv.id = s.product_variant_id
         WHERE s.user_id = $1
           AND s.status = 'active'
           AND pv.product_id = $2`,
        [userId, productId]
      );

      let count = parseInt(result.rows[0]?.count || '0', 10);

      if (serviceType) {
        const normalizedServiceType = serviceType.trim().toLowerCase();
        if (normalizedServiceType) {
          const legacyResult = await pool.query(
            `SELECT COUNT(*) as count
             FROM subscriptions
             WHERE user_id = $1
               AND status = 'active'
               AND product_variant_id IS NULL
               AND LOWER(service_type) = $2`,
            [userId, normalizedServiceType]
          );
          count += parseInt(legacyResult.rows[0]?.count || '0', 10);
        }
      }

      await redisClient.getClient().setex(cacheKey, 600, count.toString());

      return count;
    } catch (error) {
      Logger.error(
        'Error getting active subscriptions count by product:',
        error
      );
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
    let metadata: any | undefined;
    if (row.metadata !== null && row.metadata !== undefined) {
      if (typeof row.metadata === 'string') {
        try {
          metadata = JSON.parse(row.metadata);
        } catch {
          // leave as raw string if parsing fails
          metadata = row.metadata;
        }
      } else {
        metadata = row.metadata;
      }
    }

    const autoRenewFromMetadata =
      metadata?.auto_renew === true ||
      metadata?.auto_renew === 'true' ||
      metadata?.auto_renew === 1 ||
      metadata?.auto_renew === '1';

    return {
      id: row.id,
      user_id: row.user_id,
      service_type: row.service_type,
      service_plan: row.service_plan,
      start_date: row.start_date,
      term_start_at: row.term_start_at ?? null,
      end_date: row.end_date,
      renewal_date: row.renewal_date,
      credentials_encrypted: row.credentials_encrypted,
      status: row.status,
      metadata,
      order_id: row.order_id ?? null,
      product_variant_id: row.product_variant_id ?? null,
      product_name: row.product_name ?? null,
      variant_name: row.variant_name ?? null,
      price_cents:
        row.price_cents !== null && row.price_cents !== undefined
          ? parseInt(row.price_cents, 10)
          : null,
      base_price_cents:
        row.base_price_cents !== null && row.base_price_cents !== undefined
          ? parseInt(row.base_price_cents, 10)
          : null,
      discount_percent:
        row.discount_percent !== null && row.discount_percent !== undefined
          ? Number(row.discount_percent)
          : null,
      term_months:
        row.term_months !== null && row.term_months !== undefined
          ? parseInt(row.term_months, 10)
          : null,
      currency: row.currency ?? null,
      auto_renew: row.auto_renew ?? autoRenewFromMetadata ?? false,
      next_billing_at: row.next_billing_at ?? null,
      renewal_method: row.renewal_method ?? null,
      billing_payment_method_id: row.billing_payment_method_id ?? null,
      auto_renew_enabled_at: row.auto_renew_enabled_at ?? null,
      auto_renew_disabled_at: row.auto_renew_disabled_at ?? null,
      status_reason: row.status_reason ?? null,
      referral_reward_id: row.referral_reward_id ?? null,
      pre_launch_reward_id: row.pre_launch_reward_id ?? null,
      created_at: row.created_at,
    };
  }

  // Cache Management

  private async clearSubscriptionCache(subscriptionId: string): Promise<void> {
    if (!redisClient.isConnected()) {
      return;
    }
    try {
      const cacheKey = `${this.CACHE_PREFIX}sub:${subscriptionId}`;
      await redisClient.getClient().del(cacheKey);
    } catch (error) {
      Logger.warn('Failed to clear subscription cache', {
        subscriptionId,
        error,
      });
    }
  }

  private async clearUserSubscriptionsCache(userId: string): Promise<void> {
    if (!redisClient.isConnected()) {
      return;
    }
    // Clear all user subscription caches (with different query patterns)
    const pattern = `${this.CACHE_PREFIX}user:${userId}:*`;
    try {
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
    } catch (error) {
      Logger.warn('Failed to clear user subscriptions cache', {
        userId,
        error,
      });
    }
  }

  private async clearStatsCache(): Promise<void> {
    if (!redisClient.isConnected()) {
      return;
    }
    try {
      const pattern = `${this.CACHE_PREFIX}stats:*`;
      const keys = await redisClient.getClient().keys(pattern);
      if (keys.length > 0) {
        await redisClient.getClient().del(...keys);
      }
    } catch (error) {
      Logger.warn('Failed to clear subscription stats cache', { error });
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
