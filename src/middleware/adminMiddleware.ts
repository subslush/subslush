import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponses } from '../utils/response';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export const adminPreHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const user = request.user;

  if (!user) {
    return ErrorResponses.unauthorized(reply, 'Admin authentication required');
  }

  if (!user.role || !ADMIN_ROLES.has(user.role)) {
    return ErrorResponses.forbidden(reply, 'Admin access required');
  }
};
