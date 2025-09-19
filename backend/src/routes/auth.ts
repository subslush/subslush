import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Auth routes - Coming soon' });
  });

  fastify.post(
    '/login',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Login endpoint - Coming soon' });
    }
  );

  fastify.post(
    '/register',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Register endpoint - Coming soon' });
    }
  );

  fastify.post(
    '/logout',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ message: 'Logout endpoint - Coming soon' });
    }
  );
}
