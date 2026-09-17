import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ApiError } from '../lib/errors';

/** Every error response has the same shape: `{ error: { code, message } }`. */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError | ApiError>((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.status(400).send({
        error: {
          code: 'validation_error',
          message: error.validation.map((v) => `${v.instancePath || 'body'} ${v.message}`).join('; '),
        },
      });
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
    reply.status(statusCode).send({
      error: {
        code: statusCode === 500 ? 'internal_error' : 'request_error',
        message: statusCode === 500 ? 'Something went wrong.' : error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });
}
