import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const uuidSchema = z.string().uuid('Invalid UUID format');
const optionalCheckoutSessionKeySchema = z.preprocess(value => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}, z.string().min(8, 'Checkout session key must be at least 8 characters').max(256, 'Checkout session key is too long').nullable().optional());

export const guestIdentitySchema = z.object({
  email: z
    .string()
    .regex(emailRegex, 'Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
});

export type GuestIdentityInput = z.infer<typeof guestIdentitySchema>;

export const guestDraftItemSchema = z.object({
  variant_id: uuidSchema,
  term_months: z
    .number()
    .int('Term months must be an integer')
    .positive('Term months must be greater than 0')
    .optional(),
  auto_renew: z.boolean().optional(),
  selection_type: z
    .enum(['upgrade_new_account', 'upgrade_own_account'])
    .optional()
    .nullable(),
  account_identifier: z.string().max(255).optional().nullable(),
  credentials: z.string().max(4000).optional().nullable(),
  manual_monthly_acknowledged: z.boolean().optional().nullable(),
});

export const guestDraftSchema = z.object({
  checkout_session_key: optionalCheckoutSessionKeySchema,
  guest_identity_id: uuidSchema,
  contact_email: z
    .string()
    .regex(emailRegex, 'Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
  currency: z
    .string()
    .min(3, 'Currency code is required')
    .max(10, 'Currency code is too long')
    .transform(value => value.toUpperCase()),
  items: z.array(guestDraftItemSchema).min(1, 'At least one item is required'),
  coupon_code: z
    .string()
    .max(64, 'Coupon code is too long')
    .optional()
    .nullable(),
});

export type GuestDraftInput = z.infer<typeof guestDraftSchema>;

export const guestClaimSchema = z.object({
  token: z.string().min(10, 'Token is required').max(512),
});

export type GuestClaimInput = z.infer<typeof guestClaimSchema>;

const checkoutSessionKeySchema = optionalCheckoutSessionKeySchema;

export const checkoutStripeSessionSchema = z.object({
  checkout_session_key: checkoutSessionKeySchema,
  order_id: uuidSchema.optional().nullable(),
  success_url: z
    .string()
    .url('Success URL must be valid')
    .optional()
    .nullable(),
  cancel_url: z.string().url('Cancel URL must be valid').optional().nullable(),
});

export type CheckoutStripeSessionInput = z.infer<
  typeof checkoutStripeSessionSchema
>;

export const checkoutCreditsCompleteSchema = z.object({
  checkout_session_key: checkoutSessionKeySchema,
  order_id: uuidSchema.optional().nullable(),
});

export type CheckoutCreditsCompleteInput = z.infer<
  typeof checkoutCreditsCompleteSchema
>;

export const checkoutNowPaymentsInvoiceSchema = z.object({
  checkout_session_key: checkoutSessionKeySchema,
  order_id: uuidSchema.optional().nullable(),
  pay_currency: z
    .string()
    .regex(
      /^[a-z0-9]{2,15}$/,
      'Currency must be 2-15 lowercase letters or digits'
    )
    .optional()
    .nullable(),
  force_new_invoice: z.boolean().optional().nullable(),
  success_url: z
    .string()
    .url('Success URL must be valid')
    .optional()
    .nullable(),
  cancel_url: z.string().url('Cancel URL must be valid').optional().nullable(),
});

export type CheckoutNowPaymentsInvoiceInput = z.infer<
  typeof checkoutNowPaymentsInvoiceSchema
>;

export const checkoutNowPaymentsMinimumSchema = z.object({
  checkout_session_key: checkoutSessionKeySchema,
  order_id: uuidSchema.optional().nullable(),
  pay_currency: z
    .string()
    .regex(
      /^[a-z0-9]{2,15}$/,
      'Currency must be 2-15 lowercase letters or digits'
    ),
});

export type CheckoutNowPaymentsMinimumInput = z.infer<
  typeof checkoutNowPaymentsMinimumSchema
>;

export const checkoutStripeConfirmSchema = z.object({
  order_id: uuidSchema,
  session_id: z
    .string()
    .min(10, 'Session ID is required')
    .max(255, 'Session ID is too long'),
});

export type CheckoutStripeConfirmInput = z.infer<
  typeof checkoutStripeConfirmSchema
>;

export function validateGuestIdentityInput(
  data: unknown
):
  | { success: true; data: GuestIdentityInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = guestIdentitySchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateGuestDraftInput(
  data: unknown
):
  | { success: true; data: GuestDraftInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = guestDraftSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateGuestClaimInput(
  data: unknown
):
  | { success: true; data: GuestClaimInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = guestClaimSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateCheckoutStripeSessionInput(
  data: unknown
):
  | { success: true; data: CheckoutStripeSessionInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = checkoutStripeSessionSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateCheckoutNowPaymentsInvoiceInput(
  data: unknown
):
  | { success: true; data: CheckoutNowPaymentsInvoiceInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = checkoutNowPaymentsInvoiceSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateCheckoutCreditsCompleteInput(
  data: unknown
):
  | { success: true; data: CheckoutCreditsCompleteInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = checkoutCreditsCompleteSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateCheckoutNowPaymentsMinimumInput(
  data: unknown
):
  | { success: true; data: CheckoutNowPaymentsMinimumInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = checkoutNowPaymentsMinimumSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}

export function validateCheckoutStripeConfirmInput(
  data: unknown
):
  | { success: true; data: CheckoutStripeConfirmInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = checkoutStripeConfirmSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: firstError.message,
          details: `Field: ${firstError.path.join('.')}`,
        };
      }
    }
    return { success: false, error: 'Invalid input data' };
  }
}
