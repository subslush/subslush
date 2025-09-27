import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { paymentMonitoringService } from '../../services/paymentMonitoringService';
import { creditAllocationService } from '../../services/creditAllocationService';
import { paymentFailureService } from '../../services/paymentFailureService';
import { refundService } from '../../services/refundService';
import { SuccessResponses, ErrorResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import '../../types/fastify';

// Middleware to check admin permissions
const adminPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const user = request.user;

  if (!user || !user.isAdmin) {
    return ErrorResponses.forbidden(reply, 'Admin access required');
  }
};

export async function adminPaymentRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Start payment monitoring service
  fastify.post(
    '/monitoring/start',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        await paymentMonitoringService.startMonitoring();

        return SuccessResponses.ok(
          reply,
          {
            status: 'started',
            timestamp: new Date().toISOString(),
          },
          'Payment monitoring service started'
        );
      } catch (error) {
        Logger.error('Error starting payment monitoring:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to start monitoring service'
        );
      }
    }
  );

  // Stop payment monitoring service
  fastify.post(
    '/monitoring/stop',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        await paymentMonitoringService.stopMonitoring();

        return SuccessResponses.ok(
          reply,
          {
            status: 'stopped',
            timestamp: new Date().toISOString(),
          },
          'Payment monitoring service stopped'
        );
      } catch (error) {
        Logger.error('Error stopping payment monitoring:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to stop monitoring service'
        );
      }
    }
  );

  // Get detailed monitoring metrics
  fastify.get(
    '/monitoring',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const isActive = paymentMonitoringService.isMonitoringActive();
        const metrics = paymentMonitoringService.getMetrics();
        const allocationMetrics = creditAllocationService.getMetrics();
        const failureMetrics = paymentFailureService.getMetrics();

        return SuccessResponses.ok(reply, {
          monitoring: {
            active: isActive,
            ...metrics,
          },
          allocation: allocationMetrics,
          failures: failureMetrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Error getting monitoring dashboard:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get monitoring data'
        );
      }
    }
  );

  // Get pending payments requiring attention
  fastify.get(
    '/pending',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { limit = 50, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const pendingAllocations =
          await creditAllocationService.getPendingAllocations();
        const failedPayments = await paymentFailureService.getFailedPayments(
          limit,
          offset
        );

        return SuccessResponses.ok(reply, {
          pendingAllocations,
          failedPayments,
          counts: {
            pendingAllocations: pendingAllocations.length,
            failedPayments: failedPayments.length,
          },
        });
      } catch (error) {
        Logger.error('Error getting pending payments:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get pending payments'
        );
      }
    }
  );

  // Manual credit allocation
  fastify.post(
    '/manual-allocate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'paymentId', 'creditAmount', 'reason'],
          properties: {
            userId: { type: 'string' },
            paymentId: { type: 'string' },
            creditAmount: { type: 'number', minimum: 0.01 },
            reason: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { userId, paymentId, creditAmount, reason } = request.body as {
          userId: string;
          paymentId: string;
          creditAmount: number;
          reason: string;
        };

        const result = await creditAllocationService.manualCreditAllocation(
          userId,
          paymentId,
          creditAmount,
          user.userId,
          reason
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Manual allocation failed'
          );
        }

        return SuccessResponses.ok(
          reply,
          result,
          'Manual credit allocation completed'
        );
      } catch (error) {
        Logger.error('Error in manual credit allocation:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to allocate credits'
        );
      }
    }
  );

  // Manual payment retry
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
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { paymentId } = request.params as { paymentId: string };

        const result = await paymentFailureService.manualRetryPayment(
          paymentId,
          user.userId
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Manual retry failed'
          );
        }

        return SuccessResponses.ok(
          reply,
          result,
          'Manual payment retry initiated'
        );
      } catch (error) {
        Logger.error('Error in manual payment retry:', error);
        return ErrorResponses.internalError(reply, 'Failed to retry payment');
      }
    }
  );

  // Get pending refunds for approval
  fastify.get(
    '/refunds/pending',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { limit = 50, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const pendingRefunds = await refundService.getPendingRefunds(
          limit,
          offset
        );

        return SuccessResponses.ok(reply, {
          refunds: pendingRefunds,
          count: pendingRefunds.length,
        });
      } catch (error) {
        Logger.error('Error getting pending refunds:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get pending refunds'
        );
      }
    }
  );

  // Get all refunds
  fastify.get(
    '/refunds',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: [
                'pending',
                'approved',
                'processing',
                'completed',
                'failed',
                'rejected',
              ],
            },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          status,
          limit = 50,
          offset = 0,
        } = request.query as {
          status?: string;
          limit?: number;
          offset?: number;
        };

        const refunds = await refundService.getAllRefunds(
          status as any,
          limit,
          offset
        );

        return SuccessResponses.ok(reply, {
          refunds,
          count: refunds.length,
        });
      } catch (error) {
        Logger.error('Error getting all refunds:', error);
        return ErrorResponses.internalError(reply, 'Failed to get refunds');
      }
    }
  );

  // Approve refund
  fastify.post(
    '/refunds/:refundId/approve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['refundId'],
          properties: {
            refundId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { refundId } = request.params as { refundId: string };
        const { note } = request.body as { note?: string };

        const result = await refundService.approveRefund(
          refundId,
          user.userId,
          note
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to approve refund'
          );
        }

        return SuccessResponses.ok(
          reply,
          result.refund,
          'Refund approved and processed'
        );
      } catch (error) {
        Logger.error('Error approving refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to approve refund');
      }
    }
  );

  // Reject refund
  fastify.post(
    '/refunds/:refundId/reject',
    {
      schema: {
        params: {
          type: 'object',
          required: ['refundId'],
          properties: {
            refundId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', maxLength: 500, minLength: 1 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { refundId } = request.params as { refundId: string };
        const { reason } = request.body as { reason: string };

        const result = await refundService.rejectRefund(
          refundId,
          user.userId,
          reason
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to reject refund'
          );
        }

        return SuccessResponses.ok(reply, result.refund, 'Refund rejected');
      } catch (error) {
        Logger.error('Error rejecting refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to reject refund');
      }
    }
  );

  // Manual refund (admin override)
  fastify.post(
    '/refunds/manual',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'amount', 'reason'],
          properties: {
            userId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            reason: { type: 'string', maxLength: 500, minLength: 1 },
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { userId, amount, reason, paymentId } = request.body as {
          userId: string;
          amount: number;
          reason: string;
          paymentId?: string;
        };

        const result = await refundService.manualRefund(
          userId,
          amount,
          reason,
          user.userId,
          paymentId
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Manual refund failed'
          );
        }

        return SuccessResponses.ok(
          reply,
          {
            transactionId: result.transactionId,
            amount,
            userId,
            processedBy: user.userId,
          },
          'Manual refund completed'
        );
      } catch (error) {
        Logger.error('Error in manual refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to process refund');
      }
    }
  );

  // Get refund statistics
  fastify.get(
    '/refunds/statistics',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', minimum: 1, maximum: 365, default: 30 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { days = 30 } = request.query as { days?: number };

        const statistics = await refundService.getRefundStatistics(days);

        return SuccessResponses.ok(reply, {
          period: `${days} days`,
          ...statistics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Error getting refund statistics:', error);
        return ErrorResponses.internalError(reply, 'Failed to get statistics');
      }
    }
  );

  // Reset service metrics
  fastify.post(
    '/metrics/reset',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        paymentMonitoringService.resetMetrics();
        creditAllocationService.resetMetrics();
        paymentFailureService.resetMetrics();
        refundService.resetMetrics();

        return SuccessResponses.ok(
          reply,
          {
            reset: true,
            timestamp: new Date().toISOString(),
          },
          'All service metrics reset'
        );
      } catch (error) {
        Logger.error('Error resetting metrics:', error);
        return ErrorResponses.internalError(reply, 'Failed to reset metrics');
      }
    }
  );

  // Cleanup old records
  fastify.post(
    '/cleanup',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const failureCleanup = await paymentFailureService.cleanupOldFailures();
        const refundCleanup = await refundService.cleanupOldRefunds();

        return SuccessResponses.ok(
          reply,
          {
            cleanedFailures: failureCleanup,
            cleanedRefunds: refundCleanup,
            timestamp: new Date().toISOString(),
          },
          'Cleanup completed'
        );
      } catch (error) {
        Logger.error('Error during cleanup:', error);
        return ErrorResponses.internalError(reply, 'Failed to cleanup records');
      }
    }
  );

  // Health check for all payment workflow services
  fastify.get(
    '/health',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const monitoringHealthy = await paymentMonitoringService.healthCheck();
        const allocationHealthy = await creditAllocationService.healthCheck();
        const failureHealthy = await paymentFailureService.healthCheck();
        const refundHealthy = await refundService.healthCheck();

        const allHealthy =
          monitoringHealthy &&
          allocationHealthy &&
          failureHealthy &&
          refundHealthy;

        return SuccessResponses.ok(reply, {
          overall: allHealthy ? 'healthy' : 'unhealthy',
          services: {
            monitoring: monitoringHealthy,
            allocation: allocationHealthy,
            failure: failureHealthy,
            refund: refundHealthy,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Admin payment health check failed:', error);
        return ErrorResponses.internalError(reply, 'Health check failed');
      }
    }
  );
}
