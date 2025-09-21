import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export async function errorHandler(
  this: unknown,
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { statusCode = 500, message } = error;

  if (statusCode >= 500) {
    request.log.error(error, 'Internal server error');
  } else {
    request.log.warn(error, 'Client error');
  }

  await reply.status(statusCode).send({
    error: {
      statusCode,
      message: statusCode >= 500 ? 'Internal Server Error' : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    },
  });
}
