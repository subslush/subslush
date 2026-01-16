import Fastify, { FastifyInstance } from 'fastify';
import { errorHandler } from '../middleware/errorHandler';

describe('Error handler response format', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);

    app.post(
      '/validate',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
      async () => ({ ok: true })
    );

    app.get('/boom', async () => {
      throw new Error('boom');
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns standard envelope for validation errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body).toMatchObject({
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'INVALID_REQUEST',
    });
    expect(body.details).toEqual(
      expect.objectContaining({
        path: '/validate',
        errors: expect.any(Array),
      })
    );
    expect(body.details.errors[0]).toEqual(
      expect.objectContaining({
        field: expect.any(String),
        message: expect.any(String),
      })
    );
  });

  it('returns standard envelope for internal errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/boom',
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body).toMatchObject({
      error: 'Internal Server Error',
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
    expect(body.details).toEqual(
      expect.objectContaining({
        path: '/boom',
      })
    );
  });
});
