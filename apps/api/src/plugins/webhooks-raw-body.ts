import type { FastifyInstance } from 'fastify';

/**
 * Webhook HMAC signatures (Shopify's and every provider's) are computed over the exact request
 * bytes. Fastify's default JSON parser would re-encode the body before a handler ever sees it, so
 * this plugin captures the raw buffer instead and leaves parsing to each route — verify first,
 * `JSON.parse` second.
 *
 * A plain function like `installProxyAuth`, so it applies to the caller's own scope rather than a
 * new encapsulated child.
 */
export function installRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
}

export function parseRawJson(raw: Buffer): unknown {
  return JSON.parse(raw.toString('utf8'));
}
