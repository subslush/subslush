import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function subscriptionRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Subscription routes - Coming soon' });
  });

  fastify.get('/:id', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Get subscription by ID - Coming soon' });
  });

  fastify.post('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Create subscription - Coming soon' });
  });

  fastify.put('/:id', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Update subscription - Coming soon' });
  });

  fastify.delete(
    '/:id',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Cancel subscription - Coming soon' });
    }
  );
}
