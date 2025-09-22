import { z } from 'zod';

export const sessionCreateSchema = z.object({
  email: z.string().email().optional(),
  role: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const sessionUpdateSchema = z.object({
  email: z.string().email().optional(),
  role: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const sessionValidationSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const authHeaderSchema = z.object({
  authorization: z
    .string()
    .regex(/^Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/, 'Invalid JWT format')
    .optional(),
});

export const loginRequestSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const registerRequestSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const logoutRequestSchema = z.object({
  allDevices: z.boolean().optional().default(false),
});

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().optional(),
});

export const sessionMetadataSchema = z.record(z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.any()),
  z.record(z.any()),
]));

export const userSessionInfoSchema = z.object({
  sessionId: z.string(),
  createdAt: z.number(),
  lastAccessedAt: z.number(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  isCurrent: z.boolean().optional(),
});

export const sessionListResponseSchema = z.object({
  sessions: z.array(userSessionInfoSchema),
  totalCount: z.number(),
  currentSessionId: z.string().optional(),
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;
export type SessionValidationInput = z.infer<typeof sessionValidationSchema>;
export type AuthHeaderInput = z.infer<typeof authHeaderSchema>;
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;
export type LogoutRequestInput = z.infer<typeof logoutRequestSchema>;
export type RefreshTokenRequestInput = z.infer<typeof refreshTokenRequestSchema>;
export type SessionMetadataInput = z.infer<typeof sessionMetadataSchema>;
export type UserSessionInfoInput = z.infer<typeof userSessionInfoSchema>;
export type SessionListResponseInput = z.infer<typeof sessionListResponseSchema>;