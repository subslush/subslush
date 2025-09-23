import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Profile update schema
export const updateProfileSchema = z.object({
  email: z
    .string()
    .regex(emailRegex, 'Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim()
    .optional(),
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name must be less than 50 characters')
    .trim()
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name cannot be empty')
    .max(50, 'Last name must be less than 50 characters')
    .trim()
    .optional(),
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(100, 'Display name must be less than 100 characters')
    .trim()
    .optional(),
  timezone: z
    .string()
    .max(50, 'Timezone must be less than 50 characters')
    .optional(),
  languagePreference: z
    .string()
    .max(10, 'Language preference must be less than 10 characters')
    .optional(),
  notificationPreferences: z
    .object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .optional(),
});

// User status update schema (admin only)
export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended', 'deleted'], {
    message: 'Status must be one of: active, inactive, suspended, deleted',
  }),
  reason: z
    .string()
    .min(1, 'Reason is required for status changes')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});

// Profile query parameters schema
export const profileQuerySchema = z.object({
  includeMetadata: z
    .string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .optional(),
  includeSessions: z
    .string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type ProfileQueryInput = z.infer<typeof profileQuerySchema>;

export interface ProfileResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  role?: string;
  status: string;
  timezone?: string;
  languagePreference?: string;
  notificationPreferences?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
    marketing?: boolean;
  };
  createdAt: string;
  lastLoginAt?: string;
  profileUpdatedAt?: string;
}

export interface UserStatusChange {
  userId: string;
  oldStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string;
  changedAt: string;
}

export function validateUpdateProfileInput(
  data: unknown
):
  | { success: true; data: UpdateProfileInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = updateProfileSchema.parse(data);
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
    return {
      success: false,
      error: 'Invalid input data',
    };
  }
}

export function validateUpdateUserStatusInput(
  data: unknown
):
  | { success: true; data: UpdateUserStatusInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = updateUserStatusSchema.parse(data);
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
    return {
      success: false,
      error: 'Invalid input data',
    };
  }
}

export function validateProfileQueryInput(
  data: unknown
):
  | { success: true; data: ProfileQueryInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = profileQuerySchema.parse(data);
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
    return {
      success: false,
      error: 'Invalid input data',
    };
  }
}
