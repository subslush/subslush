import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const newsletterSubscribeSchema = z.object({
  email: z
    .string()
    .regex(emailRegex, 'Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
  source: z
    .string()
    .max(60, 'Source must be less than 60 characters')
    .optional(),
});

export type NewsletterSubscribeInput = z.infer<
  typeof newsletterSubscribeSchema
>;

export function validateNewsletterSubscribeInput(
  data: unknown
):
  | { success: true; data: NewsletterSubscribeInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = newsletterSubscribeSchema.parse(data);
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
