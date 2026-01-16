import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

type ValidationIssue = {
  instancePath?: string;
  dataPath?: string;
  message?: string;
  params?: { missingProperty?: string };
};

type ValidationErrorDetail = {
  field: string;
  message: string;
};

type ErrorDetails = {
  timestamp: string;
  path: string;
  errors?: ValidationErrorDetail[];
};

const statusLabels: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

const statusCodes: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'AUTH_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMIT_EXCEEDED',
  503: 'SERVICE_UNAVAILABLE',
};

const normalizeValidationField = (issue: ValidationIssue): string => {
  if (issue.instancePath) {
    const trimmed = issue.instancePath.replace(/^\//, '').replace(/\//g, '.');
    if (trimmed) {
      return trimmed;
    }
  }
  if (issue.dataPath) {
    const trimmed = issue.dataPath.replace(/^\./, '').replace(/\//g, '.');
    if (trimmed) {
      return trimmed;
    }
  }
  if (issue.params?.missingProperty) {
    return issue.params.missingProperty;
  }
  return 'body';
};

export async function errorHandler(
  this: unknown,
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const statusCode = error.statusCode ?? 500;
  const isValidationError =
    error.code === 'FST_ERR_VALIDATION' ||
    Array.isArray((error as any).validation);
  const timestamp = new Date().toISOString();

  if (statusCode >= 500) {
    request.log.error(error, 'Internal server error');
  } else {
    request.log.warn(error, 'Client error');
  }

  const errorLabel =
    statusCode >= 500
      ? 'Internal Server Error'
      : statusLabels[statusCode] || 'Bad Request';
  const message =
    statusCode >= 500
      ? 'Internal Server Error'
      : isValidationError
        ? 'Validation failed'
        : error.message;
  const code =
    statusCode >= 500
      ? 'INTERNAL_ERROR'
      : isValidationError
        ? 'INVALID_REQUEST'
        : statusCodes[statusCode] || 'INVALID_REQUEST';

  const details: ErrorDetails = {
    timestamp,
    path: request.url,
  };

  if (isValidationError) {
    const validationIssues = ((error as any).validation ||
      []) as ValidationIssue[];
    details.errors = validationIssues.map(issue => ({
      field: normalizeValidationField(issue),
      message: issue.message || 'Invalid request',
    }));
  }

  await reply.status(statusCode).send({
    error: errorLabel,
    message,
    code,
    details,
  });
}
