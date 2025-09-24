import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { creditService } from '../services/creditService';
import { CreditTransactionQuery } from '../types/credit';
import {
  HttpStatus,
  ErrorResponses,
  SuccessResponses,
  sendError,
} from '../utils/response';
import {
  creditQueryMiddleware,
  creditOperationMiddleware,
  heavyCreditOperationMiddleware,
  adminCreditOperationMiddleware,
} from '../middleware/creditMiddleware';
import {
  AddCreditsInput,
  SpendCreditsInput,
  RefundCreditsInput,
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

  addCreditsDepositOnly: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      amount: { type: 'number', minimum: 0.01, maximum: 10000 },
      type: { type: 'string', enum: ['deposit'] },
      description: { type: 'string', minLength: 1, maxLength: 500 },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    required: ['userId', 'amount', 'type', 'description'],
  } as const,

  refundCreditsInput: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      amount: { type: 'number', minimum: 0.01, maximum: 10000 },
      description: { type: 'string', minLength: 1, maxLength: 500 },
      originalTransactionId: { type: 'string', format: 'uuid' },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
    },
    required: ['userId', 'amount', 'description'],
  } as const,
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
        'POST /credits/deposit',
        'POST /credits/refund',
        'GET /credits/admin/balances',
        'POST /credits/admin/add',
        'POST /credits/admin/withdraw',
      ],
    });
  });

  // Get user balance
  fastify.register(async fastify => {
    await fastify.register(creditQueryMiddleware);

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

          return SuccessResponses.ok(reply, {
            balance: {
              totalBalance: balance.totalBalance,
              availableBalance: balance.availableBalance,
              pendingBalance: balance.pendingBalance,
            },
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
    await fastify.register(creditQueryMiddleware);

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
    await fastify.register(creditQueryMiddleware);

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
    await fastify.register(creditQueryMiddleware);

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
          const userId =
            request.user?.role === 'admin' ? undefined : request.user?.userId;

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
    await fastify.register(heavyCreditOperationMiddleware);

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

  // Deposit credits (user self-deposit)
  fastify.register(async fastify => {
    await fastify.register(creditOperationMiddleware);

    fastify.post<{
      Body: AddCreditsInput;
    }>(
      '/deposit',
      {
        schema: {
          body: FastifySchemas.addCreditsDepositOnly,
        },
      },
      async (
        request: FastifyRequest<{ Body: AddCreditsInput }>,
        reply: FastifyReply
      ) => {
        try {
          const { userId, amount, description, metadata } = request.body;

          const result = await creditService.addCredits(
            userId,
            amount,
            'deposit',
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

          return SuccessResponses.created(
            reply,
            {
              transaction: result.transaction,
              newBalance: result.balance,
            },
            'Credits deposited successfully'
          );
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to deposit credits'
          );
        }
      }
    );
  });

  // Refund credits
  fastify.register(async fastify => {
    await fastify.register(heavyCreditOperationMiddleware);

    fastify.post<{
      Body: RefundCreditsInput;
    }>(
      '/refund',
      {
        schema: {
          body: FastifySchemas.refundCreditsInput,
        },
      },
      async (
        request: FastifyRequest<{ Body: RefundCreditsInput }>,
        reply: FastifyReply
      ) => {
        try {
          const {
            userId,
            amount,
            description,
            originalTransactionId,
            metadata,
          } = request.body;

          const result = await creditService.refundCredits(
            userId,
            amount,
            description,
            originalTransactionId,
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

          return SuccessResponses.created(
            reply,
            {
              transaction: result.transaction,
              newBalance: result.balance,
            },
            'Credits refunded successfully'
          );
        } catch {
          return ErrorResponses.internalError(
            reply,
            'Failed to refund credits'
          );
        }
      }
    );
  });

  // Admin endpoints
  fastify.register(async fastify => {
    // Get all user balances (admin only)
    fastify.register(async fastify => {
      await fastify.register(adminCreditOperationMiddleware);

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
      await fastify.register(adminCreditOperationMiddleware);

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
      await fastify.register(adminCreditOperationMiddleware);

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
