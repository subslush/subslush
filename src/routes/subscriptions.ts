import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomInt } from 'crypto';
import { subscriptionService } from '../services/subscriptionService';
import { serviceHandlerRegistry } from '../services/handlers';
import { creditService } from '../services/creditService';
import { orderService } from '../services/orderService';
import { catalogService } from '../services/catalogService';
import { paymentService } from '../services/paymentService';
import { couponService, normalizeCouponCode } from '../services/couponService';
import {
  buildTikTokProductProperties,
  buildTikTokRequestContext,
  tiktokEventsService,
} from '../services/tiktokEventsService';
import { getDatabasePool } from '../config/database';
import { upgradeSelectionService } from '../services/upgradeSelectionService';
import { orderItemUpgradeSelectionService } from '../services/orderItemUpgradeSelectionService';
import { authPreHandler } from '../middleware/authMiddleware';
import {
  ErrorResponses,
  SuccessResponses,
  sendError,
  HttpStatus,
} from '../utils/response';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { Logger } from '../utils/logger';
import { validateSubscriptionId } from '../schemas/subscription';
import { validateUpgradeSelectionSubmission } from '../schemas/upgradeSelection';
import {
  ServiceType,
  SubscriptionMetadata,
  CreateSubscriptionInput,
  ServicePlanDetails,
} from '../types/subscription';
import type {
  CatalogListing,
  PriceHistory,
  ProductCategoryAssignment,
  ProductVariantTerm,
} from '../types/catalog';
import { orderEntitlementService } from '../services/orderEntitlementService';
import { logCredentialRevealAttempt } from '../services/auditLogService';
import {
  formatSubscriptionDisplayName,
  formatSubscriptionShortId,
  getRenewalState,
} from '../utils/subscriptionHelpers';
import { shouldUseHandler } from '../utils/catalogRules';
import {
  normalizeUpgradeOptions,
  ownAccountCredentialRequirementRequiresPassword,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';
import {
  normalizeCurrencyCode,
  resolveCountryFromHeaders,
  resolvePreferredCurrency,
  type SupportedCurrency,
} from '../utils/currency';
import { resolveCountryCodeFromRequestIp } from '../utils/countryFromIp';
import { notificationService } from '../services/notificationService';
import { resolveVariantPricing } from '../services/variantPricingService';
import {
  computeEffectiveMonthlyCents,
  computeTermPricing,
} from '../utils/termPricing';
import { redisClient } from '../config/redis';

// Rate limiting handlers (fixes plugin encapsulation issues)
const subscriptionQueryRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_query:${userId}`;
  },
});

const subscriptionValidationRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_validation:${userId}`;
  },
});

const subscriptionPurchaseRateLimit = createRateLimitHandler({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_purchase:${userId}`;
  },
});

const subscriptionOperationRateLimit = createRateLimitHandler({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `sub_operation:${userId}`;
  },
});

const credentialRevealRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `credential_reveal:${userId}`;
  },
});

const AUTO_RENEW_DEPRECATED_ON = '2026-03-11';
const MANUAL_RENEWAL_DEPRECATED_ON = '2026-03-12';
const CREDENTIAL_REVEAL_MOVED_ON = '2026-03-12';

function sendAutoRenewDeprecated(reply: FastifyReply): FastifyReply {
  return sendError(
    reply,
    HttpStatus.GONE,
    'Gone',
    'Auto-renew has been deprecated and disabled as of March 11, 2026. Place a new order when the current service period ends.',
    'AUTO_RENEW_DEPRECATED',
    {
      deprecated_on: AUTO_RENEW_DEPRECATED_ON,
      replacement: 'manual_purchase_new_order',
    }
  );
}

function sendManualRenewalDeprecated(reply: FastifyReply): FastifyReply {
  return sendError(
    reply,
    HttpStatus.GONE,
    'Gone',
    'Manual renewal has been deprecated. Place a new order from the catalog when you want to continue service.',
    'MANUAL_RENEWAL_DEPRECATED',
    {
      deprecated_on: MANUAL_RENEWAL_DEPRECATED_ON,
      replacement: 'manual_purchase_new_order',
    }
  );
}

function sendCredentialRevealMoved(reply: FastifyReply): FastifyReply {
  return sendError(
    reply,
    HttpStatus.GONE,
    'Gone',
    'Credential reveal is now available from Orders. Open the order and reveal credentials there.',
    'CREDENTIAL_REVEAL_MOVED_TO_ORDERS',
    {
      deprecated_on: CREDENTIAL_REVEAL_MOVED_ON,
      replacement: 'POST /orders/:orderId/credentials/reveal',
    }
  );
}

// Fastify JSON Schema definitions
const FastifySchemas = {
  // Parameter schemas
  subscriptionIdParam: {
    type: 'object',
    properties: {
      subscriptionId: { type: 'string', format: 'uuid' },
    },
    required: ['subscriptionId'],
  } as const,

  // Body schemas
  purchaseSubscriptionInput: {
    type: 'object',
    required: ['variant_id', 'duration_months'],
    properties: {
      variant_id: {
        type: 'string',
        minLength: 1,
      },
      duration_months: {
        type: 'number',
        minimum: 1,
        default: 1,
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
      auto_renew: {
        type: 'boolean',
        default: false,
      },
      coupon_code: {
        type: 'string',
        minLength: 1,
      },
    },
  } as const,

  validatePurchaseInput: {
    type: 'object',
    required: ['variant_id', 'duration_months'],
    properties: {
      variant_id: {
        type: 'string',
        minLength: 1,
      },
      duration_months: {
        type: 'number',
        minimum: 1,
        default: 1,
      },
      coupon_code: {
        type: 'string',
        minLength: 1,
      },
    },
  } as const,

  mySubscriptionsQuery: {
    type: 'object',
    properties: {
      service_type: {
        type: 'string',
        minLength: 1,
      },
      status: {
        type: 'string',
        enum: ['active', 'expired', 'cancelled', 'pending'],
      },
      page: {
        type: 'number',
        minimum: 1,
        default: 1,
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      offset: {
        type: 'number',
        minimum: 0,
        default: 0,
      },
      include_expired: {
        type: 'boolean',
        default: false,
      },
    },
  } as const,

  cancelSubscriptionInput: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
      },
    },
  } as const,

  autoRenewConfirmInput: {
    type: 'object',
    required: ['setup_intent_id'],
    properties: {
      setup_intent_id: { type: 'string', minLength: 10 },
    },
  } as const,
};

// Helper functions
type AvailablePlan = {
  plan: string;
  name: string;
  display_name: string;
  description: string;
  price: number;
  currency: string;
  features: string[];
  badges?: string[];
  service_type: string;
  service_name: string;
  logo_key?: string | null;
  logoKey?: string | null;
  category?: string | null;
  sub_category?: string | null;
  category_keys?: string[] | null;
  product_id: string;
  variant_id: string;
};

type AdminTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const MISSING_PRICE_TASK_CATEGORY = 'catalog_missing_price';

const resolveRequestCurrency = (request: FastifyRequest): SupportedCurrency => {
  const queryCurrency = (request.query as { currency?: string })?.currency;
  const headerCurrency = request.headers['x-currency'];
  const cookieCurrency = request.cookies?.['preferred_currency'];
  const headerCountry = resolveCountryFromHeaders(
    request.headers as Record<string, string | string[] | undefined>
  );

  return resolvePreferredCurrency({
    queryCurrency: queryCurrency ?? null,
    headerCurrency: typeof headerCurrency === 'string' ? headerCurrency : null,
    cookieCurrency: typeof cookieCurrency === 'string' ? cookieCurrency : null,
    headerCountry,
    fallback: 'USD',
  });
};

const normalizeQueryText = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeCategoryKey = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const buildCategoryKeys = (
  assignments: ProductCategoryAssignment[] | undefined,
  fallbackCategory?: string | null
): string[] => {
  const keys = new Set<string>();
  for (const assignment of assignments || []) {
    const key =
      normalizeCategoryKey(assignment.category_key) ||
      normalizeCategoryKey(assignment.category);
    if (key) {
      keys.add(key);
    }
  }
  const fallback = normalizeCategoryKey(fallbackCategory);
  if (fallback) {
    keys.add(fallback);
  }
  return Array.from(keys);
};

const toAssignmentMap = (
  value: unknown
): Map<string, ProductCategoryAssignment[]> => {
  if (!(value instanceof Map)) {
    return new Map<string, ProductCategoryAssignment[]>();
  }

  const normalized = new Map<string, ProductCategoryAssignment[]>();
  for (const [key, entries] of value.entries()) {
    if (typeof key !== 'string') {
      continue;
    }
    if (!Array.isArray(entries)) {
      normalized.set(key, []);
      continue;
    }
    normalized.set(
      key,
      entries.filter(
        (entry): entry is ProductCategoryAssignment =>
          !!entry &&
          typeof entry === 'object' &&
          typeof entry.category_key === 'string' &&
          typeof entry.category === 'string'
      )
    );
  }

  return normalized;
};

const safeListCategoryAssignmentsForProducts = async (
  productIds: string[]
): Promise<Map<string, ProductCategoryAssignment[]>> => {
  if (productIds.length === 0) {
    return new Map<string, ProductCategoryAssignment[]>();
  }

  try {
    const result =
      await catalogService.listCategoryAssignmentsForProducts(productIds);
    return toAssignmentMap(result);
  } catch (error) {
    Logger.error('Failed to list product category assignments:', error);
    return new Map<string, ProductCategoryAssignment[]>();
  }
};

const MISSING_PRICE_TASK_TYPE = 'support';
const MISSING_PRICE_TASK_PRIORITY: AdminTaskPriority = 'high';
const MISSING_PRICE_DUE_HOURS = 24;
const MISSING_PLAN_TASK_CATEGORY = 'catalog_missing_plan_code';
const MISSING_PLAN_TASK_TYPE = 'support';
const MISSING_PLAN_TASK_PRIORITY: AdminTaskPriority = 'high';
const MISSING_PLAN_DUE_HOURS = 24;
const MISSING_TERM_TASK_CATEGORY = 'catalog_missing_term_options';
const MISSING_TERM_TASK_TYPE = 'support';
const MISSING_TERM_TASK_PRIORITY: AdminTaskPriority = 'high';
const MISSING_TERM_DUE_HOURS = 24;
const CATALOG_TERMS_UNAVAILABLE_TASK_CATEGORY = 'catalog_terms_unavailable';
const CATALOG_TERMS_UNAVAILABLE_TASK_TYPE = 'support';
const CATALOG_TERMS_UNAVAILABLE_TASK_PRIORITY: AdminTaskPriority = 'high';
const CATALOG_TERMS_UNAVAILABLE_DUE_HOURS = 2;
const TERM_LOOKUP_RETRY_DELAY_MS = 150;
const USERS_ON_PAGE_MIN = 12;
const USERS_ON_PAGE_MAX = 39;
const USERS_ON_PAGE_WINDOW_MS = 15 * 60 * 1000;
const UNITS_LEFT_MIN = 6;
const UNITS_LEFT_MAX = 18;
const UNITS_LEFT_STEP = 3;
const UNITS_LEFT_STEP_WINDOW_MS = 3 * 60 * 60 * 1000;
const UNITS_LEFT_CYCLE_MS = 24 * 60 * 60 * 1000;
const UNITS_LEFT_REDIS_PREFIX = 'browse:units_left:';

function calculateEndDate(durationMonths: number): Date {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  return endDate;
}

function calculateRenewalDate(durationMonths: number): Date {
  const endDate = calculateEndDate(durationMonths);
  const renewalDate = new Date(endDate);
  renewalDate.setDate(renewalDate.getDate() - 7);
  return renewalDate;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function listVariantTermsWithRetry(
  variantIds: string[],
  onlyActive = true
): Promise<{
  termMap: Map<string, ProductVariantTerm[]>;
  retried: boolean;
}> {
  const termMap = await catalogService.listVariantTermsForVariants(
    variantIds,
    onlyActive
  );
  if (variantIds.length === 0 || termMap.size > 0) {
    return { termMap, retried: false };
  }

  await delay(TERM_LOOKUP_RETRY_DELAY_MS);
  const retryMap = await catalogService.listVariantTermsForVariants(
    variantIds,
    onlyActive
  );
  return { termMap: retryMap, retried: true };
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0
    );
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }
  return [];
}

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function readMetadataInteger(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): number | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  return null;
}

function readMetadataList(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): string[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }
  for (const key of keys) {
    const list = normalizeStringList(metadata[key]);
    if (list.length > 0) {
      return list;
    }
  }
  return [];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed: string, min: number, max: number): number {
  const range = max - min + 1;
  return min + (hashString(seed) % range);
}

function resolveUsersOnPage(productSeed: string, nowMs: number): number {
  const window = Math.floor(nowMs / USERS_ON_PAGE_WINDOW_MS);
  return seededInt(
    `${productSeed}|users|${window}`,
    USERS_ON_PAGE_MIN,
    USERS_ON_PAGE_MAX
  );
}

type UnitsLeftState = {
  initialUnits: number;
  cycleStartedAtMs: number;
};

function serializeUnitsLeftState(state: UnitsLeftState): string {
  return `${state.initialUnits}:${state.cycleStartedAtMs}`;
}

function parseUnitsLeftState(raw: string | null): UnitsLeftState | null {
  if (!raw) {
    return null;
  }

  const [initialRaw, startedRaw] = raw.split(':');
  const initialUnits = Number(initialRaw);
  const cycleStartedAtMs = Number(startedRaw);
  if (
    !Number.isInteger(initialUnits) ||
    initialUnits < UNITS_LEFT_MIN ||
    initialUnits > UNITS_LEFT_MAX ||
    !Number.isFinite(cycleStartedAtMs) ||
    cycleStartedAtMs <= 0
  ) {
    return null;
  }

  return { initialUnits, cycleStartedAtMs };
}

function computeUnitsLeft(state: UnitsLeftState, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - state.cycleStartedAtMs);
  const elapsedSteps = Math.floor(elapsedMs / UNITS_LEFT_STEP_WINDOW_MS);
  const floorUnits = ((state.initialUnits - 1) % UNITS_LEFT_STEP) + 1;
  return Math.max(
    floorUnits,
    state.initialUnits - elapsedSteps * UNITS_LEFT_STEP
  );
}

function computeUnitsLeftDeterministicFallback(
  productSeed: string,
  nowMs: number
): number {
  const cycleWindow = Math.floor(nowMs / UNITS_LEFT_CYCLE_MS);
  const cycleStartedAtMs = cycleWindow * UNITS_LEFT_CYCLE_MS;
  const initialUnits = seededInt(
    `${productSeed}|units|${cycleWindow}`,
    UNITS_LEFT_MIN,
    UNITS_LEFT_MAX
  );
  return computeUnitsLeft({ initialUnits, cycleStartedAtMs }, nowMs);
}

async function resolveUnitsLeft(
  productSeed: string,
  nowMs: number
): Promise<number> {
  if (!redisClient.isConnected()) {
    return computeUnitsLeftDeterministicFallback(productSeed, nowMs);
  }

  try {
    const client = redisClient.getClient();
    const key = `${UNITS_LEFT_REDIS_PREFIX}${productSeed}`;
    const existing = parseUnitsLeftState(await client.get(key));

    if (existing) {
      return computeUnitsLeft(existing, nowMs);
    }

    const nextState: UnitsLeftState = {
      initialUnits: randomInt(UNITS_LEFT_MIN, UNITS_LEFT_MAX + 1),
      cycleStartedAtMs: nowMs,
    };
    const ttlSeconds = Math.ceil(UNITS_LEFT_CYCLE_MS / 1000);
    const setResult = await client.set(
      key,
      serializeUnitsLeftState(nextState),
      'EX',
      ttlSeconds,
      'NX'
    );

    if (setResult === 'OK') {
      return computeUnitsLeft(nextState, nowMs);
    }

    const latest = parseUnitsLeftState(await client.get(key));
    if (latest) {
      return computeUnitsLeft(latest, nowMs);
    }

    return computeUnitsLeft(nextState, nowMs);
  } catch (error) {
    Logger.warn('Failed to resolve units left from Redis; using fallback', {
      productSeed,
      error,
    });
    return computeUnitsLeftDeterministicFallback(productSeed, nowMs);
  }
}

function resolveHandlerPlan(
  serviceType: string,
  planCode: string
): ServicePlanDetails | null {
  const normalizedServiceType = serviceType.toLowerCase();
  const handler = serviceHandlerRegistry.getHandler(
    normalizedServiceType as ServiceType
  );
  if (!handler) {
    return null;
  }

  return (
    handler.getAvailablePlans().find(plan => plan.plan === planCode) || null
  );
}

function buildMissingPriceTaskNotes(params: {
  productId: string;
  variantId: string;
  serviceType: string;
  planCode: string;
}): string {
  return `Missing listing price for product ${params.productId} variant ${params.variantId} (service_type=${params.serviceType}, plan=${params.planCode}).`;
}

function buildMissingPlanTaskNotes(params: {
  productId: string;
  variantId: string;
  serviceType: string;
}): string {
  return `Missing plan code for product ${params.productId} variant ${params.variantId} (service_type=${params.serviceType}).`;
}

function buildMissingTermTaskNotes(params: {
  productId: string;
  variantId: string;
  serviceType: string;
  planCode: string;
}): string {
  return `Missing term options for product ${params.productId} variant ${params.variantId} (service_type=${params.serviceType}, plan=${params.planCode}).`;
}

function buildCatalogTermsUnavailableNotes(params: {
  endpoint: string;
  listings: number;
  variants: number;
  retried: boolean;
}): string {
  return `Catalog term lookup returned no terms for ${params.variants} variants (${params.listings} listings) on ${params.endpoint} (retried=${params.retried}).`;
}

async function ensureMissingPriceTask(params: {
  productId: string;
  variantId: string;
  serviceType: string;
  planCode: string;
}): Promise<boolean> {
  try {
    const pool = getDatabasePool();
    const dueDate = new Date(
      Date.now() + MISSING_PRICE_DUE_HOURS * 60 * 60 * 1000
    );
    const notes = buildMissingPriceTaskNotes(params);

    const result = await pool.query(
      `INSERT INTO admin_tasks
        (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
       SELECT NULL, NULL, NULL, $1::varchar(50), $2, $3, $4, $5::varchar(50), $6
       WHERE NOT EXISTS (
         SELECT 1
         FROM admin_tasks
         WHERE task_category = $5::varchar(50)
           AND notes = $4
           AND completed_at IS NULL
       )
       RETURNING id`,
      [
        MISSING_PRICE_TASK_TYPE,
        dueDate,
        MISSING_PRICE_TASK_PRIORITY,
        notes,
        MISSING_PRICE_TASK_CATEGORY,
        dueDate,
      ]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    Logger.error('Failed to create missing price admin task:', error);
    return false;
  }
}

async function ensureMissingPlanTask(params: {
  productId: string;
  variantId: string;
  serviceType: string;
}): Promise<boolean> {
  try {
    const pool = getDatabasePool();
    const dueDate = new Date(
      Date.now() + MISSING_PLAN_DUE_HOURS * 60 * 60 * 1000
    );
    const notes = buildMissingPlanTaskNotes(params);

    const result = await pool.query(
      `INSERT INTO admin_tasks
        (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
       SELECT NULL, NULL, NULL, $1::varchar(50), $2, $3, $4, $5::varchar(50), $6
       WHERE NOT EXISTS (
         SELECT 1
         FROM admin_tasks
         WHERE task_category = $5::varchar(50)
           AND notes = $4
           AND completed_at IS NULL
       )
       RETURNING id`,
      [
        MISSING_PLAN_TASK_TYPE,
        dueDate,
        MISSING_PLAN_TASK_PRIORITY,
        notes,
        MISSING_PLAN_TASK_CATEGORY,
        dueDate,
      ]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    Logger.error('Failed to create missing plan code admin task:', error);
    return false;
  }
}

async function ensureMissingTermTask(params: {
  productId: string;
  variantId: string;
  serviceType: string;
  planCode: string;
}): Promise<boolean> {
  try {
    const pool = getDatabasePool();
    const dueDate = new Date(
      Date.now() + MISSING_TERM_DUE_HOURS * 60 * 60 * 1000
    );
    const notes = buildMissingTermTaskNotes(params);

    const result = await pool.query(
      `INSERT INTO admin_tasks
        (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
       SELECT NULL, NULL, NULL, $1::varchar(50), $2, $3, $4, $5::varchar(50), $6
       WHERE NOT EXISTS (
         SELECT 1
         FROM admin_tasks
         WHERE task_category = $5::varchar(50)
           AND notes = $4
           AND completed_at IS NULL
       )
       RETURNING id`,
      [
        MISSING_TERM_TASK_TYPE,
        dueDate,
        MISSING_TERM_TASK_PRIORITY,
        notes,
        MISSING_TERM_TASK_CATEGORY,
        dueDate,
      ]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    Logger.error('Failed to create missing term admin task:', error);
    return false;
  }
}

async function ensureCatalogTermsUnavailableTask(params: {
  endpoint: string;
  listings: number;
  variants: number;
  retried: boolean;
}): Promise<boolean> {
  try {
    const pool = getDatabasePool();
    const dueDate = new Date(
      Date.now() + CATALOG_TERMS_UNAVAILABLE_DUE_HOURS * 60 * 60 * 1000
    );
    const notes = buildCatalogTermsUnavailableNotes(params);

    const result = await pool.query(
      `INSERT INTO admin_tasks
        (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
       SELECT NULL, NULL, NULL, $1::varchar(50), $2, $3, $4, $5::varchar(50), $6
       WHERE NOT EXISTS (
         SELECT 1
         FROM admin_tasks
         WHERE task_category = $5::varchar(50)
           AND completed_at IS NULL
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        CATALOG_TERMS_UNAVAILABLE_TASK_TYPE,
        dueDate,
        CATALOG_TERMS_UNAVAILABLE_TASK_PRIORITY,
        notes,
        CATALOG_TERMS_UNAVAILABLE_TASK_CATEGORY,
        dueDate,
      ]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    Logger.error(
      'Failed to create catalog terms unavailable admin task:',
      error
    );
    return false;
  }
}

// Main route handler
export async function subscriptionRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // API info endpoint (no auth required)
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      message: 'Subscription Management API',
      version: '1.0',
      endpoints: [
        'GET /subscriptions/available',
        'GET /subscriptions/products/available',
        'GET /subscriptions/products/:slug',
        'GET /subscriptions/related/:serviceType',
        'POST /subscriptions/validate-purchase',
        'POST /subscriptions/purchase',
        'POST /subscriptions/track/add-to-cart',
        'POST /subscriptions/track/event',
        'GET /subscriptions/my-subscriptions',
        'GET /subscriptions/:subscriptionId',
        'POST /subscriptions/:subscriptionId/credentials/reveal',
        'DELETE /subscriptions/:subscriptionId',
        'GET /subscriptions/health',
      ],
    });
  });

  // Get available subscription plans (no auth required)
  fastify.get(
    '/available',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const preferredCurrency = resolveRequestCurrency(request);
        Logger.info('Fetching available subscription plans', {
          listingsSource: 'db',
          pricingSource: 'db',
          preferredCurrency,
        });

        const serviceQuery = request.query as {
          service_type?: string;
          category?: string;
          sub_category?: string;
          region?: string;
        };
        const serviceTypeFilter = normalizeQueryText(
          serviceQuery.service_type
        )?.toLowerCase();
        const categoryFilter = normalizeQueryText(serviceQuery.category);
        const subCategoryFilter = normalizeQueryText(serviceQuery.sub_category);
        const listingFilters =
          serviceTypeFilter || categoryFilter || subCategoryFilter
            ? {
                ...(serviceTypeFilter
                  ? { service_type: serviceTypeFilter }
                  : {}),
                ...(categoryFilter ? { category: categoryFilter } : {}),
                ...(subCategoryFilter
                  ? { sub_category: subCategoryFilter }
                  : {}),
              }
            : undefined;

        const [listings, fixedProducts] = await Promise.all([
          catalogService.listActiveListings(listingFilters),
          catalogService.listActiveFixedProducts(listingFilters),
        ]);
        const variantIds = listings.map(listing => listing.variant.id);
        const fixedProductIds = fixedProducts.map(product => product.id);
        const [currentPriceMap, fixedCurrentPriceMap, termLookup] =
          await Promise.all([
            catalogService.listCurrentPricesForCurrency({
              variantIds,
              currency: preferredCurrency,
            }),
            catalogService.listCurrentFixedProductPricesForCurrency({
              productIds: fixedProductIds,
              currency: preferredCurrency,
            }),
            listVariantTermsWithRetry(variantIds, true),
          ]);
        const { termMap, retried: termLookupRetried } = termLookup;
        if (variantIds.length > 0 && termMap.size === 0) {
          Logger.error('Catalog term lookup returned no terms for listings', {
            listings: listings.length,
            variants: variantIds.length,
            retried: termLookupRetried,
          });
          const taskCreated = await ensureCatalogTermsUnavailableTask({
            endpoint: '/subscriptions/available',
            listings: listings.length,
            variants: variantIds.length,
            retried: termLookupRetried,
          });
          if (taskCreated) {
            Logger.warn('Catalog term lookup unavailable; admin task created', {
              category: CATALOG_TERMS_UNAVAILABLE_TASK_CATEGORY,
            });
          }
          reply.header('X-Catalog-Terms-Status', 'unavailable');
          return ErrorResponses.serviceUnavailable(
            reply,
            'Catalog terms unavailable'
          );
        }

        const categoryAssignmentMap =
          await safeListCategoryAssignmentsForProducts([
            ...new Set([
              ...listings.map(listing => listing.product.id),
              ...fixedProducts.map(product => product.id),
            ]),
          ]);

        const resolveProductTaxonomy = (product: {
          id: string;
          category?: string | null;
          sub_category?: string | null;
          category_assignments?: ProductCategoryAssignment[];
        }) => {
          const categoryAssignments =
            categoryAssignmentMap.get(product.id) ||
            product.category_assignments ||
            [];
          const primaryCategoryAssignment =
            categoryAssignments.find(assignment => assignment.is_primary) ||
            categoryAssignments[0] ||
            null;
          return {
            category:
              primaryCategoryAssignment?.category ?? product.category ?? null,
            subCategory: product.sub_category ?? null,
            categoryKeys: buildCategoryKeys(
              categoryAssignments,
              primaryCategoryAssignment?.category ?? product.category ?? null
            ),
          };
        };

        const services: Record<string, AvailablePlan[]> = {};
        const missingPriceTasks: Array<Promise<boolean>> = [];
        const missingPlanTasks: Array<Promise<boolean>> = [];
        const missingTermTasks: Array<Promise<boolean>> = [];
        let totalPlans = 0;

        for (const listing of listings) {
          const currentPrice = currentPriceMap.get(listing.variant.id) ?? null;
          const product = listing.product;
          const variant = listing.variant;
          const serviceType = product.service_type?.toLowerCase();

          if (!serviceType) {
            Logger.warn('Active product missing service_type', {
              productId: product.id,
              slug: product.slug,
            });
            continue;
          }

          const planCode = variant.service_plan || variant.variant_code;
          if (!planCode) {
            Logger.warn('Active variant missing plan code', {
              productId: product.id,
              variantId: variant.id,
            });
            missingPlanTasks.push(
              ensureMissingPlanTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
              })
            );
            continue;
          }

          const terms = termMap.get(variant.id) ?? [];
          if (terms.length === 0) {
            Logger.warn('Active variant missing term options', {
              productId: product.id,
              variantId: variant.id,
              planCode,
            });
            missingTermTasks.push(
              ensureMissingTermTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }

          const handlerPlan = shouldUseHandler(product.metadata)
            ? resolveHandlerPlan(serviceType, planCode)
            : null;
          const variantFeatures = normalizeStringList(
            variant.metadata?.['features']
          );
          const productFeatures = normalizeStringList(
            product.metadata?.['features']
          );
          const features =
            variantFeatures.length > 0
              ? variantFeatures
              : productFeatures.length > 0
                ? productFeatures
                : handlerPlan?.features || [];

          const priceCents = currentPrice
            ? Number(currentPrice.price_cents)
            : Number.NaN;
          if (!Number.isFinite(priceCents)) {
            missingPriceTasks.push(
              ensureMissingPriceTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }
          const price = priceCents / 100;
          const resolvedCurrency = normalizeCurrencyCode(
            currentPrice?.currency
          );
          if (!resolvedCurrency) {
            missingPriceTasks.push(
              ensureMissingPriceTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }

          const displayName =
            readMetadataString(variant.metadata, [
              'display_name',
              'displayName',
            ]) ||
            variant.name ||
            handlerPlan?.name ||
            product.name ||
            planCode;
          const description = variant.description || '';
          const badges = normalizeStringList(variant.metadata?.['badges']);

          const planEntry: AvailablePlan = {
            ...(() => {
              const taxonomy = resolveProductTaxonomy(product);
              return {
                category: taxonomy.category,
                sub_category: taxonomy.subCategory,
                category_keys: taxonomy.categoryKeys,
              };
            })(),
            plan: planCode,
            name: displayName,
            display_name: displayName,
            description,
            price,
            currency: resolvedCurrency,
            features,
            ...(badges.length > 0 ? { badges } : {}),
            service_type: serviceType,
            service_name: product.name,
            logo_key: product.logo_key ?? null,
            logoKey: product.logo_key ?? null,
            product_id: product.id,
            variant_id: variant.id,
          };

          if (!services[serviceType]) {
            services[serviceType] = [];
          }
          services[serviceType].push(planEntry);
          totalPlans += 1;
        }

        for (const product of fixedProducts) {
          const serviceType = product.service_type?.toLowerCase();
          if (!serviceType) {
            Logger.warn('Fixed product missing service_type', {
              productId: product.id,
              slug: product.slug,
            });
            continue;
          }

          const durationMonths = Number(product.duration_months);
          const fixedPriceCents = Number(product.fixed_price_cents);
          const fixedPriceCurrency = normalizeCurrencyCode(
            product.fixed_price_currency
          );
          const currentFixedPrice =
            fixedCurrentPriceMap.get(product.id) ?? null;
          const currentFixedPriceCents = currentFixedPrice
            ? Number(currentFixedPrice.price_cents)
            : Number.NaN;
          const currentFixedPriceCurrency = normalizeCurrencyCode(
            currentFixedPrice?.currency
          );

          if (
            !Number.isInteger(durationMonths) ||
            durationMonths <= 0 ||
            !Number.isInteger(fixedPriceCents) ||
            fixedPriceCents < 0 ||
            !fixedPriceCurrency
          ) {
            Logger.warn('Fixed product missing pricing fields', {
              productId: product.id,
              durationMonths: product.duration_months,
              fixedPriceCents: product.fixed_price_cents,
              fixedPriceCurrency: product.fixed_price_currency,
            });
            continue;
          }

          let resolvedPriceCents = Number.NaN;
          let resolvedCurrency: string | null = null;
          if (
            Number.isInteger(currentFixedPriceCents) &&
            currentFixedPriceCents >= 0 &&
            currentFixedPriceCurrency === preferredCurrency
          ) {
            resolvedPriceCents = currentFixedPriceCents;
            resolvedCurrency = currentFixedPriceCurrency;
          } else if (fixedPriceCurrency === preferredCurrency) {
            resolvedPriceCents = fixedPriceCents;
            resolvedCurrency = fixedPriceCurrency;
          }

          if (!Number.isInteger(resolvedPriceCents) || !resolvedCurrency) {
            missingPriceTasks.push(
              ensureMissingPriceTask({
                productId: product.id,
                variantId: product.id,
                serviceType,
                planCode: product.slug,
              })
            );
            continue;
          }

          const displayName =
            readMetadataString(product.metadata, [
              'display_name',
              'displayName',
            ]) || product.name;
          const features = normalizeStringList(product.metadata?.['features']);
          const badges = normalizeStringList(product.metadata?.['badges']);

          const planEntry: AvailablePlan = {
            ...(() => {
              const taxonomy = resolveProductTaxonomy(product);
              return {
                category: taxonomy.category,
                sub_category: taxonomy.subCategory,
                category_keys: taxonomy.categoryKeys,
              };
            })(),
            plan: product.slug,
            name: displayName,
            display_name: displayName,
            description: product.description || '',
            price: resolvedPriceCents / 100,
            currency: resolvedCurrency,
            features,
            ...(badges.length > 0 ? { badges } : {}),
            service_type: serviceType,
            service_name: product.name,
            logo_key: product.logo_key ?? null,
            logoKey: product.logo_key ?? null,
            product_id: product.id,
            variant_id: product.id,
          };

          if (!services[serviceType]) {
            services[serviceType] = [];
          }
          services[serviceType].push(planEntry);
          totalPlans += 1;
        }

        if (missingPriceTasks.length > 0) {
          const results = await Promise.all(missingPriceTasks);
          const createdCount = results.filter(Boolean).length;
          if (createdCount > 0) {
            Logger.warn('Catalog listings missing price; admin tasks created', {
              created: createdCount,
              total: missingPriceTasks.length,
            });
          }
        }

        if (missingPlanTasks.length > 0) {
          const results = await Promise.all(missingPlanTasks);
          const createdCount = results.filter(Boolean).length;
          if (createdCount > 0) {
            Logger.warn(
              'Catalog listings missing plan codes; admin tasks created',
              {
                created: createdCount,
                total: missingPlanTasks.length,
              }
            );
          }
        }

        if (missingTermTasks.length > 0) {
          const results = await Promise.all(missingTermTasks);
          const createdCount = results.filter(Boolean).length;
          if (createdCount > 0) {
            Logger.warn('Catalog listings missing terms; admin tasks created', {
              created: createdCount,
              total: missingTermTasks.length,
            });
          }
        }

        return SuccessResponses.ok(reply, {
          services,
          total_plans: totalPlans,
        });
      } catch (error) {
        Logger.error('Failed to fetch available plans:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch available plans'
        );
      }
    }
  );

  // Track add-to-cart (checkout popup opened)
  fastify.post(
    '/track/add-to-cart',
    async (
      request: FastifyRequest<{
        Body: {
          contentId?: string;
          contentName?: string;
          contentCategory?: string;
          price?: number;
          currency?: string;
          brand?: string;
          value?: number;
          externalId?: string;
          eventId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const user = request.user;
        const body = request.body || {};
        const contentId =
          typeof body.contentId === 'string' ? body.contentId.trim() : '';
        if (!contentId) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'contentId is required',
          });
        }
        const externalId =
          typeof body.externalId === 'string' ? body.externalId.trim() : '';
        const effectiveUserId = user?.userId || externalId;
        if (!effectiveUserId) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'externalId is required for anonymous tracking',
          });
        }
        const eventId =
          typeof body.eventId === 'string' ? body.eventId.trim() : '';
        const resolvedEventId =
          eventId || `user_${effectiveUserId}_add_to_cart_${Date.now()}`;

        const properties = buildTikTokProductProperties({
          value:
            typeof body.value === 'number'
              ? body.value
              : typeof body.price === 'number'
                ? body.price
                : null,
          currency: body.currency ?? null,
          contentId,
          contentName: body.contentName ?? null,
          contentCategory: body.contentCategory ?? null,
          price: typeof body.price === 'number' ? body.price : null,
          brand: body.brand ?? null,
        });

        void tiktokEventsService.trackAddToCart({
          userId: effectiveUserId,
          email: user?.email ?? null,
          eventId: resolvedEventId,
          properties,
          context: buildTikTokRequestContext(request),
        });

        return reply.send({ message: 'Add to cart tracked' });
      } catch (error) {
        Logger.error('Add to cart tracking failed:', error);
        reply.statusCode = 500;
        return reply.send({
          error: 'Internal Server Error',
          message: 'Failed to track add to cart',
        });
      }
    }
  );

  fastify.post(
    '/track/event',
    async (
      request: FastifyRequest<{
        Body: {
          event?: 'view_content' | 'search';
          contentId?: string;
          contentName?: string;
          contentCategory?: string;
          price?: number;
          currency?: string;
          brand?: string;
          value?: number;
          searchString?: string;
          externalId?: string;
          eventId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const user = request.user;
        const body = request.body || {};
        const event =
          body.event === 'view_content' || body.event === 'search'
            ? body.event
            : null;
        if (!event) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'event must be view_content or search',
          });
        }

        const externalId =
          typeof body.externalId === 'string' ? body.externalId.trim() : '';
        const effectiveUserId = user?.userId || externalId;
        if (!effectiveUserId) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'externalId is required for anonymous tracking',
          });
        }

        const eventId =
          typeof body.eventId === 'string' ? body.eventId.trim() : '';
        const context = buildTikTokRequestContext(request);

        if (event === 'view_content') {
          const contentId =
            typeof body.contentId === 'string' ? body.contentId.trim() : '';
          if (!contentId) {
            reply.statusCode = 400;
            return reply.send({
              error: 'Bad Request',
              message: 'contentId is required for view_content',
            });
          }

          const properties = buildTikTokProductProperties({
            value:
              typeof body.value === 'number'
                ? body.value
                : typeof body.price === 'number'
                  ? body.price
                  : null,
            currency: body.currency ?? null,
            contentId,
            contentName: body.contentName ?? null,
            contentCategory: body.contentCategory ?? null,
            price: typeof body.price === 'number' ? body.price : null,
            brand: body.brand ?? null,
          });

          void tiktokEventsService.trackViewContent({
            userId: effectiveUserId,
            email: user?.email ?? null,
            eventId:
              eventId || `user_${effectiveUserId}_view_content_${Date.now()}`,
            properties,
            context,
          });

          return reply.send({ message: 'View content tracked' });
        }

        const searchString =
          typeof body.searchString === 'string' ? body.searchString.trim() : '';
        if (!searchString) {
          reply.statusCode = 400;
          return reply.send({
            error: 'Bad Request',
            message: 'searchString is required for search',
          });
        }

        const searchProperties: Record<string, unknown> = {
          search_string: searchString,
        };
        if (typeof body.contentId === 'string' && body.contentId.trim()) {
          searchProperties['content_id'] = body.contentId.trim();
        }
        if (typeof body.currency === 'string' && body.currency.trim()) {
          searchProperties['currency'] = body.currency.trim().toUpperCase();
        }
        if (typeof body.value === 'number') {
          searchProperties['value'] = body.value;
        } else if (typeof body.price === 'number') {
          searchProperties['value'] = body.price;
        }

        void tiktokEventsService.trackSearch({
          userId: effectiveUserId,
          email: user?.email ?? null,
          eventId: eventId || `user_${effectiveUserId}_search_${Date.now()}`,
          properties: searchProperties,
          context,
        });

        return reply.send({ message: 'Search tracked' });
      } catch (error) {
        Logger.error('Event tracking failed:', error);
        reply.statusCode = 500;
        return reply.send({
          error: 'Internal Server Error',
          message: 'Failed to track event',
        });
      }
    }
  );

  // Get available products for browse (no auth required)
  fastify.get(
    '/products/available',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const preferredCurrency = resolveRequestCurrency(request);
        Logger.info('Fetching available products', {
          listingsSource: 'db',
          pricingSource: 'db',
          preferredCurrency,
        });

        const serviceQuery = request.query as {
          service_type?: string;
          category?: string;
          sub_category?: string;
        };
        const serviceTypeFilter = normalizeQueryText(
          serviceQuery.service_type
        )?.toLowerCase();
        const categoryFilter = normalizeQueryText(serviceQuery.category);
        const subCategoryFilter = normalizeQueryText(serviceQuery.sub_category);
        const listingFilters =
          serviceTypeFilter || categoryFilter || subCategoryFilter
            ? {
                ...(serviceTypeFilter
                  ? { service_type: serviceTypeFilter }
                  : {}),
                ...(categoryFilter ? { category: categoryFilter } : {}),
                ...(subCategoryFilter
                  ? { sub_category: subCategoryFilter }
                  : {}),
              }
            : undefined;

        const [listings, fixedProducts] = await Promise.all([
          catalogService.listActiveListings(listingFilters),
          catalogService.listActiveFixedProducts(listingFilters),
        ]);
        const variantIds = listings.map(listing => listing.variant.id);
        const fixedProductIds = fixedProducts.map(product => product.id);
        const [currentPriceMap, fixedCurrentPriceMap, termLookup] =
          await Promise.all([
            catalogService.listCurrentPricesForCurrency({
              variantIds,
              currency: preferredCurrency,
            }),
            catalogService.listCurrentFixedProductPricesForCurrency({
              productIds: fixedProductIds,
              currency: preferredCurrency,
            }),
            listVariantTermsWithRetry(variantIds, true),
          ]);
        const { termMap, retried: termLookupRetried } = termLookup;
        if (variantIds.length > 0 && termMap.size === 0) {
          Logger.error(
            'Catalog term lookup returned no terms for product listings',
            {
              listings: listings.length,
              variants: variantIds.length,
              retried: termLookupRetried,
            }
          );
          const taskCreated = await ensureCatalogTermsUnavailableTask({
            endpoint: '/subscriptions/products/available',
            listings: listings.length,
            variants: variantIds.length,
            retried: termLookupRetried,
          });
          if (taskCreated) {
            Logger.warn('Catalog term lookup unavailable; admin task created', {
              category: CATALOG_TERMS_UNAVAILABLE_TASK_CATEGORY,
            });
          }
          reply.header('X-Catalog-Terms-Status', 'unavailable');
          return ErrorResponses.serviceUnavailable(
            reply,
            'Catalog terms unavailable'
          );
        }

        const missingPriceTasks: Array<Promise<boolean>> = [];
        const missingPlanTasks: Array<Promise<boolean>> = [];
        const missingTermTasks: Array<Promise<boolean>> = [];

        const productMap = new Map<
          string,
          {
            product: CatalogListing['product'];
            variantId: string;
            minMonthlyCents: number;
            actualPriceCents: number;
            currency: string;
            fromTermMonths: number;
            fromDiscountPercent: number | null;
            maxDiscountPercent: number | null;
            platform: string | null;
            region: string | null;
            comparisonPriceCents: number | null;
          }
        >();

        for (const listing of listings) {
          const product = listing.product;
          const variant = listing.variant;
          const serviceType = product.service_type?.toLowerCase();

          if (!serviceType) {
            Logger.warn('Active product missing service_type', {
              productId: product.id,
              slug: product.slug,
            });
            continue;
          }

          const planCode = variant.service_plan || variant.variant_code;
          if (!planCode) {
            missingPlanTasks.push(
              ensureMissingPlanTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
              })
            );
            continue;
          }

          const terms = termMap.get(variant.id) ?? [];
          if (terms.length === 0) {
            missingTermTasks.push(
              ensureMissingTermTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }

          const currentPrice = currentPriceMap.get(variant.id) ?? null;
          const priceCents = currentPrice
            ? Number(currentPrice.price_cents)
            : Number.NaN;
          if (!Number.isFinite(priceCents)) {
            missingPriceTasks.push(
              ensureMissingPriceTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }

          const currency = normalizeCurrencyCode(currentPrice?.currency);
          if (!currency) {
            missingPriceTasks.push(
              ensureMissingPriceTask({
                productId: product.id,
                variantId: variant.id,
                serviceType,
                planCode,
              })
            );
            continue;
          }

          let minMonthlyCents = Number.POSITIVE_INFINITY;
          let actualPriceCents = Number.NaN;
          let fromTermMonths = 0;
          let fromDiscountPercent: number | null = null;
          let maxDiscountPercent: number | null = null;

          for (const term of terms) {
            const rawTermDiscount = Number(term.discount_percent ?? 0);
            if (Number.isFinite(rawTermDiscount) && rawTermDiscount > 0) {
              const normalizedTermDiscount = Math.round(rawTermDiscount);
              maxDiscountPercent =
                maxDiscountPercent === null
                  ? normalizedTermDiscount
                  : Math.max(maxDiscountPercent, normalizedTermDiscount);
            }

            const snapshot = computeTermPricing({
              basePriceCents: priceCents,
              termMonths: term.months,
              discountPercent: term.discount_percent ?? 0,
            });
            const effectiveMonthly = computeEffectiveMonthlyCents({
              totalPriceCents: snapshot.totalPriceCents,
              termMonths: snapshot.termMonths,
            });
            if (effectiveMonthly < minMonthlyCents) {
              minMonthlyCents = effectiveMonthly;
              actualPriceCents = snapshot.totalPriceCents;
              fromTermMonths = snapshot.termMonths;
              fromDiscountPercent = term.discount_percent ?? null;
            }
          }

          if (
            !Number.isFinite(minMonthlyCents) ||
            !Number.isFinite(actualPriceCents)
          ) {
            continue;
          }

          const platform = readMetadataString(product.metadata, [
            'platform',
            'platform_name',
            'platformName',
          ]);
          const region = readMetadataString(product.metadata, [
            'region',
            'region_name',
            'regionName',
          ]);
          const comparisonPriceCents = readMetadataInteger(product.metadata, [
            'comparison_price_cents',
            'comparisonPriceCents',
            'compare_at_price_cents',
            'compareAtPriceCents',
          ]);
          if (
            comparisonPriceCents !== null &&
            comparisonPriceCents > actualPriceCents &&
            actualPriceCents > 0
          ) {
            const metadataDiscountPercent = Math.round(
              ((comparisonPriceCents - actualPriceCents) /
                comparisonPriceCents) *
                100
            );
            if (metadataDiscountPercent > 0) {
              maxDiscountPercent =
                maxDiscountPercent === null
                  ? metadataDiscountPercent
                  : Math.max(maxDiscountPercent, metadataDiscountPercent);
            }
          }

          const existing = productMap.get(product.id);
          if (!existing || minMonthlyCents < existing.minMonthlyCents) {
            productMap.set(product.id, {
              product,
              variantId: variant.id,
              minMonthlyCents,
              actualPriceCents,
              currency,
              fromTermMonths,
              fromDiscountPercent,
              maxDiscountPercent,
              platform: platform || null,
              region: region || null,
              comparisonPriceCents,
            });
          }
        }

        for (const product of fixedProducts) {
          const serviceType = product.service_type?.toLowerCase();
          const fixedPriceCents = Number(product.fixed_price_cents);
          const durationMonths = Number(product.duration_months);
          const fixedPriceCurrency = normalizeCurrencyCode(
            product.fixed_price_currency
          );
          const currentFixedPrice =
            fixedCurrentPriceMap.get(product.id) ?? null;
          const currentFixedPriceCents = currentFixedPrice
            ? Number(currentFixedPrice.price_cents)
            : Number.NaN;
          const currentFixedPriceCurrency = normalizeCurrencyCode(
            currentFixedPrice?.currency
          );

          if (
            !Number.isInteger(fixedPriceCents) ||
            fixedPriceCents < 0 ||
            !Number.isInteger(durationMonths) ||
            durationMonths <= 0 ||
            !fixedPriceCurrency
          ) {
            continue;
          }

          let resolvedPriceCents = Number.NaN;
          let resolvedCurrency: string | null = null;
          if (
            Number.isInteger(currentFixedPriceCents) &&
            currentFixedPriceCents >= 0 &&
            currentFixedPriceCurrency === preferredCurrency
          ) {
            resolvedPriceCents = currentFixedPriceCents;
            resolvedCurrency = currentFixedPriceCurrency;
          } else if (fixedPriceCurrency === preferredCurrency) {
            resolvedPriceCents = fixedPriceCents;
            resolvedCurrency = fixedPriceCurrency;
          }

          if (!Number.isInteger(resolvedPriceCents) || !resolvedCurrency) {
            if (serviceType) {
              missingPriceTasks.push(
                ensureMissingPriceTask({
                  productId: product.id,
                  variantId: product.id,
                  serviceType,
                  planCode: product.slug,
                })
              );
            }
            continue;
          }

          const effectiveMonthly = computeEffectiveMonthlyCents({
            totalPriceCents: resolvedPriceCents,
            termMonths: durationMonths,
          });
          if (!Number.isFinite(effectiveMonthly)) {
            continue;
          }

          const platform = readMetadataString(product.metadata, [
            'platform',
            'platform_name',
            'platformName',
          ]);
          const region = readMetadataString(product.metadata, [
            'region',
            'region_name',
            'regionName',
          ]);
          const comparisonPriceCents = readMetadataInteger(product.metadata, [
            'comparison_price_cents',
            'comparisonPriceCents',
            'compare_at_price_cents',
            'compareAtPriceCents',
          ]);
          let maxDiscountPercent: number | null = null;
          if (
            comparisonPriceCents !== null &&
            comparisonPriceCents > fixedPriceCents &&
            fixedPriceCents > 0
          ) {
            const metadataDiscountPercent = Math.round(
              ((comparisonPriceCents - fixedPriceCents) /
                comparisonPriceCents) *
                100
            );
            if (metadataDiscountPercent > 0) {
              maxDiscountPercent = metadataDiscountPercent;
            }
          }

          const existing = productMap.get(product.id);
          if (!existing || effectiveMonthly < existing.minMonthlyCents) {
            productMap.set(product.id, {
              product,
              variantId: product.id,
              minMonthlyCents: effectiveMonthly,
              actualPriceCents: resolvedPriceCents,
              currency: resolvedCurrency,
              fromTermMonths: durationMonths,
              fromDiscountPercent: null,
              maxDiscountPercent,
              platform: platform || null,
              region: region || null,
              comparisonPriceCents,
            });
          }
        }

        if (missingPriceTasks.length > 0) {
          await Promise.all(missingPriceTasks);
        }
        if (missingPlanTasks.length > 0) {
          await Promise.all(missingPlanTasks);
        }
        if (missingTermTasks.length > 0) {
          await Promise.all(missingTermTasks);
        }

        const productCategoryAssignments =
          await safeListCategoryAssignmentsForProducts(
            Array.from(productMap.keys())
          );

        const products = Array.from(productMap.values()).map(entry => ({
          ...(function () {
            const assignments =
              productCategoryAssignments.get(entry.product.id) ||
              entry.product.category_assignments ||
              [];
            const primaryAssignment =
              assignments.find(assignment => assignment.is_primary) ||
              assignments[0] ||
              null;
            return {
              category:
                primaryAssignment?.category ?? entry.product.category ?? null,
              sub_category: entry.product.sub_category ?? null,
              category_keys: buildCategoryKeys(
                assignments,
                primaryAssignment?.category ?? entry.product.category ?? null
              ),
            };
          })(),
          product_id: entry.product.id,
          variant_id: entry.variantId,
          slug: entry.product.slug,
          name: entry.product.name,
          description: entry.product.description ?? '',
          service_type: entry.product.service_type ?? null,
          logo_key: entry.product.logo_key ?? null,
          platform: entry.platform,
          region: entry.region,
          currency: entry.currency,
          from_price: entry.minMonthlyCents / 100,
          from_term_months: entry.fromTermMonths,
          from_discount_percent: entry.fromDiscountPercent,
          max_discount_percent: entry.maxDiscountPercent,
          actual_price: entry.actualPriceCents / 100,
          comparison_price:
            entry.comparisonPriceCents !== null
              ? entry.comparisonPriceCents / 100
              : null,
        }));

        return SuccessResponses.ok(reply, {
          products,
          total_products: products.length,
        });
      } catch (error) {
        Logger.error('Failed to fetch product listings:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch product listings'
        );
      }
    }
  );

  // Get product detail with variants and terms (no auth required)
  fastify.get<{
    Params: { slug: string };
  }>(
    '/products/:slug',
    async (
      request: FastifyRequest<{ Params: { slug: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { slug } = request.params;
        const preferredCurrency = resolveRequestCurrency(request);
        const requestCountryCode =
          resolveCountryCodeFromRequestIp(request) ||
          resolveCountryFromHeaders(
            request.headers as Record<string, string | string[] | undefined>
          );

        const product = await catalogService.getProductBySlug(slug);
        if (!product || product.status !== 'active') {
          return ErrorResponses.notFound(reply, 'Product not found');
        }
        const nowMs = Date.now();
        const productSeed = product.id || product.slug || slug;
        const usersOnPage = resolveUsersOnPage(productSeed, nowMs);
        const unitsLeft = await resolveUnitsLeft(productSeed, nowMs);

        const variants = await catalogService.listVariants(product.id, true);
        const termsConditions = readMetadataList(product.metadata, [
          'terms_conditions',
          'termsConditions',
          'terms',
        ]);
        const upgradeOptionsRaw = normalizeUpgradeOptions(product.metadata);
        const upgradeValidation = validateUpgradeOptions(upgradeOptionsRaw);
        const upgradeOptions = upgradeValidation.valid
          ? upgradeOptionsRaw
          : null;
        const platform = readMetadataString(product.metadata, [
          'platform',
          'platform_name',
          'platformName',
        ]);
        const region = readMetadataString(product.metadata, [
          'region',
          'region_name',
          'regionName',
        ]);
        const infoBoxText = readMetadataString(product.metadata, [
          'info_box_text',
          'infoBoxText',
          'info_text',
          'infoText',
        ]);
        const activationGuide = readMetadataString(product.metadata, [
          'activation_guide',
          'activationGuide',
          'activation_guide_text',
          'activationGuideText',
        ]);
        if (!upgradeValidation.valid) {
          Logger.warn('Invalid upgrade options configuration', {
            productId: product.id,
            reason: upgradeValidation.reason,
          });
        }

        if (variants.length === 0) {
          const durationMonths = Number(product.duration_months);
          const fixedPriceCents = Number(product.fixed_price_cents);
          const fixedPriceCurrency = normalizeCurrencyCode(
            product.fixed_price_currency
          );
          const serviceType = product.service_type?.toLowerCase();
          const currentFixedPrice =
            await catalogService.getCurrentFixedProductPriceForCurrency({
              productId: product.id,
              currency: preferredCurrency,
            });
          const currentFixedPriceCents = currentFixedPrice
            ? Number(currentFixedPrice.price_cents)
            : Number.NaN;
          const currentFixedPriceCurrency = normalizeCurrencyCode(
            currentFixedPrice?.currency
          );

          if (
            !Number.isInteger(durationMonths) ||
            durationMonths <= 0 ||
            !Number.isInteger(fixedPriceCents) ||
            fixedPriceCents < 0 ||
            !fixedPriceCurrency
          ) {
            return ErrorResponses.notFound(reply, 'Product not available');
          }

          let resolvedPriceCents = Number.NaN;
          let resolvedCurrency: string | null = null;
          if (
            Number.isInteger(currentFixedPriceCents) &&
            currentFixedPriceCents >= 0 &&
            currentFixedPriceCurrency === preferredCurrency
          ) {
            resolvedPriceCents = currentFixedPriceCents;
            resolvedCurrency = currentFixedPriceCurrency;
          } else if (fixedPriceCurrency === preferredCurrency) {
            resolvedPriceCents = fixedPriceCents;
            resolvedCurrency = fixedPriceCurrency;
          }

          if (!Number.isInteger(resolvedPriceCents) || !resolvedCurrency) {
            if (serviceType) {
              await ensureMissingPriceTask({
                productId: product.id,
                variantId: product.id,
                serviceType,
                planCode: product.slug,
              });
            }
            return ErrorResponses.notFound(reply, 'Product not available');
          }

          const monthlyBase = Math.max(
            1,
            Math.round(resolvedPriceCents / durationMonths)
          );
          const features = normalizeStringList(product.metadata?.['features']);
          const badges = normalizeStringList(product.metadata?.['badges']);

          return SuccessResponses.ok(reply, {
            product: {
              id: product.id,
              name: product.name,
              slug: product.slug,
              description: product.description ?? '',
              service_type: product.service_type ?? null,
              logo_key: product.logo_key ?? null,
              category: product.category ?? null,
              sub_category: product.sub_category ?? null,
              category_keys: product.category_keys ?? null,
              terms_conditions: termsConditions,
              upgrade_options: upgradeOptions,
              platform: platform || null,
              region: region || null,
              info_box_text: infoBoxText || null,
              activation_guide: activationGuide || null,
            },
            variants: [
              {
                id: product.id,
                plan_code: product.slug,
                name: product.name,
                display_name:
                  readMetadataString(product.metadata, [
                    'display_name',
                    'displayName',
                  ]) || product.name,
                description: product.description ?? '',
                features,
                badges,
                base_price: monthlyBase / 100,
                currency: resolvedCurrency,
                term_options: [
                  {
                    months: durationMonths,
                    total_price: resolvedPriceCents / 100,
                    discount_percent: 0,
                    is_recommended: true,
                  },
                ],
              },
            ],
            country_code: requestCountryCode || null,
            users_on_page: usersOnPage,
            units_left: unitsLeft,
          });
        }

        const variantIds = variants.map(variant => variant.id);
        const [currentPriceMap, termMap] = await Promise.all([
          catalogService.listCurrentPricesForCurrency({
            variantIds,
            currency: preferredCurrency,
          }),
          catalogService.listVariantTermsForVariants(variantIds, true),
        ]);

        const variantResponses = [];

        for (const variant of variants) {
          const planCode = variant.service_plan || variant.variant_code;
          if (!planCode) {
            continue;
          }

          const terms = termMap.get(variant.id) ?? [];
          if (terms.length === 0) {
            continue;
          }

          const currentPrice = currentPriceMap.get(variant.id) ?? null;
          const priceCents = currentPrice
            ? Number(currentPrice.price_cents)
            : Number.NaN;
          if (!Number.isFinite(priceCents)) {
            continue;
          }

          const currency = normalizeCurrencyCode(currentPrice?.currency);
          if (!currency) {
            continue;
          }

          const variantFeatures = normalizeStringList(
            variant.metadata?.['features']
          );
          const productFeatures = normalizeStringList(
            product.metadata?.['features']
          );

          const displayName =
            readMetadataString(variant.metadata, [
              'display_name',
              'displayName',
            ]) ||
            variant.name ||
            planCode;

          const description = variant.description || '';

          const termOptions = terms.map(term => {
            const snapshot = computeTermPricing({
              basePriceCents: priceCents,
              termMonths: term.months,
              discountPercent: term.discount_percent ?? 0,
            });

            return {
              months: term.months,
              total_price: snapshot.totalPriceCents / 100,
              discount_percent: term.discount_percent ?? null,
              is_recommended: term.is_recommended,
            };
          });

          const badges = normalizeStringList(variant.metadata?.['badges']);

          variantResponses.push({
            id: variant.id,
            plan_code: planCode,
            name: variant.name,
            display_name: displayName,
            description,
            features:
              variantFeatures.length > 0 ? variantFeatures : productFeatures,
            badges,
            base_price: priceCents / 100,
            currency,
            term_options: termOptions,
          });
        }

        if (variantResponses.length === 0) {
          return ErrorResponses.notFound(reply, 'Product not available');
        }

        return SuccessResponses.ok(reply, {
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description ?? '',
            service_type: product.service_type ?? null,
            logo_key: product.logo_key ?? null,
            category: product.category ?? null,
            sub_category: product.sub_category ?? null,
            category_keys: product.category_keys ?? null,
            terms_conditions: termsConditions,
            upgrade_options: upgradeOptions,
            platform: platform || null,
            region: region || null,
            info_box_text: infoBoxText || null,
            activation_guide: activationGuide || null,
          },
          variants: variantResponses,
          country_code: requestCountryCode || null,
          users_on_page: usersOnPage,
          units_left: unitsLeft,
        });
      } catch (error) {
        Logger.error('Failed to fetch product detail:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch product detail'
        );
      }
    }
  );

  // Get related subscription plans by service type (no auth required)
  fastify.get<{
    Params: { serviceType: string };
    Querystring: { limit?: number; exclude?: string };
  }>(
    '/related/:serviceType',
    async (
      request: FastifyRequest<{
        Params: { serviceType: string };
        Querystring: { limit?: number; exclude?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { serviceType } = request.params;
        const { limit = 4, exclude } = request.query;
        const preferredCurrency = resolveRequestCurrency(request);

        Logger.info('Fetching related plans', { serviceType, limit, exclude });

        const listings = await catalogService.listActiveListings();
        const variantIds = listings.map(listing => listing.variant.id);
        const [currentPriceMap, termMap] = await Promise.all([
          catalogService.listCurrentPricesForCurrency({
            variantIds,
            currency: preferredCurrency,
          }),
          catalogService.listVariantTermsForVariants(variantIds, true),
        ]);

        const relatedPlans = [];
        const normalizedServiceType = serviceType.toLowerCase();

        for (const listing of listings) {
          if (relatedPlans.length >= limit) {
            break;
          }

          const productServiceType =
            listing.product.service_type?.toLowerCase();
          if (
            !productServiceType ||
            productServiceType === normalizedServiceType
          ) {
            continue;
          }

          const planCode =
            listing.variant.service_plan || listing.variant.variant_code;
          if (!planCode || (exclude && planCode === exclude)) {
            continue;
          }

          const terms = termMap.get(listing.variant.id) ?? [];
          if (terms.length === 0) {
            continue;
          }

          const currentPrice = currentPriceMap.get(listing.variant.id) ?? null;
          const priceCents = currentPrice
            ? Number(currentPrice.price_cents)
            : Number.NaN;
          if (!Number.isFinite(priceCents)) {
            continue;
          }

          const currency = normalizeCurrencyCode(currentPrice?.currency);
          if (!currency) {
            continue;
          }

          relatedPlans.push({
            id: `${productServiceType}-${planCode}`,
            serviceType: productServiceType,
            serviceName: listing.product.name || productServiceType,
            planName: listing.variant.name || listing.product.name || planCode,
            price: priceCents / 100,
            currency,
            productId: listing.product.id,
            productSlug: listing.product.slug,
            product_slug: listing.product.slug,
          });
        }

        return SuccessResponses.ok(reply, relatedPlans);
      } catch (error) {
        Logger.error('Failed to fetch related plans:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch related plans'
        );
      }
    }
  );

  // Validate purchase eligibility (requires auth)
  fastify.post<{
    Body: {
      variant_id: string;
      duration_months?: number;
      coupon_code?: string;
    };
  }>(
    '/validate-purchase',
    {
      preHandler: [
        subscriptionValidationRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
      schema: {
        body: FastifySchemas.validatePurchaseInput,
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          variant_id: string;
          duration_months?: number;
          coupon_code?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { variant_id, duration_months = 1, coupon_code } = request.body;

        Logger.info('Validating purchase eligibility', {
          userId,
          variantId: variant_id,
          duration: duration_months,
        });

        const pricingResult = await resolveVariantPricing({
          variantId: variant_id,
          currency: 'USD',
          termMonths: duration_months,
        });

        if (!pricingResult.ok) {
          if (
            pricingResult.error === 'variant_not_found' ||
            pricingResult.error === 'inactive'
          ) {
            return ErrorResponses.badRequest(
              reply,
              'Subscription plan is not available'
            );
          }
          if (pricingResult.error === 'term_unavailable') {
            return SuccessResponses.ok(reply, {
              can_purchase: false,
              reason: 'Selected duration is not available for this plan',
              required_credits: 0,
              existing_subscription: null,
            });
          }
          return SuccessResponses.ok(reply, {
            can_purchase: false,
            reason: 'Pricing unavailable for this plan',
            required_credits: 0,
            existing_subscription: null,
          });
        }

        const {
          product,
          variant,
          snapshot,
          currency,
          productVariantId,
          planCode,
        } = pricingResult.data;
        const upgradeOptionsRaw = normalizeUpgradeOptions(product.metadata);
        const upgradeValidation = validateUpgradeOptions(upgradeOptionsRaw);
        if (!upgradeValidation.valid) {
          Logger.error('Invalid upgrade options configuration', {
            productId: product.id,
            reason: upgradeValidation.reason,
          });
          return ErrorResponses.internalError(
            reply,
            'Subscription plan is not available'
          );
        }
        if (!planCode || !product.service_type) {
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        const useHandler = shouldUseHandler(product.metadata);
        const handlerPlan = useHandler
          ? resolveHandlerPlan(product.service_type, planCode)
          : null;

        const termSubtotalCents = snapshot.basePriceCents * snapshot.termMonths;
        const termTotalCents = snapshot.totalPriceCents;
        let couponDiscountCents = 0;

        const normalizedCoupon = normalizeCouponCode(coupon_code);
        if (normalizedCoupon) {
          const couponResult = await couponService.validateCouponForOrder({
            couponCode: normalizedCoupon,
            userId,
            product,
            subtotalCents: termTotalCents,
            termMonths: snapshot.termMonths,
          });

          if (!couponResult.success) {
            return SuccessResponses.ok(reply, {
              can_purchase: false,
              reason: 'Coupon not valid for this order.',
              required_credits: 0,
              existing_subscription: null,
            });
          }

          couponDiscountCents = couponResult.data.discountCents;
        }

        const finalTotalCents = Math.max(
          0,
          termTotalCents - couponDiscountCents
        );
        const price = finalTotalCents / 100;
        if (currency !== 'USD') {
          return SuccessResponses.ok(reply, {
            can_purchase: false,
            reason: 'Credit purchases are only supported for USD pricing',
            required_credits: 0,
            existing_subscription: null,
          });
        }
        const variantFeatures = normalizeStringList(
          variant.metadata?.['features']
        );
        const productFeatures = normalizeStringList(
          product.metadata?.['features']
        );
        const features =
          variantFeatures.length > 0
            ? variantFeatures
            : productFeatures.length > 0
              ? productFeatures
              : handlerPlan?.features || [];

        const displayName =
          readMetadataString(variant.metadata, [
            'display_name',
            'displayName',
          ]) ||
          variant.name ||
          handlerPlan?.name ||
          product.name ||
          planCode;
        const description = variant.description || '';

        // Check if user can purchase
        if (productVariantId) {
          const validation = await subscriptionService.canPurchaseSubscription(
            userId,
            productVariantId
          );

          if (!validation.canPurchase) {
            return SuccessResponses.ok(reply, {
              can_purchase: false,
              reason: validation.reason,
              required_credits: price,
              existing_subscription: validation.existing_subscription,
            });
          }
        }

        // Get user balance
        const balance = await creditService.getUserBalance(userId);
        if (!balance) {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve user balance'
          );
        }

        // Check if user has enough credits
        if (balance.availableBalance < price) {
          return SuccessResponses.ok(reply, {
            can_purchase: false,
            reason: `Insufficient credits. Required: ${price}, Available: ${balance.availableBalance}`,
            required_credits: price,
            user_balance: balance.availableBalance,
            subtotal_cents: termSubtotalCents,
            term_discount_cents: snapshot.discountCents,
            coupon_discount_cents: couponDiscountCents,
            total_cents: finalTotalCents,
          });
        }

        // Calculate dates
        const startDate = new Date();
        const endDate = calculateEndDate(snapshot.termMonths);
        const renewalDate = calculateRenewalDate(snapshot.termMonths);
        const planDetails: ServicePlanDetails = {
          plan: planCode,
          name: displayName,
          description,
          price,
          currency,
          features,
        };

        return SuccessResponses.ok(reply, {
          can_purchase: true,
          plan_details: planDetails,
          required_credits: price,
          user_balance: balance.availableBalance,
          balance_after: balance.availableBalance - price,
          subtotal_cents: termSubtotalCents,
          term_discount_cents: snapshot.discountCents,
          coupon_discount_cents: couponDiscountCents,
          total_cents: finalTotalCents,
          subscription_details: {
            start_date: startDate,
            end_date: endDate,
            renewal_date: renewalDate,
          },
        });
      } catch (error) {
        Logger.error('Purchase validation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to validate purchase'
        );
      }
    }
  );

  // Purchase subscription (requires auth) - CRITICAL ENDPOINT
  fastify.post<{
    Body: {
      variant_id: string;
      duration_months?: number;
      metadata?: SubscriptionMetadata;
      auto_renew?: boolean;
      coupon_code?: string;
    };
  }>(
    '/purchase',
    {
      preHandler: [
        subscriptionPurchaseRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
      schema: {
        body: FastifySchemas.purchaseSubscriptionInput,
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          variant_id: string;
          duration_months?: number;
          metadata?: SubscriptionMetadata;
          auto_renew?: boolean;
          coupon_code?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const {
          variant_id,
          duration_months = 1,
          metadata,
          coupon_code,
        } = request.body;
        const auto_renew = false;

        Logger.info('Processing subscription purchase', {
          userId,
          variantId: variant_id,
          duration: duration_months,
        });

        const pricingResult = await resolveVariantPricing({
          variantId: variant_id,
          currency: 'USD',
          termMonths: duration_months,
        });

        if (!pricingResult.ok) {
          if (pricingResult.error === 'term_unavailable') {
            return ErrorResponses.badRequest(
              reply,
              'Selected duration is not available for this plan'
            );
          }
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        const { product, snapshot, currency, productVariantId, planCode } =
          pricingResult.data;
        const upgradeOptionsRaw = normalizeUpgradeOptions(product.metadata);
        const upgradeValidation = validateUpgradeOptions(upgradeOptionsRaw);
        if (!upgradeValidation.valid) {
          Logger.error('Invalid upgrade options configuration', {
            productId: product.id,
            reason: upgradeValidation.reason,
          });
          return ErrorResponses.internalError(
            reply,
            'Subscription plan is not available'
          );
        }
        const upgradeOptions = upgradeOptionsRaw;
        if (!planCode || !product.service_type) {
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        // Re-validate purchase eligibility to prevent race conditions
        if (productVariantId) {
          const validation = await subscriptionService.canPurchaseSubscription(
            userId,
            productVariantId,
            metadata
          );

          if (!validation.canPurchase) {
            return sendError(
              reply,
              HttpStatus.CONFLICT,
              'Purchase Not Allowed',
              validation.reason || 'Purchase validation failed',
              'PURCHASE_VALIDATION_FAILED',
              { existingSubscription: validation.existing_subscription }
            );
          }
        }

        if (currency !== 'USD') {
          return ErrorResponses.badRequest(
            reply,
            'Credit purchases are only supported for USD pricing'
          );
        }

        const termSubtotalCents = snapshot.basePriceCents * snapshot.termMonths;
        const termTotalCents = snapshot.totalPriceCents;
        let couponDiscountCents = 0;
        let coupon: { id: string; code: string; percent_off: number } | null =
          null;

        const normalizedCoupon = normalizeCouponCode(coupon_code);
        if (normalizedCoupon) {
          const couponResult = await couponService.validateCouponForOrder({
            couponCode: normalizedCoupon,
            userId,
            product,
            subtotalCents: termTotalCents,
            termMonths: snapshot.termMonths,
          });

          if (!couponResult.success) {
            return ErrorResponses.badRequest(
              reply,
              'Coupon not valid for this order.'
            );
          }

          coupon = couponResult.data.coupon;
          couponDiscountCents = couponResult.data.discountCents;
        }

        const finalTotalCents = Math.max(
          0,
          termTotalCents - couponDiscountCents
        );
        const price = finalTotalCents / 100;
        const orderDescription = `Subscription purchase: ${product.service_type} ${planCode} (${snapshot.termMonths} month${snapshot.termMonths > 1 ? 's' : ''})`;
        const orderInput = {
          user_id: userId,
          status: 'pending_payment' as const,
          status_reason: 'purchase_started',
          currency,
          subtotal_cents: termSubtotalCents,
          discount_cents: snapshot.discountCents,
          coupon_id: coupon?.id ?? null,
          coupon_code: coupon?.code ?? null,
          coupon_discount_cents: couponDiscountCents,
          total_cents: finalTotalCents,
          term_months: snapshot.termMonths,
          paid_with_credits: true,
          auto_renew,
          payment_provider: 'credits',
          metadata: {
            service_type: product.service_type,
            service_plan: planCode,
            duration_months: snapshot.termMonths,
            discount_percent: snapshot.discountPercent,
            base_price_cents: snapshot.basePriceCents,
            total_price_cents: finalTotalCents,
            ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
            ...(coupon
              ? {
                  coupon_code: coupon.code,
                  coupon_percent_off: coupon.percent_off,
                  coupon_discount_cents: couponDiscountCents,
                }
              : {}),
          },
        };

        const orderItems = [
          {
            product_variant_id: productVariantId,
            quantity: 1,
            unit_price_cents: finalTotalCents,
            base_price_cents: snapshot.basePriceCents,
            discount_percent: snapshot.discountPercent,
            term_months: snapshot.termMonths,
            auto_renew,
            coupon_discount_cents: couponDiscountCents,
            currency,
            total_price_cents: finalTotalCents,
            description: orderDescription,
            metadata: {
              service_type: product.service_type,
              service_plan: planCode,
              duration_months: snapshot.termMonths,
              discount_percent: snapshot.discountPercent,
              base_price_cents: snapshot.basePriceCents,
              total_price_cents: finalTotalCents,
              ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
              ...(coupon
                ? {
                    coupon_code: coupon.code,
                    coupon_percent_off: coupon.percent_off,
                    coupon_discount_cents: couponDiscountCents,
                  }
                : {}),
            },
          },
        ];

        let orderResult:
          | Awaited<ReturnType<typeof orderService.createOrderWithItems>>
          | Awaited<
              ReturnType<typeof orderService.createOrderWithItemsInTransaction>
            >;

        if (coupon) {
          const pool = getDatabasePool();
          const client = await pool.connect();
          let transactionOpen = false;
          try {
            await client.query('BEGIN');
            transactionOpen = true;
            orderResult = await orderService.createOrderWithItemsInTransaction(
              client,
              orderInput,
              orderItems
            );

            if (!orderResult.success || !orderResult.data) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.internalError(
                reply,
                'Failed to create order for purchase'
              );
            }

            const reservation = await couponService.reserveCouponRedemption({
              couponId: coupon.id,
              userId,
              orderId: orderResult.data.id,
              product,
              subtotalCents: termTotalCents,
              termMonths: snapshot.termMonths,
              client,
            });

            if (!reservation.success) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Coupon not valid for this order.'
              );
            }

            await client.query('COMMIT');
            transactionOpen = false;
          } catch (error) {
            if (transactionOpen) {
              await client.query('ROLLBACK');
              transactionOpen = false;
            }
            Logger.error('Failed to reserve coupon during purchase:', error);
            return ErrorResponses.internalError(
              reply,
              'Failed to create order for purchase'
            );
          } finally {
            if (transactionOpen) {
              try {
                await client.query('ROLLBACK');
              } catch (rollbackError) {
                Logger.error(
                  'Failed to rollback purchase coupon reservation',
                  rollbackError
                );
              }
            }
            client.release();
          }
        } else {
          orderResult = await orderService.createOrderWithItems(
            orderInput,
            orderItems
          );
        }

        if (!orderResult.success || !orderResult.data) {
          return ErrorResponses.internalError(
            reply,
            'Failed to create order for purchase'
          );
        }

        const order = orderResult.data;
        const contentId =
          product.slug?.trim() ||
          productVariantId ||
          product.id ||
          planCode ||
          product.service_type ||
          null;
        const checkoutProperties = buildTikTokProductProperties({
          value: price,
          currency,
          contentId,
          contentName: product.name || product.service_type || planCode,
          contentCategory: product.category || product.service_type || null,
          price,
          brand: product.service_type || null,
        });
        void tiktokEventsService.trackInitiateCheckout({
          userId,
          email: request.user?.email ?? null,
          eventId: `order_${order.id}_checkout`,
          properties: checkoutProperties,
          context: buildTikTokRequestContext(request),
        });
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + snapshot.termMonths);
        const renewalDate = new Date(endDate);
        renewalDate.setDate(renewalDate.getDate() - 7);
        const nextBillingAt = auto_renew ? renewalDate : null;

        // Step 1: Deduct credits (atomic operation)
        const creditResult = await creditService.spendCredits(
          userId,
          price,
          `Subscription purchase: ${product.service_type} ${planCode}`,
          {
            service_type: product.service_type,
            service_plan: planCode,
            duration_months: snapshot.termMonths,
            purchase_type: 'subscription',
          },
          {
            orderId: order.id,
            ...(productVariantId ? { productVariantId } : {}),
            priceCents: finalTotalCents,
            basePriceCents: snapshot.basePriceCents,
            discountPercent: snapshot.discountPercent,
            termMonths: snapshot.termMonths,
            currency,
            autoRenew: auto_renew,
            ...(nextBillingAt ? { nextBillingAt } : {}),
            renewalMethod: 'credits',
            statusReason: 'paid_with_credits',
          }
        );

        if (!creditResult.success) {
          Logger.error('Credit deduction failed', {
            userId,
            price,
            error: creditResult.error,
          });

          await orderService.updateOrderStatus(
            order.id,
            'cancelled',
            creditResult.error || 'credit_payment_failed'
          );
          if (coupon) {
            await couponService.voidRedemptionForOrder(order.id);
          }

          if (creditResult.error?.includes('Insufficient')) {
            return sendError(
              reply,
              HttpStatus.PAYMENT_REQUIRED,
              'Insufficient Credits',
              creditResult.error,
              'INSUFFICIENT_CREDITS',
              { required: price }
            );
          }

          return ErrorResponses.badRequest(
            reply,
            creditResult.error || 'Credit deduction failed'
          );
        }

        // Step 2: Create subscription
        const subscriptionInput: CreateSubscriptionInput = {
          service_type: product.service_type,
          service_plan: planCode,
          start_date: startDate,
          end_date: endDate,
          renewal_date: renewalDate,
          auto_renew,
          order_id: order.id,
          product_variant_id: productVariantId,
          price_cents: termTotalCents,
          base_price_cents: snapshot.basePriceCents,
          discount_percent: snapshot.discountPercent,
          term_months: snapshot.termMonths,
          currency,
          next_billing_at: nextBillingAt,
          renewal_method: 'credits',
          status_reason: 'paid_with_credits',
          upgrade_options_snapshot: upgradeOptions ?? null,
          ...(metadata && { metadata }),
        };

        const subResult = await subscriptionService.createSubscription(
          userId,
          subscriptionInput
        );

        // Step 3: If subscription creation fails, REFUND credits
        if (!subResult.success) {
          Logger.error('Subscription creation failed, refunding credits', {
            userId,
            transactionId: creditResult.transaction!.id,
            error: subResult.error,
          });

          await creditService.refundCredits(
            userId,
            price,
            'Subscription creation failed - automatic refund',
            creditResult.transaction!.id,
            {
              original_transaction_id: creditResult.transaction!.id,
              reason: 'automatic_rollback',
              service_type: product.service_type,
              service_plan: planCode,
            },
            {
              orderId: order.id,
              ...(productVariantId ? { productVariantId } : {}),
              priceCents: finalTotalCents,
              basePriceCents: snapshot.basePriceCents,
              discountPercent: snapshot.discountPercent,
              termMonths: snapshot.termMonths,
              currency,
              autoRenew: auto_renew,
              ...(nextBillingAt ? { nextBillingAt } : {}),
              renewalMethod: 'credits',
              statusReason: 'subscription_create_failed',
            }
          );

          await orderService.updateOrderStatus(
            order.id,
            'cancelled',
            'subscription_create_failed'
          );
          if (coupon) {
            await couponService.voidRedemptionForOrder(order.id);
          }

          return ErrorResponses.internalError(
            reply,
            'Subscription creation failed, credits refunded'
          );
        }

        await orderService.updateOrderPayment(order.id, {
          payment_provider: 'credits',
          payment_reference: creditResult.transaction!.id,
          paid_with_credits: true,
          auto_renew,
          status: 'in_process',
          status_reason: 'paid_with_credits',
        });
        if (coupon) {
          await couponService.finalizeRedemptionForOrder(order.id);
        }
        try {
          const confirmationResult =
            await orderService.sendOrderPaymentConfirmationEmail(order.id);
          if (
            !confirmationResult.success &&
            confirmationResult.reason &&
            !['already_sent', 'renewal_order'].includes(
              confirmationResult.reason
            )
          ) {
            Logger.warn('Failed to send order payment confirmation email', {
              orderId: order.id,
              reason: confirmationResult.reason,
            });
          }
        } catch (emailError) {
          Logger.warn('Order payment confirmation email call failed', {
            orderId: order.id,
            error: emailError,
          });
        }
        void tiktokEventsService.trackPurchase({
          userId,
          email: request.user?.email ?? null,
          eventId: `order_${order.id}_purchase`,
          properties: checkoutProperties,
          context: buildTikTokRequestContext(request),
        });

        const createdSubscription = subResult.data!;
        const orderItemId =
          Array.isArray(order.items) && order.items.length > 0
            ? (order.items[0]?.id ?? null)
            : null;
        const subscriptionStartAt =
          createdSubscription.term_start_at ?? createdSubscription.start_date;
        const mmuCycleTotal =
          snapshot.termMonths > 1 ? snapshot.termMonths : null;
        const mmuCycleIndex = mmuCycleTotal ? 1 : null;

        const entitlement = await orderEntitlementService.upsertEntitlement({
          order_id: order.id,
          order_item_id: orderItemId,
          user_id: userId,
          status: createdSubscription.status,
          starts_at: subscriptionStartAt,
          ends_at: createdSubscription.end_date,
          duration_months_snapshot: snapshot.termMonths,
          credentials_encrypted: null,
          mmu_cycle_index: mmuCycleIndex,
          mmu_cycle_total: mmuCycleTotal,
          source_subscription_id: createdSubscription.id,
          metadata: {
            source: 'subscriptions.purchase',
            renewal_method: 'credits',
          },
        });
        if (!entitlement) {
          Logger.warn(
            'Failed to upsert order entitlement after subscription purchase',
            {
              orderId: order.id,
              subscriptionId: createdSubscription.id,
            }
          );
        }

        Logger.info('Subscription purchased successfully', {
          userId,
          subscriptionId: createdSubscription.id,
          price,
          transactionId: creditResult.transaction!.id,
        });

        return SuccessResponses.created(
          reply,
          {
            order_id: order.id,
            subscription: subResult.data,
            upgrade_options: upgradeOptions ?? null,
            transaction: {
              transaction_id: creditResult.transaction!.id,
              amount_debited: price,
              balance_after: creditResult.balance!.availableBalance,
            },
          },
          'Subscription purchased successfully'
        );
      } catch (error) {
        Logger.error('Purchase flow error:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to process purchase'
        );
      }
    }
  );

  // Get upgrade selection state (requires auth)
  fastify.get<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/upgrade-selection',
    {
      preHandler: [authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { subscriptionId } = request.params;
        if (!validateSubscriptionId(subscriptionId)) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid subscription ID format'
          );
        }

        const selection =
          await upgradeSelectionService.getSelectionForSubscriptionUser(
            subscriptionId,
            userId
          );

        if (!selection) {
          return ErrorResponses.notFound(reply, 'Upgrade selection not found');
        }

        const { credentials_encrypted: _credentials, ...safeSelection } =
          selection;

        return SuccessResponses.ok(reply, {
          selection: safeSelection,
          locked: Boolean(selection.locked_at),
        });
      } catch (error) {
        Logger.error('Failed to fetch upgrade selection state:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch upgrade selection'
        );
      }
    }
  );

  // Acknowledge manual monthly upgrade requirement (requires auth)
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/manual-monthly-acknowledge',
    {
      preHandler: [authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { subscriptionId } = request.params;
        if (!validateSubscriptionId(subscriptionId)) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid subscription ID format'
          );
        }

        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId, userId);
        if (!subscriptionResult.success || !subscriptionResult.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        const selection =
          await upgradeSelectionService.getSelectionForSubscriptionUser(
            subscriptionId,
            userId
          );
        if (!selection) {
          return ErrorResponses.notFound(
            reply,
            'Upgrade selection is not available for this subscription'
          );
        }

        const upgradeValidation = validateUpgradeOptions(
          selection.upgrade_options_snapshot
        );
        if (!upgradeValidation.valid) {
          Logger.error('Invalid upgrade options snapshot', {
            subscriptionId,
            reason: upgradeValidation.reason,
          });
          return ErrorResponses.internalError(
            reply,
            'Upgrade selection is unavailable'
          );
        }

        const allowNew =
          selection.upgrade_options_snapshot.allow_new_account === true;
        const allowOwn =
          selection.upgrade_options_snapshot.allow_own_account === true;
        const manualMonthly =
          selection.upgrade_options_snapshot.manual_monthly_upgrade === true;

        if (!manualMonthly) {
          return ErrorResponses.badRequest(
            reply,
            'Manual monthly acknowledgement is not required'
          );
        }

        if (allowNew || allowOwn) {
          return ErrorResponses.badRequest(
            reply,
            'Upgrade selection is required before acknowledging manual monthly upgrades'
          );
        }

        const acknowledgedSelection =
          selection.manual_monthly_acknowledged_at &&
          selection.submitted_at &&
          selection.locked_at
            ? selection
            : await upgradeSelectionService.acknowledgeManualMonthly({
                subscriptionId,
              });

        if (!acknowledgedSelection) {
          return ErrorResponses.internalError(
            reply,
            'Failed to acknowledge manual monthly upgrade'
          );
        }

        if (subscriptionResult.data.status === 'pending') {
          await subscriptionService.createCredentialProvisionTask({
            subscriptionId,
            userId,
            orderId: subscriptionResult.data.order_id ?? null,
            notes: `MMU acknowledgement received for subscription ${subscriptionId}.`,
          });

          await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
            status_reason: 'mmu_acknowledged',
          });
        }

        const { credentials_encrypted: _credentials, ...safeSelection } =
          acknowledgedSelection;

        return SuccessResponses.ok(reply, {
          selection: safeSelection,
          locked: Boolean(acknowledgedSelection.locked_at),
        });
      } catch (error) {
        Logger.error('Manual monthly acknowledgement failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to acknowledge manual monthly upgrade'
        );
      }
    }
  );

  // Submit upgrade selection (requires auth)
  fastify.post<{
    Params: { subscriptionId: string };
    Body: {
      selection_type: string;
      account_identifier?: string | null;
      credentials?: string | null;
      manual_monthly_acknowledged?: boolean;
    };
  }>(
    '/:subscriptionId/upgrade-selection',
    {
      preHandler: [authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
        body: {
          type: 'object',
          required: ['selection_type'],
          properties: {
            selection_type: {
              type: 'string',
              enum: ['upgrade_new_account', 'upgrade_own_account'],
            },
            account_identifier: { type: ['string', 'null'], maxLength: 200 },
            credentials: { type: ['string', 'null'], maxLength: 5000 },
            manual_monthly_acknowledged: { type: 'boolean' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { subscriptionId: string };
        Body: {
          selection_type: string;
          account_identifier?: string | null;
          credentials?: string | null;
          manual_monthly_acknowledged?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { subscriptionId } = request.params;
        if (!validateSubscriptionId(subscriptionId)) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid subscription ID format'
          );
        }

        const validation = validateUpgradeSelectionSubmission(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            HttpStatus.BAD_REQUEST,
            'Invalid selection payload',
            validation.error.details,
            validation.error.code,
            validation.details
          );
        }

        const subscriptionResult =
          await subscriptionService.getSubscriptionById(subscriptionId, userId);

        if (!subscriptionResult.success || !subscriptionResult.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        const selection =
          await upgradeSelectionService.getSelectionForSubscriptionUser(
            subscriptionId,
            userId
          );
        if (!selection) {
          return ErrorResponses.badRequest(
            reply,
            'Upgrade selection is not available for this subscription'
          );
        }

        if (selection.locked_at) {
          return sendError(
            reply,
            HttpStatus.CONFLICT,
            'Selection locked',
            'Upgrade selection is already submitted',
            'SELECTION_LOCKED'
          );
        }

        const upgradeValidation = validateUpgradeOptions(
          selection.upgrade_options_snapshot
        );
        if (!upgradeValidation.valid) {
          Logger.error('Invalid upgrade options snapshot', {
            subscriptionId,
            reason: upgradeValidation.reason,
          });
          return ErrorResponses.internalError(
            reply,
            'Upgrade selection is unavailable'
          );
        }

        const selectionType = validation.data.selection_type;
        const allowNew =
          selection.upgrade_options_snapshot.allow_new_account === true;
        const allowOwn =
          selection.upgrade_options_snapshot.allow_own_account === true;
        const manualMonthly =
          selection.upgrade_options_snapshot.manual_monthly_upgrade === true;
        const ownAccountRequiresPassword =
          ownAccountCredentialRequirementRequiresPassword(
            selection.upgrade_options_snapshot
          );

        if (selectionType === 'upgrade_new_account' && !allowNew) {
          return ErrorResponses.badRequest(
            reply,
            'Upgrade new account is not available for this subscription'
          );
        }

        if (selectionType === 'upgrade_own_account' && !allowOwn) {
          return ErrorResponses.badRequest(
            reply,
            'Upgrade own account is not available for this subscription'
          );
        }

        const accountIdentifier =
          validation.data.account_identifier?.trim() || null;
        const credentials = validation.data.credentials?.trim() || null;

        if (selectionType === 'upgrade_own_account') {
          if (!accountIdentifier) {
            return ErrorResponses.badRequest(
              reply,
              'Account email is required for own-account upgrades'
            );
          }
          if (ownAccountRequiresPassword && !credentials) {
            return ErrorResponses.badRequest(
              reply,
              'Account password is required for this own-account upgrade'
            );
          }
        }

        if (manualMonthly && !validation.data.manual_monthly_acknowledged) {
          return ErrorResponses.badRequest(
            reply,
            'Manual monthly upgrade acknowledgement is required'
          );
        }

        const submittedSelection =
          await upgradeSelectionService.submitSelection({
            subscriptionId,
            selectionType: selectionType as any,
            accountIdentifier:
              selectionType === 'upgrade_own_account'
                ? accountIdentifier
                : null,
            credentials:
              selectionType === 'upgrade_own_account' ? credentials : null,
            manualMonthlyAcknowledgedAt: manualMonthly ? new Date() : null,
          });

        if (!submittedSelection) {
          return sendError(
            reply,
            HttpStatus.CONFLICT,
            'Selection locked',
            'Upgrade selection is already submitted',
            'SELECTION_LOCKED'
          );
        }

        const orderItemId = subscriptionResult.data.order_item_id;
        if (orderItemId) {
          await orderItemUpgradeSelectionService.upsertSelection({
            orderItemId,
            selectionType: selectionType as any,
            accountIdentifier:
              selectionType === 'upgrade_own_account'
                ? accountIdentifier
                : null,
            credentials:
              selectionType === 'upgrade_own_account' ? credentials : null,
            manualMonthlyAcknowledgedAt: manualMonthly ? new Date() : null,
          });
        }

        const noteParts = [
          `Selection submitted: ${selectionType}.`,
          `Subscription ${subscriptionId}.`,
        ];
        if (selectionType === 'upgrade_own_account') {
          if (ownAccountRequiresPassword) {
            noteParts.push(
              'User provided own account email and password. Enter "User provided credentials" before delivery.'
            );
          } else {
            noteParts.push(
              'User provided own account email only. Use provided email to complete delivery.'
            );
          }
        }

        await subscriptionService.createCredentialProvisionTask({
          subscriptionId,
          userId,
          orderId: subscriptionResult.data.order_id ?? null,
          notes: noteParts.join(' '),
        });

        await subscriptionService.completeSelectionPendingTasks({
          subscriptionId,
          note: `[${new Date().toISOString()}] Selection submitted`,
        });

        await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
          status_reason: 'selection_submitted',
        });

        const { credentials_encrypted: _credentials, ...safeSelection } =
          submittedSelection;

        return SuccessResponses.ok(reply, {
          selection: safeSelection,
          locked: true,
        });
      } catch (error) {
        Logger.error('Upgrade selection submission failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to submit upgrade selection'
        );
      }
    }
  );

  // Get user's subscriptions (requires auth)
  fastify.get<{
    Querystring: {
      service_type?: ServiceType;
      status?: string;
      page?: number;
      limit?: number;
      offset?: number;
      include_expired?: boolean;
    };
  }>(
    '/my-subscriptions',
    {
      preHandler: [
        subscriptionQueryRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
      schema: {
        querystring: FastifySchemas.mySubscriptionsQuery,
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          service_type?: ServiceType;
          status?: string;
          page?: number;
          limit?: number;
          offset?: number;
          include_expired?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const preferredCurrency = resolveRequestCurrency(request);

        // Handle page-based pagination (frontend sends 'page', backend uses 'offset')
        const limit = Number(request.query.limit || 20);
        const pageFromQuery = Number((request.query as any).page || 1);
        const offset =
          request.query.offset !== undefined
            ? Number(request.query.offset)
            : (pageFromQuery - 1) * limit;
        const page = Math.max(1, Math.floor(offset / limit) + 1);

        const query = {
          ...(request.query.service_type && {
            service_type: request.query.service_type,
          }),
          ...(request.query.status && {
            status: request.query.status as any,
          }),
          limit,
          offset,
          include_expired: request.query.include_expired || false,
        };

        Logger.info('Fetching user subscriptions', { userId, query });

        const result = await subscriptionService.getUserSubscriptionsWithCount(
          userId,
          query
        );

        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve subscriptions'
          );
        }

        const subscriptions = result.data?.subscriptions || [];
        const totalCount = result.data?.total || 0;
        const now = new Date();
        const msPerDay = 1000 * 60 * 60 * 24;
        const subscriptionsWithDerived = subscriptions.map(subscription => {
          const { credentials_encrypted: _credentials, ...safeSubscription } =
            subscription;
          if (
            safeSubscription.status !== 'active' ||
            safeSubscription.cancellation_requested_at ||
            safeSubscription.status_reason === 'cancelled_by_user'
          ) {
            return {
              ...safeSubscription,
              renewal_state: null,
              days_until_renewal: null,
            };
          }

          const { state, daysUntil } = getRenewalState({
            autoRenew: safeSubscription.auto_renew ?? null,
            nextBillingAt: safeSubscription.next_billing_at ?? null,
            renewalDate: safeSubscription.renewal_date ?? null,
            now,
          });

          return {
            ...safeSubscription,
            renewal_state: state,
            days_until_renewal: daysUntil,
          };
        });

        const variantIds = subscriptionsWithDerived
          .map(subscription => subscription.product_variant_id)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          );

        const priceMap: Map<string, PriceHistory> =
          variantIds.length > 0
            ? await catalogService.listCurrentPricesForCurrency({
                variantIds,
                currency: preferredCurrency,
              })
            : new Map<string, PriceHistory>();

        const subscriptionsWithDisplay = subscriptionsWithDerived.map(
          subscription => {
            const variantId = subscription.product_variant_id;
            const currentPrice = variantId ? priceMap.get(variantId) : null;
            const basePriceCents = currentPrice
              ? Number(currentPrice.price_cents)
              : Number.NaN;
            const resolvedCurrency = normalizeCurrencyCode(
              currentPrice?.currency
            );
            if (!Number.isFinite(basePriceCents) || !resolvedCurrency) {
              return subscription;
            }

            const termMonths = subscription.term_months ?? 1;
            const discountPercent = subscription.discount_percent ?? 0;
            const snapshot = computeTermPricing({
              basePriceCents,
              termMonths,
              discountPercent,
            });

            return {
              ...subscription,
              display_price_cents: snapshot.totalPriceCents,
              display_currency: resolvedCurrency,
            };
          }
        );

        const expiringNotifications = subscriptionsWithDerived
          .filter(subscription => {
            if (subscription.status !== 'active') return false;
            if (subscription.auto_renew !== false) return false;
            if (
              subscription.renewal_method !== 'stripe' &&
              subscription.renewal_method !== 'credits'
            ) {
              return false;
            }
            if (!subscription.end_date) return false;
            const endDate = new Date(subscription.end_date);
            if (Number.isNaN(endDate.getTime())) return false;
            const daysUntilExpiry = Math.ceil(
              (endDate.getTime() - now.getTime()) / msPerDay
            );
            return daysUntilExpiry === 7 || daysUntilExpiry === 3;
          })
          .map(subscription => {
            const endDate = new Date(subscription.end_date);
            const daysUntilExpiry = Math.ceil(
              (endDate.getTime() - now.getTime()) / msPerDay
            );
            const serviceLabel = formatSubscriptionDisplayName({
              productName: subscription.product_name ?? null,
              variantName: subscription.variant_name ?? null,
              serviceType: subscription.service_type,
              servicePlan: subscription.service_plan,
              termMonths: subscription.term_months ?? null,
            });
            const subscriptionShort = formatSubscriptionShortId(
              subscription.id
            );
            const message = `Your ${serviceLabel} subscription (${subscriptionShort}) expires in ${daysUntilExpiry} days. Place a new order to avoid delays or expiration.`;
            const endDateIso = endDate.toISOString();
            const reminderHours = daysUntilExpiry * 24;
            const title =
              daysUntilExpiry === 7
                ? 'Subscription expiring soon'
                : 'Subscription expiring in 3 days';

            return {
              userId,
              type: 'subscription_expiring' as const,
              title,
              message,
              metadata: {
                subscription_id: subscription.id,
                renewal_method: subscription.renewal_method,
                expires_at: endDateIso,
                days_until_expiry: daysUntilExpiry,
                link: '/dashboard/orders',
              },
              subscriptionId: subscription.id,
              dedupeKey: `subscription_expiring:${subscription.id}:${reminderHours}:${endDateIso}`,
            };
          });

        if (expiringNotifications.length > 0) {
          const createResult = await notificationService.createNotifications(
            expiringNotifications
          );
          if (!createResult.success) {
            Logger.warn(
              'Failed to create expiring subscription notifications',
              {
                userId,
                error: createResult.error,
              }
            );
          }
        }

        // Calculate proper pagination values
        const totalPages = Math.ceil(totalCount / limit);
        const hasNext = page < totalPages;
        const hasPrevious = page > 1;

        return SuccessResponses.ok(reply, {
          subscriptions: subscriptionsWithDisplay,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext,
            hasPrevious,
          },
        });
      } catch (error) {
        Logger.error('Failed to fetch user subscriptions:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve subscriptions'
        );
      }
    }
  );

  // Get specific subscription (requires auth + ownership)
  fastify.get<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId',
    {
      preHandler: [
        subscriptionQueryRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { subscriptionId } = request.params;

        if (!validateSubscriptionId(subscriptionId)) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid subscription ID format'
          );
        }

        Logger.info('Fetching subscription by ID', {
          userId,
          subscriptionId,
        });

        const result = await subscriptionService.getSubscriptionById(
          subscriptionId,
          userId
        );

        if (!result.success || !result.data) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }

        const { credentials_encrypted: _credentials, ...safeSubscription } =
          result.data;

        return SuccessResponses.ok(reply, {
          subscription: safeSubscription,
        });
      } catch (error) {
        Logger.error('Failed to fetch subscription:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve subscription'
        );
      }
    }
  );

  // Deprecated: Stripe auto-renew endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/auto-renew/enable',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated auto-renew endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:auto-renew:enable',
      });
      return sendAutoRenewDeprecated(reply);
    }
  );

  // Deprecated: Stripe auto-renew confirmation endpoint
  fastify.post<{
    Params: { subscriptionId: string };
    Body: { setup_intent_id: string };
  }>(
    '/:subscriptionId/auto-renew/confirm',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
        body: FastifySchemas.autoRenewConfirmInput,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { subscriptionId: string };
        Body: { setup_intent_id: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated auto-renew endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:auto-renew:confirm',
      });
      return sendAutoRenewDeprecated(reply);
    }
  );

  // Deprecated: credits auto-renew endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/auto-renew/credits/enable',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated auto-renew endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:auto-renew:credits-enable',
      });
      return sendAutoRenewDeprecated(reply);
    }
  );

  // Deprecated: Stripe auto-renew disable endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/auto-renew/disable',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated auto-renew endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:auto-renew:disable',
      });
      return sendAutoRenewDeprecated(reply);
    }
  );

  // Deprecated: manual credits renewal endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/renewal/credits',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated manual renewal endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:renewal:credits',
      });
      return sendManualRenewalDeprecated(reply);
    }
  );

  // Deprecated: manual card renewal checkout endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/renewal/checkout',
    {
      preHandler: [subscriptionOperationRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{ Params: { subscriptionId: string } }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }

      Logger.info('Deprecated manual renewal endpoint requested', {
        userId,
        subscriptionId,
        endpoint: 'subscriptions:renewal:checkout',
      });
      return sendManualRenewalDeprecated(reply);
    }
  );

  // Deprecated: credential reveal moved to order-centric endpoint
  fastify.post<{
    Params: { subscriptionId: string };
  }>(
    '/:subscriptionId/credentials/reveal',
    {
      preHandler: [credentialRevealRateLimit, authPreHandler],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { subscriptionId: string };
      }>,
      reply: FastifyReply
    ) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { subscriptionId } = request.params;
      if (!validateSubscriptionId(subscriptionId)) {
        return ErrorResponses.badRequest(
          reply,
          'Invalid subscription ID format'
        );
      }
      await logCredentialRevealAttempt(request, {
        subscriptionId,
        success: false,
        failureReason: 'moved_to_orders',
      });
      return sendCredentialRevealMoved(reply);
    }
  );

  // Cancel subscription (requires auth + ownership)
  fastify.delete<{
    Params: { subscriptionId: string };
    Body: { reason: string };
  }>(
    '/:subscriptionId',
    {
      preHandler: [
        subscriptionOperationRateLimit, // Rate limit BEFORE auth
        authPreHandler,
      ],
      schema: {
        params: FastifySchemas.subscriptionIdParam,
        body: FastifySchemas.cancelSubscriptionInput,
      },
    },
    async (
      request: FastifyRequest<{
        Params: { subscriptionId: string };
        Body: { reason: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { subscriptionId } = request.params;
        const { reason } = request.body;

        if (!validateSubscriptionId(subscriptionId)) {
          return ErrorResponses.badRequest(
            reply,
            'Invalid subscription ID format'
          );
        }

        Logger.info('Cancelling subscription', {
          userId,
          subscriptionId,
          reason,
        });

        const result = await subscriptionService.cancelSubscription(
          subscriptionId,
          userId,
          reason
        );

        if (!result.success) {
          if (result.error?.includes('not found')) {
            return ErrorResponses.notFound(reply, 'Subscription not found');
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to cancel subscription'
          );
        }

        try {
          await paymentService.cancelPendingStripeRenewalPayments([
            subscriptionId,
          ]);
        } catch (error) {
          Logger.warn('Failed to cancel pending renewal payments on cancel', {
            subscriptionId,
            error,
          });
        }

        return SuccessResponses.ok(reply, {
          message: 'Subscription cancelled successfully',
          subscription_id: subscriptionId,
          subscription: result.subscription,
        });
      } catch (error) {
        Logger.error('Failed to cancel subscription:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to cancel subscription'
        );
      }
    }
  );

  // Health check endpoint
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [serviceHealth, handlerHealth] = await Promise.all([
          subscriptionService.healthCheck(),
          serviceHandlerRegistry.healthCheck(),
        ]);

        const isHealthy =
          serviceHealth && Object.values(handlerHealth).every(Boolean);

        return SuccessResponses.ok(reply, {
          status: isHealthy ? 'healthy' : 'unhealthy',
          service: serviceHealth,
          handlers: handlerHealth,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Health check failed:', error);
        return sendError(
          reply,
          HttpStatus.SERVICE_UNAVAILABLE,
          'Service Unavailable',
          'Health check failed',
          'HEALTH_CHECK_ERROR',
          {
            status: 'error',
            timestamp: new Date().toISOString(),
          }
        );
      }
    }
  );
}
