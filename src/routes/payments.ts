import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/authMiddleware';
import { paymentRateLimit, webhookRateLimit } from '../middleware/paymentMiddleware';
import { paymentService } from '../services/paymentService';
import { SuccessResponses, ErrorResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import {
  createPaymentRequestJsonSchema,
  paymentHistoryQueryJsonSchema,
  webhookPayloadJsonSchema,
  estimateRequestJsonSchema,
} from '../schemas/payment';
import {
  CreatePaymentRequest,
  PaymentHistoryQuery,
  WebhookPayload,
} from '../types/payment';

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // Create payment invoice
  fastify.post(
    '/create-invoice',
    {
      schema: {
        body: createPaymentRequestJsonSchema,
      },
      preHandler: [authMiddleware(), paymentRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const body = request.body as CreatePaymentRequest;

        Logger.info(`Creating payment invoice for user ${user.id}`, {
          userId: user.id,
          creditAmount: body.creditAmount,
          currency: body.currency,
        });

        const result = await paymentService.createPayment(user.id, body);

        if (!result.success) {
          Logger.error(`Payment creation failed for user ${user.id}:`, result.error);
          return ErrorResponses.badRequest(reply, result.error || 'Payment creation failed');
        }

        const response = {
          paymentId: result.payment!.id,
          invoiceUrl: result.payment!.metadata?.['invoiceUrl'],
          payAddress: result.payment!.payAddress,
          payAmount: result.payment!.amount,
          payCurrency: result.payment!.currency,
          expiresAt: result.payment!.expiresAt,
          status: result.payment!.status,
        };

        return SuccessResponses.created(reply, response, 'Payment invoice created successfully');
      } catch (error) {
        Logger.error('Error creating payment invoice:', error);
        return ErrorResponses.internalError(reply, 'Failed to create payment invoice');
      }
    }
  );

  // Get payment status
  fastify.get(
    '/status/:paymentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authMiddleware()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const { paymentId } = request.params as { paymentId: string };

        const status = await paymentService.getPaymentStatus(paymentId, user.id);

        if (!status) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        return SuccessResponses.ok(reply, status);
      } catch (error) {
        Logger.error('Error getting payment status:', error);
        return ErrorResponses.internalError(reply, 'Failed to get payment status');
      }
    }
  );

  // Process webhook from NOWPayments
  fastify.post(
    '/webhook',
    {
      schema: {
        body: webhookPayloadJsonSchema,
      },
      preHandler: [webhookRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = request.body as WebhookPayload;

        Logger.info(`Received webhook for payment ${payload.payment_id}`, {
          paymentId: payload.payment_id,
          status: payload.payment_status,
          orderId: payload.order_id,
        });

        const success = await paymentService.processWebhook(payload);

        if (!success) {
          Logger.error(`Failed to process webhook for payment ${payload.payment_id}`);
          return ErrorResponses.badRequest(reply, 'Failed to process webhook');
        }

        return SuccessResponses.ok(reply, { received: true });
      } catch (error) {
        Logger.error('Error processing webhook:', error);
        return ErrorResponses.internalError(reply, 'Failed to process webhook');
      }
    }
  );

  // Get supported currencies
  fastify.get(
    '/currencies',
    {
      preHandler: [authMiddleware()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currencies = await paymentService.getSupportedCurrencies();
        return SuccessResponses.ok(reply, currencies);
      } catch (error) {
        Logger.error('Error getting supported currencies:', error);
        return ErrorResponses.internalError(reply, 'Failed to get supported currencies');
      }
    }
  );

  // Get payment amount estimate
  fastify.post(
    '/estimate',
    {
      schema: {
        body: estimateRequestJsonSchema,
      },
      preHandler: [authMiddleware()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { amount, currency_to } = request.body as { amount: number; currency_to: string };

        const estimate = await paymentService.getEstimate(amount, currency_to);

        if (!estimate) {
          return ErrorResponses.badRequest(reply, 'Unable to calculate estimate');
        }

        return SuccessResponses.ok(reply, estimate);
      } catch (error) {
        Logger.error('Error getting payment estimate:', error);
        return ErrorResponses.internalError(reply, 'Failed to get payment estimate');
      }
    }
  );

  // Get user payment history
  fastify.get(
    '/history/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        querystring: paymentHistoryQueryJsonSchema,
      },
      preHandler: [authMiddleware()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const { userId } = request.params as { userId: string };
        const query = request.query as PaymentHistoryQuery;

        // Users can only access their own payment history
        if (user.id !== userId) {
          return ErrorResponses.forbidden(reply, 'Access denied');
        }

        query.userId = userId;
        const history = await paymentService.getPaymentHistory(query);

        return SuccessResponses.ok(reply, {
          payments: history,
          count: history.length,
        });
      } catch (error) {
        Logger.error('Error getting payment history:', error);
        return ErrorResponses.internalError(reply, 'Failed to get payment history');
      }
    }
  );

  // Refresh payment status from NOWPayments API
  fastify.post(
    '/refresh/:paymentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authMiddleware()],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const user = (request as any).user;

        // Verify user owns this payment
        const currentStatus = await paymentService.getPaymentStatus(paymentId, user.id);
        if (!currentStatus) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        const success = await paymentService.refreshPaymentStatus(paymentId);

        if (!success) {
          return ErrorResponses.internalError(reply, 'Failed to refresh payment status');
        }

        // Get updated status
        const updatedStatus = await paymentService.getPaymentStatus(paymentId, user.id);

        return SuccessResponses.ok(reply, updatedStatus, 'Payment status refreshed');
      } catch (error) {
        Logger.error('Error refreshing payment status:', error);
        return ErrorResponses.internalError(reply, 'Failed to refresh payment status');
      }
    }
  );

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isHealthy = await paymentService.healthCheck();

      if (!isHealthy) {
        return ErrorResponses.internalError(reply, 'Payment service unhealthy');
      }

      return SuccessResponses.ok(reply, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      Logger.error('Payment health check failed:', error);
      return ErrorResponses.internalError(reply, 'Health check failed');
    }
  });
}
