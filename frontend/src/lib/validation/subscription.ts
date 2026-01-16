import { z } from 'zod';

export const purchaseFormSchema = z.object({
  variant_id: z.string().min(1, 'Please select a subscription option'),
  duration_months: z
    .number()
    .min(1, 'Duration must be at least 1 month')
    .default(1),
  auto_renew: z.boolean().default(true)
});

export const subscriptionQuerySchema = z.object({
  service_type: z.string().min(1).optional(),
  status: z.enum(['active', 'expired', 'cancelled', 'pending']).optional(),
  limit: z.number().min(1).max(100).optional(),
  page: z.number().min(1).optional()
});

export const validatePurchaseSchema = z.object({
  variant_id: z.string().min(1),
  duration_months: z.number().min(1).optional()
});

export type PurchaseFormData = z.infer<typeof purchaseFormSchema>;
export type SubscriptionQueryData = z.infer<typeof subscriptionQuerySchema>;
export type ValidatePurchaseData = z.infer<typeof validatePurchaseSchema>;
