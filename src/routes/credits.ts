import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { creditService } from '../services/creditService';
import { CreditTransactionQuery } from '../types/credit';
import {
  creditQueryMiddleware,
  creditOperationMiddleware,
  heavyCreditOperationMiddleware,
  adminCreditOperationMiddleware,
} from '../middleware/creditMiddleware';
import {
  AddCreditsInputSchema,
  SpendCreditsInputSchema,
  RefundCreditsInputSchema,
  UserIdParamSchema,
  TransactionIdParamSchema,
  AddCreditsInput,
  SpendCreditsInput,
  RefundCreditsInput,
  GetTransactionHistoryInput,
  UserIdParam,
  TransactionIdParam,
} from '../schemas/credit';

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
          params: UserIdParamSchema,
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
            return reply.status(404).send({
              error: 'Not Found',
              message: 'User balance not found',
            });
          }

          return reply.send({
            balance: {
              totalBalance: balance.totalBalance,
              availableBalance: balance.availableBalance,
              pendingBalance: balance.pendingBalance,
            },
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve balance',
          });
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
          params: UserIdParamSchema,
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

          return reply.send({
            summary,
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve balance summary',
          });
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
          params: UserIdParamSchema,
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

          return reply.send({
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
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve transaction history',
          });
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
          params: TransactionIdParamSchema,
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
            return reply.status(404).send({
              error: 'Not Found',
              message: 'Transaction not found',
            });
          }

          return reply.send({
            transaction,
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to retrieve transaction',
          });
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
          body: SpendCreditsInputSchema,
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
            return reply.status(400).send({
              error: 'Credit Operation Failed',
              message: result.error,
            });
          }

          return reply.send({
            message: 'Credits spent successfully',
            transaction: result.transaction,
            newBalance: result.balance,
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to spend credits',
          });
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
          body: AddCreditsInputSchema.extend({
            type: AddCreditsInputSchema.shape.type.refine(
              type => type === 'deposit',
              { message: 'Only deposit type allowed for this endpoint' }
            ),
          }),
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
            return reply.status(400).send({
              error: 'Credit Operation Failed',
              message: result.error,
            });
          }

          return reply.status(201).send({
            message: 'Credits deposited successfully',
            transaction: result.transaction,
            newBalance: result.balance,
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to deposit credits',
          });
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
          body: RefundCreditsInputSchema,
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
            return reply.status(400).send({
              error: 'Credit Operation Failed',
              message: result.error,
            });
          }

          return reply.status(201).send({
            message: 'Credits refunded successfully',
            transaction: result.transaction,
            newBalance: result.balance,
          });
        } catch {
          return reply.status(500).send({
            error: 'Internal Server Error',
            message: 'Failed to refund credits',
          });
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

            return reply.send({
              balances,
              pagination: {
                limit,
                offset,
                hasMore: balances.length === limit,
              },
            });
          } catch {
            return reply.status(500).send({
              error: 'Internal Server Error',
              message: 'Failed to retrieve user balances',
            });
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
            body: AddCreditsInputSchema,
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
              return reply.status(400).send({
                error: 'Credit Operation Failed',
                message: result.error,
              });
            }

            return reply.status(201).send({
              message: `Credits ${type === 'bonus' ? 'awarded' : 'added'} successfully`,
              transaction: result.transaction,
              newBalance: result.balance,
            });
          } catch {
            return reply.status(500).send({
              error: 'Internal Server Error',
              message: 'Failed to add credits',
            });
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
              return reply.status(400).send({
                error: 'Credit Operation Failed',
                message: result.error,
              });
            }

            return reply.send({
              message: 'Credits withdrawn successfully',
              transaction: result.transaction,
              newBalance: result.balance,
            });
          } catch {
            return reply.status(500).send({
              error: 'Internal Server Error',
              message: 'Failed to withdraw credits',
            });
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
          return reply.send({
            status: 'healthy',
            service: 'credit-system',
            timestamp: new Date().toISOString(),
          });
        } else {
          return reply.status(503).send({
            status: 'unhealthy',
            service: 'credit-system',
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        return reply.status(503).send({
          status: 'error',
          service: 'credit-system',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
        });
      }
    }
  );
}
