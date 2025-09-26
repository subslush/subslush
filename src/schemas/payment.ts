import { z } from 'zod';

export const paymentStatusSchema = z.enum([
  'pending',
  'waiting',
  'confirming',
  'confirmed',
  'sending',
  'partially_paid',
  'finished',
  'failed',
  'refunded',
  'expired',
]);

export const paymentProviderSchema = z.enum(['nowpayments', 'manual', 'admin']);

export const createPaymentRequestSchema = z.object({
  creditAmount: z
    .number()
    .min(1, 'Credit amount must be at least 1')
    .max(10000, 'Credit amount cannot exceed 10,000'),
  currency: z
    .string()
    .regex(/^[A-Z]{2,10}$/, 'Currency must be 2-10 uppercase letters')
    .optional(),
  orderDescription: z
    .string()
    .max(500, 'Order description cannot exceed 500 characters')
    .optional(),
});

export const paymentStatusRequestSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
});

export const paymentHistoryQuerySchema = z.object({
  status: paymentStatusSchema.optional(),
  provider: paymentProviderSchema.optional(),
  startDate: z
    .string()
    .datetime('Invalid start date format')
    .transform(val => new Date(val))
    .optional(),
  endDate: z
    .string()
    .datetime('Invalid end date format')
    .transform(val => new Date(val))
    .optional(),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20),
  offset: z
    .number()
    .int()
    .min(0, 'Offset must be non-negative')
    .optional()
    .default(0),
});

export const webhookPayloadSchema = z.object({
  payment_id: z.string(),
  payment_status: paymentStatusSchema,
  pay_address: z.string(),
  price_amount: z.number(),
  price_currency: z.string(),
  pay_amount: z.number(),
  actually_paid: z.number().optional(),
  pay_currency: z.string(),
  order_id: z.string(),
  order_description: z.string().optional(),
  purchase_id: z.string(),
  outcome_amount: z.number().optional(),
  outcome_currency: z.string().optional(),
  payin_hash: z.string().optional(),
  payout_hash: z.string().optional(),
});

export const estimateRequestSchema = z.object({
  amount: z
    .number()
    .min(0.01, 'Amount must be at least 0.01')
    .max(100000, 'Amount cannot exceed 100,000'),
  currency_from: z.string().default('usd'),
  currency_to: z
    .string()
    .regex(/^[a-z]{2,10}$/, 'Currency must be 2-10 lowercase letters'),
});

// Fastify v5 native JSON schemas for route validation
export const createPaymentRequestJsonSchema = {
  type: 'object',
  required: ['creditAmount'],
  properties: {
    creditAmount: {
      type: 'number',
      minimum: 1,
      maximum: 10000,
    },
    currency: {
      type: 'string',
      pattern: '^[A-Z]{2,10}$',
    },
    orderDescription: {
      type: 'string',
      maxLength: 500,
    },
  },
  additionalProperties: false,
} as const;

export const paymentStatusRequestJsonSchema = {
  type: 'object',
  required: ['paymentId'],
  properties: {
    paymentId: {
      type: 'string',
      minLength: 1,
    },
  },
  additionalProperties: false,
} as const;

export const paymentHistoryQueryJsonSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: [
        'pending',
        'waiting',
        'confirming',
        'confirmed',
        'sending',
        'partially_paid',
        'finished',
        'failed',
        'refunded',
        'expired',
      ],
    },
    provider: {
      type: 'string',
      enum: ['nowpayments', 'manual', 'admin'],
    },
    startDate: {
      type: 'string',
      format: 'date-time',
    },
    endDate: {
      type: 'string',
      format: 'date-time',
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 100,
      default: 20,
    },
    offset: {
      type: 'number',
      minimum: 0,
      default: 0,
    },
  },
  additionalProperties: false,
} as const;

export const webhookPayloadJsonSchema = {
  type: 'object',
  required: [
    'payment_id',
    'payment_status',
    'pay_address',
    'price_amount',
    'price_currency',
    'pay_amount',
    'pay_currency',
    'order_id',
    'purchase_id',
  ],
  properties: {
    payment_id: { type: 'string' },
    payment_status: {
      type: 'string',
      enum: [
        'pending',
        'waiting',
        'confirming',
        'confirmed',
        'sending',
        'partially_paid',
        'finished',
        'failed',
        'refunded',
        'expired',
      ],
    },
    pay_address: { type: 'string' },
    price_amount: { type: 'number' },
    price_currency: { type: 'string' },
    pay_amount: { type: 'number' },
    actually_paid: { type: 'number' },
    pay_currency: { type: 'string' },
    order_id: { type: 'string' },
    order_description: { type: 'string' },
    purchase_id: { type: 'string' },
    outcome_amount: { type: 'number' },
    outcome_currency: { type: 'string' },
    payin_hash: { type: 'string' },
    payout_hash: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export const estimateRequestJsonSchema = {
  type: 'object',
  required: ['amount', 'currency_to'],
  properties: {
    amount: {
      type: 'number',
      minimum: 0.01,
      maximum: 100000,
    },
    currency_from: {
      type: 'string',
      default: 'usd',
    },
    currency_to: {
      type: 'string',
      pattern: '^[a-z]{2,10}$',
    },
  },
  additionalProperties: false,
} as const;

// Type exports for use in routes
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;
export type PaymentStatusRequest = z.infer<typeof paymentStatusRequestSchema>;
export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
