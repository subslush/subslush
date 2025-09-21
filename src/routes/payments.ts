import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Payment routes - Coming soon' });
  });

  fastify.post(
    '/process',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Process payment - Coming soon' });
    }
  );

  fastify.get(
    '/methods',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Get payment methods - Coming soon' });
    }
  );

  fastify.post(
    '/webhook',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Payment webhook - Coming soon' });
    }
  );
}
