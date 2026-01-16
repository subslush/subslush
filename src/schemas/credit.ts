import { z } from 'zod';

// Credit Transaction Types
export const CreditTransactionTypeSchema = z.enum([
  'deposit',
  'purchase',
  'refund',
  'bonus',
  'withdrawal',
  'refund_reversal',
]);

// Credit Transaction Schema
export const CreditTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: CreditTransactionTypeSchema,
  amount: z.number(),
  balanceBefore: z.number(),
  balanceAfter: z.number(),
  description: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Credit Balance Schema
export const CreditBalanceSchema = z.object({
  userId: z.string().uuid(),
  totalBalance: z.number(),
  availableBalance: z.number(),
  pendingBalance: z.number(),
  lastUpdated: z.coerce.date(),
});

// Input Schemas
export const AddCreditsInputSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  type: z.enum(['deposit', 'bonus']),
  description: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const SpendCreditsInputSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  description: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const RefundCreditsInputSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  description: z.string().min(1).max(500),
  originalTransactionId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const GetTransactionHistoryInputSchema = z.object({
  userId: z.string().uuid(),
  type: CreditTransactionTypeSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

// Response Schemas
export const CreditBalanceResponseSchema = z.object({
  totalBalance: z.number(),
  availableBalance: z.number(),
  pendingBalance: z.number(),
});

export const CreditBalanceSummaryResponseSchema = z.object({
  totalBalance: z.number(),
  availableBalance: z.number(),
  pendingBalance: z.number(),
  recentTransactions: z.array(CreditTransactionSchema),
  transactionCount: z.number(),
});

export const CreditTransactionResponseSchema = z.object({
  transaction: CreditTransactionSchema,
  newBalance: CreditBalanceSchema,
});

export const CreditTransactionHistoryResponseSchema = z.object({
  transactions: z.array(CreditTransactionSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

// Parameter Schemas
export const UserIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const TransactionIdParamSchema = z.object({
  transactionId: z.string().uuid(),
});

// Type exports
export type AddCreditsInput = z.infer<typeof AddCreditsInputSchema>;
export type SpendCreditsInput = z.infer<typeof SpendCreditsInputSchema>;
export type RefundCreditsInput = z.infer<typeof RefundCreditsInputSchema>;
export type GetTransactionHistoryInput = z.infer<
  typeof GetTransactionHistoryInputSchema
>;
export type CreditBalanceResponse = z.infer<typeof CreditBalanceResponseSchema>;
export type CreditBalanceSummaryResponse = z.infer<
  typeof CreditBalanceSummaryResponseSchema
>;
export type CreditTransactionResponse = z.infer<
  typeof CreditTransactionResponseSchema
>;
export type CreditTransactionHistoryResponse = z.infer<
  typeof CreditTransactionHistoryResponseSchema
>;
export type UserIdParam = z.infer<typeof UserIdParamSchema>;
export type TransactionIdParam = z.infer<typeof TransactionIdParamSchema>;
