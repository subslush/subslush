import { z } from 'zod';
import {
  ServiceType,
  ServicePlan,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionQuery,
  StatusUpdateInput,
  SERVICE_PLAN_COMPATIBILITY,
} from '../types/subscription';

const serviceTypeSchema = z.enum(['spotify', 'netflix', 'tradingview']);
const subscriptionStatusSchema = z.enum([
  'active',
  'expired',
  'cancelled',
  'pending',
]);
const servicePlanSchema = z.enum([
  'premium',
  'family',
  'basic',
  'standard',
  'pro',
  'individual',
]);

const spotifyMetadataSchema = z.object({
  region: z.string().min(2).max(10),
  payment_method: z.string().min(1).max(50),
  screens: z.number().int().min(1).max(6).optional(),
});

const netflixMetadataSchema = z.object({
  screens: z.number().int().min(1).max(4),
  region: z.string().min(2).max(10),
  quality: z.enum(['SD', 'HD', '4K']),
  profiles: z.number().int().min(1).max(5).optional(),
});

const tradingViewMetadataSchema = z.object({
  charts: z.enum(['limited', 'unlimited']),
  alerts_count: z.number().int().min(0).max(10000),
  region: z.string().min(2).max(10),
});

const subscriptionMetadataSchema = z.union([
  spotifyMetadataSchema,
  netflixMetadataSchema,
  tradingViewMetadataSchema,
]);

const uuidSchema = z.string().uuid('Invalid UUID format');

export const subscriptionIdSchema = uuidSchema;

export const createSubscriptionSchema = z
  .object({
    service_type: serviceTypeSchema,
    service_plan: servicePlanSchema,
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    renewal_date: z.coerce.date(),
    credentials_encrypted: z.string().optional(),
    metadata: subscriptionMetadataSchema.optional(),
  })
  .refine(
    data => {
      // Validate date order
      if (data.start_date >= data.end_date) {
        return false;
      }
      if (data.renewal_date < data.start_date) {
        return false;
      }
      return true;
    },
    {
      message:
        'Invalid date order: start_date must be before end_date, and renewal_date must be after start_date',
    }
  )
  .refine(
    data => {
      // Validate service plan compatibility
      const validPlans = SERVICE_PLAN_COMPATIBILITY[data.service_type];
      return validPlans.includes(data.service_plan);
    },
    {
      message: 'Invalid service plan for the specified service type',
    }
  )
  .refine(
    data => {
      // Validate metadata matches service type
      if (!data.metadata) return true;

      switch (data.service_type) {
        case 'spotify':
          return spotifyMetadataSchema.safeParse(data.metadata).success;
        case 'netflix':
          return netflixMetadataSchema.safeParse(data.metadata).success;
        case 'tradingview':
          return tradingViewMetadataSchema.safeParse(data.metadata).success;
        default:
          return false;
      }
    },
    {
      message: 'Metadata schema does not match the service type',
    }
  );

export const updateSubscriptionSchema = z
  .object({
    service_plan: servicePlanSchema.optional(),
    end_date: z.coerce.date().optional(),
    renewal_date: z.coerce.date().optional(),
    credentials_encrypted: z.string().optional(),
    metadata: subscriptionMetadataSchema.optional(),
  })
  .refine(
    data => {
      // If both dates are provided, validate order
      if (data.end_date && data.renewal_date) {
        return data.renewal_date <= data.end_date;
      }
      return true;
    },
    {
      message: 'renewal_date must be before or equal to end_date',
    }
  );

export const subscriptionQuerySchema = z.object({
  service_type: serviceTypeSchema.optional(),
  status: subscriptionStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  include_expired: z.boolean().optional().default(false),
});

export const statusUpdateSchema = z.object({
  status: subscriptionStatusSchema,
  reason: z.string().min(1).max(500),
  updated_by: uuidSchema,
});

export function validateCreateSubscription(
  data: unknown
):
  | { success: true; data: CreateSubscriptionInput }
  | {
      success: false;
      error: { message: string; details: string; code: string };
    } {
  try {
    const validatedData = createSubscriptionSchema.parse(data);
    return {
      success: true,
      data: validatedData as CreateSubscriptionInput,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return {
        success: false,
        error: {
          message: 'Validation failed',
          details: errorMessage,
          code: 'VALIDATION_ERROR',
        },
      };
    }
    return {
      success: false,
      error: {
        message: 'Unexpected validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_ERROR',
      },
    };
  }
}

export function validateUpdateSubscription(
  data: unknown
):
  | { success: true; data: UpdateSubscriptionInput }
  | {
      success: false;
      error: { message: string; details: string; code: string };
    } {
  try {
    const validatedData = updateSubscriptionSchema.parse(data);
    return {
      success: true,
      data: validatedData as UpdateSubscriptionInput,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return {
        success: false,
        error: {
          message: 'Validation failed',
          details: errorMessage,
          code: 'VALIDATION_ERROR',
        },
      };
    }
    return {
      success: false,
      error: {
        message: 'Unexpected validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_ERROR',
      },
    };
  }
}

export function validateSubscriptionQuery(
  data: unknown
):
  | { success: true; data: SubscriptionQuery }
  | {
      success: false;
      error: { message: string; details: string; code: string };
    } {
  try {
    const validatedData = subscriptionQuerySchema.parse(data);
    return {
      success: true,
      data: validatedData as SubscriptionQuery,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return {
        success: false,
        error: {
          message: 'Query validation failed',
          details: errorMessage,
          code: 'VALIDATION_ERROR',
        },
      };
    }
    return {
      success: false,
      error: {
        message: 'Unexpected validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_ERROR',
      },
    };
  }
}

export function validateStatusUpdate(
  data: unknown
):
  | { success: true; data: StatusUpdateInput }
  | {
      success: false;
      error: { message: string; details: string; code: string };
    } {
  try {
    const validatedData = statusUpdateSchema.parse(data);
    return {
      success: true,
      data: validatedData as StatusUpdateInput,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map((err: any) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return {
        success: false,
        error: {
          message: 'Status update validation failed',
          details: errorMessage,
          code: 'VALIDATION_ERROR',
        },
      };
    }
    return {
      success: false,
      error: {
        message: 'Unexpected validation error',
        details: error instanceof Error ? error.message : 'Unknown error',
        code: 'VALIDATION_ERROR',
      },
    };
  }
}

export function validateSubscriptionId(id: unknown): boolean {
  return subscriptionIdSchema.safeParse(id).success;
}

export function validateServicePlanForType(
  serviceType: ServiceType,
  servicePlan: ServicePlan
): boolean {
  const validPlans = SERVICE_PLAN_COMPATIBILITY[serviceType];
  return validPlans.includes(servicePlan);
}

export function validateSubscriptionDates(
  startDate: Date,
  endDate: Date,
  renewalDate: Date
): boolean {
  return (
    startDate < endDate && renewalDate >= startDate && renewalDate <= endDate
  );
}

export function validateMetadataForService(
  serviceType: ServiceType,
  metadata: unknown
): boolean {
  if (!metadata) return true;

  switch (serviceType) {
    case 'spotify':
      return spotifyMetadataSchema.safeParse(metadata).success;
    case 'netflix':
      return netflixMetadataSchema.safeParse(metadata).success;
    case 'tradingview':
      return tradingViewMetadataSchema.safeParse(metadata).success;
    default:
      return false;
  }
}
