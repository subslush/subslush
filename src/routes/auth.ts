import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth';
import {
  validateRegisterInput,
  validateLoginInput,
  AuthResponse,
  ErrorResponse
} from '../schemas/auth';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService();

  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Authentication API v1.0' });
  });

  fastify.post(
    '/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateRegisterInput(request.body);

        if (!validation.success) {
          return reply.status(400).send(validation.error);
        }

        const { email, password } = validation.data;
        const result = await authService.registerUser({ email, password });

        if (result.error) {
          const errorResponse: ErrorResponse = {
            success: false,
            error: result.error
          };
          return reply.status(400).send(errorResponse);
        }

        const response: AuthResponse = {
          success: true,
          message: 'User registered successfully',
          user: {
            id: result.user!.id,
            email: result.user!.email,
            created_at: result.user!.created_at
          }
        };

        return reply.status(201).send(response);
      } catch (error) {
        console.error('Registration endpoint error:', error);

        const errorResponse: ErrorResponse = {
          success: false,
          error: 'Internal server error'
        };

        return reply.status(500).send(errorResponse);
      }
    }
  );

  fastify.post(
    '/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateLoginInput(request.body);

        if (!validation.success) {
          return reply.status(400).send(validation.error);
        }

        const { email, password } = validation.data;
        const result = await authService.loginUser({ email, password });

        if (result.error) {
          const errorResponse: ErrorResponse = {
            success: false,
            error: result.error
          };
          return reply.status(401).send(errorResponse);
        }

        const response: AuthResponse = {
          success: true,
          message: 'Login successful',
          user: {
            id: result.user!.id,
            email: result.user!.email,
            created_at: result.user!.created_at,
            ...(result.user!.last_login && { last_login: result.user!.last_login })
          }
        };

        return reply.status(200).send(response);
      } catch (error) {
        console.error('Login endpoint error:', error);

        const errorResponse: ErrorResponse = {
          success: false,
          error: 'Internal server error'
        };

        return reply.status(500).send(errorResponse);
      }
    }
  );

  fastify.post(
    '/logout',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        success: true,
        message: 'Logout endpoint - Session management will be implemented in Task 2.2'
      });
    }
  );
}
