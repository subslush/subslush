import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character'
  );

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'Email is required')
      .regex(emailRegex, 'Please enter a valid email address')
      .max(255, 'Email must be less than 255 characters')
      .toLowerCase()
      .trim(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .regex(emailRegex, 'Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters')
    .toLowerCase()
    .trim(),
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetConfirmSchema = z
  .object({
    accessToken: z.string().min(1, 'Reset token is required'),
    refreshToken: z.string().optional(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;

export interface AuthResponse {
  success: true;
  message: string;
  user: {
    id: string;
    email: string;
    created_at: string;
    last_login?: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
}

export function validateRegisterInput(
  data: unknown
):
  | { success: true; data: RegisterInput }
  | { success: false; error: ErrorResponse } {
  try {
    const validatedData = registerSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: {
            success: false,
            error: firstError.message,
            details: `Field: ${firstError.path.join('.')}`,
          },
        };
      }
    }
    return {
      success: false,
      error: {
        success: false,
        error: 'Invalid input data',
      },
    };
  }
}

export function validateLoginInput(
  data: unknown
):
  | { success: true; data: LoginInput }
  | { success: false; error: ErrorResponse } {
  try {
    const validatedData = loginSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: {
            success: false,
            error: firstError.message,
            details: `Field: ${firstError.path.join('.')}`,
          },
        };
      }
    }
    return {
      success: false,
      error: {
        success: false,
        error: 'Invalid input data',
      },
    };
  }
}

export function validatePasswordResetConfirmInput(
  data: unknown
):
  | { success: true; data: PasswordResetConfirmInput }
  | { success: false; error: ErrorResponse } {
  try {
    const validatedData = passwordResetConfirmSchema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      if (firstError) {
        return {
          success: false,
          error: {
            success: false,
            error: firstError.message,
            details: `Field: ${firstError.path.join('.')}`,
          },
        };
      }
    }
    return {
      success: false,
      error: {
        success: false,
        error: 'Invalid input data',
      },
    };
  }
}
