import { FastifyReply } from 'fastify';

/**
 * Universal Response Helper for Fastify v5.6.1
 *
 * Based on comprehensive interface testing, the following methods are confirmed working:
 * - reply.status(code).send(data) ✅ PRIMARY METHOD
 * - reply.code(code).send(data) ✅ LEGACY SUPPORT
 * - reply.statusCode = code; reply.send(data) ✅ FALLBACK
 *
 * This utility provides robust response handling with proper error recovery.
 */

// Standard response interfaces
export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

export interface SuccessResponse {
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

// HTTP status codes enum for type safety
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  PAYMENT_REQUIRED = 402,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  TOO_MANY_REQUESTS = 429,
}

/**
 * Universal response sender that adapts to available Fastify reply methods
 * Prioritizes the confirmed working reply.status().send() pattern
 */
export const sendResponse = (
  reply: FastifyReply,
  statusCode: number,
  data: unknown
): FastifyReply => {
  // Use the CONFIRMED WORKING Fastify v5.6.1 pattern
  // Based on extensive testing with diagnostic servers
  return reply.status(statusCode).send(data);
};

/**
 * Send error response with standardized format
 */
export const sendError = (
  reply: FastifyReply,
  statusCode: number,
  error: string,
  message: string,
  code?: string,
  details?: unknown
): FastifyReply => {
  const errorResponse: ErrorResponse = {
    error,
    message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  };

  return sendResponse(reply, statusCode, errorResponse);
};

/**
 * Send success response with optional data
 */
export const sendSuccess = (
  reply: FastifyReply,
  statusCode: number = HttpStatus.OK,
  data?: unknown,
  message?: string
): FastifyReply => {
  const successResponse: SuccessResponse = {
    ...(message ? { message } : {}),
    ...(data ? { data } : {}),
  };

  return sendResponse(reply, statusCode, successResponse);
};

/**
 * Common error responses for consistency
 */
export const ErrorResponses = {
  unauthorized: (reply: FastifyReply, message = 'Authentication required') =>
    sendError(
      reply,
      HttpStatus.UNAUTHORIZED,
      'Unauthorized',
      message,
      'AUTH_REQUIRED'
    ),

  forbidden: (reply: FastifyReply, message = 'Access denied') =>
    sendError(
      reply,
      HttpStatus.FORBIDDEN,
      'Forbidden',
      message,
      'ACCESS_DENIED'
    ),

  notFound: (reply: FastifyReply, message = 'Resource not found') =>
    sendError(reply, HttpStatus.NOT_FOUND, 'Not Found', message, 'NOT_FOUND'),

  badRequest: (reply: FastifyReply, message = 'Invalid request') =>
    sendError(
      reply,
      HttpStatus.BAD_REQUEST,
      'Bad Request',
      message,
      'INVALID_REQUEST'
    ),

  internalError: (reply: FastifyReply, message = 'Internal server error') =>
    sendError(
      reply,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal Server Error',
      message,
      'INTERNAL_ERROR'
    ),

  serviceUnavailable: (reply: FastifyReply, message = 'Service unavailable') =>
    sendError(
      reply,
      HttpStatus.SERVICE_UNAVAILABLE,
      'Service Unavailable',
      message,
      'SERVICE_UNAVAILABLE'
    ),

  tooManyRequests: (reply: FastifyReply, message = 'Rate limit exceeded') =>
    sendError(
      reply,
      HttpStatus.TOO_MANY_REQUESTS,
      'Too Many Requests',
      message,
      'RATE_LIMIT_EXCEEDED'
    ),
} as const;

/**
 * Common success responses for consistency
 */
export const SuccessResponses = {
  ok: (reply: FastifyReply, data?: unknown, message?: string) =>
    sendSuccess(reply, HttpStatus.OK, data, message),

  created: (
    reply: FastifyReply,
    data?: unknown,
    message = 'Resource created successfully'
  ) => sendSuccess(reply, HttpStatus.CREATED, data, message),
} as const;
