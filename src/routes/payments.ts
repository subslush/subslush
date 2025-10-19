import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { paymentService } from '../services/paymentService';
import { paymentMonitoringService } from '../services/paymentMonitoringService';
import { creditAllocationService } from '../services/creditAllocationService';
import { paymentFailureService } from '../services/paymentFailureService';
import { refundService } from '../services/refundService';
import { SuccessResponses, ErrorResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import {
  createPaymentRequestJsonSchema,
  paymentHistoryQueryJsonSchema,
  webhookPayloadJsonSchema,
} from '../schemas/payment';
import {
  CreatePaymentRequest,
  PaymentHistoryQuery,
  WebhookPayload,
} from '../types/payment';

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // Create payment
  fastify.post(
    '/create-payment',
    {
      schema: {
        body: createPaymentRequestJsonSchema,
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const body = request.body as CreatePaymentRequest;

        Logger.info(`Creating payment for user ${user.userId}`, {
          userId: user.userId,
          creditAmount: body.creditAmount,
          currency: body.currency,
        });

        const result = await paymentService.createPayment(user.userId, body);

        if (!result.success) {
          Logger.error(
            `Payment creation failed for user ${user.userId}:`,
            result.error
          );
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Payment creation failed'
          );
        }

        const response = {
          paymentId: result.payment!.paymentId, // Use NOWPayments payment_id, not local id
          payAddress: result.payment!.payAddress,
          payAmount: result.payment!.amount,
          payCurrency: result.payment!.currency,
          expiresAt: result.payment!.expiresAt,
          status: result.payment!.status,
        };

        return SuccessResponses.created(
          reply,
          response,
          'Payment created successfully'
        );
      } catch (error) {
        Logger.error('Error creating payment:', error);
        return ErrorResponses.internalError(reply, 'Failed to create payment');
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
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { paymentId } = request.params as { paymentId: string };

        const status = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );

        if (!status) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        return SuccessResponses.ok(reply, status);
      } catch (error) {
        Logger.error('Error getting payment status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment status'
        );
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
          Logger.error(
            `Failed to process webhook for payment ${payload.payment_id}`
          );
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
      preHandler: [authPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currencies = await paymentService.getSupportedCurrencies();
        return SuccessResponses.ok(reply, currencies);
      } catch (error) {
        Logger.error('Error getting supported currencies:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get supported currencies'
        );
      }
    }
  );

  // Get payment amount estimate
  fastify.get(
    '/estimate',
    {
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { amount, currency_to } = request.query as {
          amount: string;
          currency_to: string;
        };

        const numericAmount = parseFloat(amount);

        const estimate = await paymentService.getEstimate(
          numericAmount,
          currency_to
        );

        if (!estimate) {
          return ErrorResponses.badRequest(
            reply,
            'Unable to calculate estimate'
          );
        }

        return SuccessResponses.ok(reply, estimate);
      } catch (error) {
        Logger.error('Error getting payment estimate:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment estimate'
        );
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
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { userId } = request.params as { userId: string };
        const query = request.query as PaymentHistoryQuery;

        // Users can only access their own payment history
        if (user.userId !== userId) {
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
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment history'
        );
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
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        // Verify user owns this payment
        const currentStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );
        if (!currentStatus) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        const success = await paymentService.refreshPaymentStatus(paymentId);

        if (!success) {
          return ErrorResponses.internalError(
            reply,
            'Failed to refresh payment status'
          );
        }

        // Get updated status
        const updatedStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );

        return SuccessResponses.ok(
          reply,
          updatedStatus,
          'Payment status refreshed'
        );
      } catch (error) {
        Logger.error('Error refreshing payment status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to refresh payment status'
        );
      }
    }
  );

  // Manual retry failed payment (user action)
  fastify.post(
    '/retry/:paymentId',
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
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        // Verify user owns this payment
        const currentStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );
        if (!currentStatus) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        const success =
          await paymentMonitoringService.triggerPaymentCheck(paymentId);

        if (!success) {
          return ErrorResponses.internalError(
            reply,
            'Failed to retry payment monitoring'
          );
        }

        return SuccessResponses.ok(
          reply,
          { retried: true },
          'Payment retry initiated'
        );
      } catch (error) {
        Logger.error('Error retrying payment:', error);
        return ErrorResponses.internalError(reply, 'Failed to retry payment');
      }
    }
  );

  // Get monitoring service status
  fastify.get(
    '/monitor-status',
    {
      preHandler: [authPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const isActive = paymentMonitoringService.isMonitoringActive();
        const metrics = paymentMonitoringService.getMetrics();

        return SuccessResponses.ok(reply, {
          active: isActive,
          metrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Error getting monitoring status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get monitoring status'
        );
      }
    }
  );

  // Initiate refund request
  fastify.post(
    '/refund',
    {
      schema: {
        body: {
          type: 'object',
          required: ['paymentId', 'amount', 'reason'],
          properties: {
            paymentId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            reason: {
              type: 'string',
              enum: [
                'user_request',
                'payment_error',
                'service_issue',
                'overpayment',
                'admin_decision',
                'dispute',
              ],
            },
            description: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { paymentId, amount, reason, description } = request.body as {
          paymentId: string;
          amount: number;
          reason: string;
          description?: string;
        };

        const result = await refundService.initiateRefund(
          user.userId,
          paymentId,
          amount,
          reason as any,
          description
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to initiate refund'
          );
        }

        return SuccessResponses.created(
          reply,
          result.refund,
          'Refund request created successfully'
        );
      } catch (error) {
        Logger.error('Error initiating refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to initiate refund');
      }
    }
  );

  // Get user refunds
  fastify.get(
    '/refunds',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { limit = 20, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const refunds = await refundService.getUserRefunds(
          user.userId,
          limit,
          offset
        );

        return SuccessResponses.ok(reply, {
          refunds,
          count: refunds.length,
        });
      } catch (error) {
        Logger.error('Error getting user refunds:', error);
        return ErrorResponses.internalError(reply, 'Failed to get refunds');
      }
    }
  );

  // Get refund by ID
  fastify.get(
    '/refunds/:refundId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['refundId'],
          properties: {
            refundId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { refundId } = request.params as { refundId: string };
        const refund = await refundService.getRefundById(refundId);

        if (!refund) {
          return ErrorResponses.notFound(reply, 'Refund not found');
        }

        // Verify user owns this refund
        if (refund.userId !== user.userId) {
          return ErrorResponses.forbidden(reply, 'Access denied');
        }

        return SuccessResponses.ok(reply, refund);
      } catch (error) {
        Logger.error('Error getting refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to get refund');
      }
    }
  );

  // Health check endpoint
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paymentHealthy = await paymentService.healthCheck();
        const monitoringHealthy = await paymentMonitoringService.healthCheck();
        const allocationHealthy = await creditAllocationService.healthCheck();
        const failureHealthy = await paymentFailureService.healthCheck();
        const refundHealthy = await refundService.healthCheck();

        const isHealthy =
          paymentHealthy &&
          monitoringHealthy &&
          allocationHealthy &&
          failureHealthy &&
          refundHealthy;

        if (!isHealthy) {
          return ErrorResponses.internalError(
            reply,
            'Payment workflow services unhealthy'
          );
        }

        return SuccessResponses.ok(reply, {
          status: 'healthy',
          services: {
            payment: paymentHealthy,
            monitoring: monitoringHealthy,
            allocation: allocationHealthy,
            failure: failureHealthy,
            refund: refundHealthy,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Payment health check failed:', error);
        return ErrorResponses.internalError(reply, 'Health check failed');
      }
    }
  );
}
