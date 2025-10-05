import { z } from 'zod';

export const purchaseFormSchema = z.object({
  service_type: z.enum(['spotify', 'netflix', 'tradingview'], {
    required_error: 'Please select a service type'
  }),
  service_plan: z.enum(['premium', 'family', 'basic', 'standard', 'pro', 'individual'], {
    required_error: 'Please select a service plan'
  }),
  duration_months: z.number().min(1, 'Duration must be at least 1 month').max(12, 'Duration cannot exceed 12 months').default(1),
  auto_renew: z.boolean().default(false)
});

export const subscriptionQuerySchema = z.object({
  service_type: z.enum(['spotify', 'netflix', 'tradingview']).optional(),
  status: z.enum(['active', 'expired', 'cancelled', 'pending']).optional(),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional()
});

export const validatePurchaseSchema = z.object({
  service_type: z.enum(['spotify', 'netflix', 'tradingview']),
  service_plan: z.enum(['premium', 'family', 'basic', 'standard', 'pro', 'individual']),
  duration_months: z.number().min(1).max(12).optional()
});

export type PurchaseFormData = z.infer<typeof purchaseFormSchema>;
export type SubscriptionQueryData = z.infer<typeof subscriptionQuerySchema>;
export type ValidatePurchaseData = z.infer<typeof validatePurchaseSchema>;