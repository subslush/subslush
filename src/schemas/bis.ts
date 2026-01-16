import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const BIS_TOPICS = ['bug', 'issue', 'suggestion'] as const;

const countWords = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

export const bisInquirySchema = z
  .object({
    email: z
      .string()
      .regex(emailRegex, 'Please enter a valid email address')
      .max(255, 'Email must be less than 255 characters')
      .toLowerCase()
      .trim(),
    topic: z.enum(BIS_TOPICS, {
      message: 'Please select a valid topic',
    }),
    message: z.string().trim().min(1, 'Message is required'),
  })
  .superRefine((data, ctx) => {
    const words = countWords(data.message);
    if (words < 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message must be at least 30 words',
        path: ['message'],
      });
    }
    if (words > 3000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message must be 3000 words or fewer',
        path: ['message'],
      });
    }
  });

export type BisInquiryInput = z.infer<typeof bisInquirySchema>;

export function validateBisInquiryInput(
  data: unknown
):
  | { success: true; data: BisInquiryInput }
  | { success: false; error: string; details?: string } {
  try {
    const validatedData = bisInquirySchema.parse(data);
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

export const getBisMessageWordCount = countWords;
