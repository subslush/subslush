import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { creditService } from '../services/creditService';
import { validate as uuidValidate } from 'uuid';
import { CreditTransactionQuery } from '../types/credit';
import {
  HttpStatus,
  ErrorResponses,
  SuccessResponses,
  sendError,
} from '../utils/response';
import {
  creditQueryMiddleware,
  heavyCreditOperationMiddleware,
  adminCreditOperationMiddleware,
} from '../middleware/creditMiddleware';
import {
  AddCreditsInput,
  SpendCreditsInput,
  GetTransactionHistoryInput,
  UserIdParam,
  TransactionIdParam,
} from '../schemas/credit';

// Native Fastify JSON Schema definitions (compatible with Fastify v5)
const FastifySchemas = {
  // Parameter schemas
  userIdParam: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
    },
    required: ['userId'],
  } as const,

  transactionIdParam: {
    type: 'object',
    properties: {
      transactionId: { type: 'string', format: 'uuid' },
    },
    required: ['transactionId'],
  } as const,

  // Body schemas
  spendCreditsInput: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      amount: { type: 'number', minimum: 0.01, maximum: 10000 },
      description: { type: 'string', minLength: 1, maxLength: 500 },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    required: ['userId', 'amount', 'description'],
  } as const,

  addCreditsInput: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      amount: { type: 'number', minimum: 0.01, maximum: 10000 },
      type: { type: 'string', enum: ['deposit', 'bonus'] },
      description: { type: 'string', minLength: 1, maxLength: 500 },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    required: ['userId', 'amount', 'type', 'description'],
  } as const,

  // Deposit/refund inputs removed from public API (admin-only credit changes).
};

const isValidUuid = (value: string): boolean => {
  if (typeof uuidValidate === 'function') {
    return uuidValidate(value);
  }
  return /^[0-9a-f-]{36}$/i.test(value);
};

export async function creditRoutes(fastify: FastifyInstance): Promise<void> {
  // API info endpoint
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      message: 'Credit Management API',
      version: '1.0',
      endpoints: [
        'GET /credits/balance/:userId',
        'GET /credits/summary/:userId',
        'GET /credits/history/:userId',
        'GET /credits/transactions/:transactionId',
        'POST /credits/spend',
        'GET /credits/admin/balances',
        'POST /credits/admin/add',
        'POST /credits/admin/withdraw',
      ],
    });
  });

  // Get user balance
  fastify.register(async fastify => {
    await creditQueryMiddleware(fastify);

    fastify.get<{
      Params: UserIdParam;
    }>(
      '/balance/:userId',
      {
        schema: {
          params: FastifySchemas.userIdParam,
        },
      },
      async (
        request: FastifyRequest<{ Params: UserIdParam }>,
        reply: FastifyReply
      ) => {
        try {
          const { userId } = request.params;

          const balance = await creditService.getUserBalance(userId);

          if (!balance) {
            return ErrorResponses.notFound(reply, 'User balance not found');
          }

          return reply.send({
            userId: balance.userId,
            balance: balance.availableBalance, // Simple numeric balance for easy frontend consumption
            totalBalance: balance.totalBalance,
            availableBalance: balance.availableBalance,
            pendingBalance: balance.pendingBalance,
            currency: 'USD',
            lastUpdated: balance.lastUpdated,
          });
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve balance'
          );
        }
      }
    );
  });

  // Get balance summary with recent transactions
  fastify.register(async fastify => {
    await creditQueryMiddleware(fastify);

    fastify.get<{
      Params: UserIdParam;
      Querystring: { limit?: number };
    }>(
      '/summary/:userId',
      {
        schema: {
          params: FastifySchemas.userIdParam,
        },
      },
      async (
        request: FastifyRequest<{
          Params: UserIdParam;
          Querystring: { limit?: number };
        }>,
        reply: FastifyReply
      ) => {
        try {
          const { userId } = request.params;
          const limit = request.query.limit || 5;

          const summary = await creditService.getBalanceSummary(userId, limit);

          return SuccessResponses.ok(reply, { summary });
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve balance summary'
          );
        }
      }
    );
  });

  // Get transaction history
  fastify.register(async fastify => {
    await creditQueryMiddleware(fastify);

    fastify.get<{
      Params: UserIdParam;
      Querystring: GetTransactionHistoryInput;
    }>(
      '/history/:userId',
      {
        schema: {
          params: FastifySchemas.userIdParam,
        },
      },
      async (
        request: FastifyRequest<{
          Params: UserIdParam;
          Querystring: GetTransactionHistoryInput;
        }>,
        reply: FastifyReply
      ) => {
        try {
          const { userId } = request.params;
          const query: CreditTransactionQuery = {
            userId,
            type: request.query.type,
            startDate: request.query.startDate
              ? new Date(request.query.startDate)
              : undefined,
            endDate: request.query.endDate
              ? new Date(request.query.endDate)
              : undefined,
            limit: request.query.limit,
            offset: request.query.offset,
          };

          const [transactions, totalCount] = await Promise.all([
            creditService.getTransactionHistory(query),
            creditService.getTransactionCount(userId, query.type),
          ]);

          const hasMore =
            (query.offset || 0) + transactions.length < totalCount;

          return SuccessResponses.ok(reply, {
            transactions,
            totalCount,
            hasMore,
            query: {
              limit: query.limit,
              offset: query.offset,
              type: query.type,
            },
          });
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve transaction history'
          );
        }
      }
    );
  });

  // Get specific transaction
  fastify.register(async fastify => {
    await creditQueryMiddleware(fastify);

    fastify.get<{
      Params: TransactionIdParam;
    }>(
      '/transactions/:transactionId',
      {
        schema: {
          params: FastifySchemas.transactionIdParam,
        },
      },
      async (
        request: FastifyRequest<{ Params: TransactionIdParam }>,
        reply: FastifyReply
      ) => {
        try {
          const { transactionId } = request.params;
          if (!isValidUuid(transactionId)) {
            return ErrorResponses.badRequest(
              reply,
              'Invalid transaction ID format'
            );
          }

          if (!request.user?.userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }

          const isAdmin = ['admin', 'super_admin'].includes(
            request.user?.role || ''
          );
          const userId = isAdmin ? undefined : request.user.userId;

          const transaction = await creditService.getTransaction(
            transactionId,
            userId
          );

          if (!transaction) {
            return ErrorResponses.notFound(reply, 'Transaction not found');
          }

          return SuccessResponses.ok(reply, { transaction });
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to retrieve transaction'
          );
        }
      }
    );
  });

  // Spend credits
  fastify.register(async fastify => {
    await heavyCreditOperationMiddleware(fastify);

    fastify.post<{
      Body: SpendCreditsInput;
    }>(
      '/spend',
      {
        schema: {
          body: FastifySchemas.spendCreditsInput,
        },
      },
      async (
        request: FastifyRequest<{ Body: SpendCreditsInput }>,
        reply: FastifyReply
      ) => {
        try {
          const { userId, amount, description, metadata } = request.body;

          const result = await creditService.spendCredits(
            userId,
            amount,
            description,
            metadata
          );

          if (!result.success) {
            return sendError(
              reply,
              HttpStatus.BAD_REQUEST,
              'Credit Operation Failed',
              result.error || 'Unknown error'
            );
          }

          return SuccessResponses.ok(
            reply,
            {
              transaction: result.transaction,
              newBalance: result.balance,
            },
            'Credits spent successfully'
          );
        } catch {
          return ErrorResponses.internalError(reply, 'Failed to spend credits');
        }
      }
    );
  });

  // Note: Public credit deposits/refunds are intentionally removed.

  // Admin endpoints
  fastify.register(async fastify => {
    // Get all user balances (admin only)
    fastify.register(async fastify => {
      await adminCreditOperationMiddleware(fastify);

      fastify.get<{
        Querystring: { limit?: number; offset?: number };
      }>(
        '/admin/balances',
        async (
          request: FastifyRequest<{
            Querystring: { limit?: number; offset?: number };
          }>,
          reply: FastifyReply
        ) => {
          try {
            const limit = Math.min(request.query.limit || 50, 100); // Max 100 per request
            const offset = request.query.offset || 0;

            const balances = await creditService.getAllUserBalances(
              limit,
              offset
            );

            return SuccessResponses.ok(reply, {
              balances,
              pagination: {
                limit,
                offset,
                hasMore: balances.length === limit,
              },
            });
          } catch {
            return ErrorResponses.internalError(
              reply,
              'Failed to retrieve user balances'
            );
          }
        }
      );
    });

    // Admin add credits (bonus)
    fastify.register(async fastify => {
      await adminCreditOperationMiddleware(fastify);

      fastify.post<{
        Body: AddCreditsInput;
      }>(
        '/admin/add',
        {
          schema: {
            body: FastifySchemas.addCreditsInput,
          },
        },
        async (
          request: FastifyRequest<{ Body: AddCreditsInput }>,
          reply: FastifyReply
        ) => {
          try {
            const { userId, amount, type, description, metadata } =
              request.body;

            const result = await creditService.addCredits(
              userId,
              amount,
              type,
              description,
              {
                ...metadata,
                adminUserId: request.user?.userId,
                adminEmail: request.user?.email,
              }
            );

            if (!result.success) {
              reply.statusCode = 400;
              return reply.send({
                error: 'Credit Operation Failed',
                message: result.error,
              });
            }

            return SuccessResponses.created(
              reply,
              {
                transaction: result.transaction,
                newBalance: result.balance,
              },
              `Credits ${type === 'bonus' ? 'awarded' : 'added'} successfully`
            );
          } catch {
            return ErrorResponses.internalError(reply, 'Failed to add credits');
          }
        }
      );
    });

    // Admin withdraw credits
    fastify.register(async fastify => {
      await adminCreditOperationMiddleware(fastify);

      fastify.post<{
        Body: {
          userId: string;
          amount: number;
          description: string;
          metadata?: Record<string, any>;
        };
      }>(
        '/admin/withdraw',
        async (
          request: FastifyRequest<{
            Body: {
              userId: string;
              amount: number;
              description: string;
              metadata?: Record<string, any>;
            };
          }>,
          reply: FastifyReply
        ) => {
          try {
            const { userId, amount, description, metadata } = request.body;

            const result = await creditService.spendCredits(
              userId,
              amount,
              description,
              {
                ...metadata,
                adminUserId: request.user?.userId,
                adminEmail: request.user?.email,
                operationType: 'admin_withdrawal',
              }
            );

            if (!result.success) {
              reply.statusCode = 400;
              return reply.send({
                error: 'Credit Operation Failed',
                message: result.error,
              });
            }

            return SuccessResponses.ok(
              reply,
              {
                transaction: result.transaction,
                newBalance: result.balance,
              },
              'Credits withdrawn successfully'
            );
          } catch {
            return ErrorResponses.internalError(
              reply,
              'Failed to withdraw credits'
            );
          }
        }
      );
    });
  });

  // Health check endpoint
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const isHealthy = await creditService.healthCheck();

        if (isHealthy) {
          return SuccessResponses.ok(reply, {
            status: 'healthy',
            service: 'credit-system',
            timestamp: new Date().toISOString(),
          });
        } else {
          return sendError(
            reply,
            HttpStatus.SERVICE_UNAVAILABLE,
            'Service Unavailable',
            'Health check failed',
            'SERVICE_UNHEALTHY',
            {
              status: 'unhealthy',
              service: 'credit-system',
              timestamp: new Date().toISOString(),
            }
          );
        }
      } catch {
        return sendError(
          reply,
          HttpStatus.SERVICE_UNAVAILABLE,
          'Service Unavailable',
          'Health check failed',
          'HEALTH_CHECK_ERROR',
          {
            status: 'error',
            service: 'credit-system',
            timestamp: new Date().toISOString(),
          }
        );
      }
    }
  );
}
