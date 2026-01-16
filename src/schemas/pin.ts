import { z } from 'zod';

const pinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

const pinTokenSchema = z.object({
  pin_token: z.string().min(10, 'PIN token is required'),
});

export type PinInput = z.infer<typeof pinSchema>;
export type PinTokenInput = z.infer<typeof pinTokenSchema>;

export function validatePinInput(
  data: unknown
):
  | { success: true; data: PinInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = pinSchema.parse(data);
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

export function validatePinTokenInput(
  data: unknown
):
  | { success: true; data: PinTokenInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = pinTokenSchema.parse(data);
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
