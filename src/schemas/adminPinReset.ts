import { z } from 'zod';

const pinResetRequestSchema = z.object({
  user_id: z.string().uuid('User ID must be a valid UUID'),
});

const pinResetConfirmSchema = z.object({
  user_id: z.string().uuid('User ID must be a valid UUID'),
  code: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'Verification code must be exactly 9 digits'),
});

export type AdminPinResetRequestInput = z.infer<typeof pinResetRequestSchema>;
export type AdminPinResetConfirmInput = z.infer<typeof pinResetConfirmSchema>;

export function validateAdminPinResetRequestInput(
  data: unknown
):
  | { success: true; data: AdminPinResetRequestInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = pinResetRequestSchema.parse(data);
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

export function validateAdminPinResetConfirmInput(
  data: unknown
):
  | { success: true; data: AdminPinResetConfirmInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = pinResetConfirmSchema.parse(data);
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
