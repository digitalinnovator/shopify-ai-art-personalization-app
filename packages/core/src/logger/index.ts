import { type Logger, pino } from 'pino';
import { config } from '../config';

export type { Logger };

/** Session ids and selection tokens are bearer secrets; signatures and keys must never reach logs. */
const REDACT_PATHS = [
  'sid',
  '*.sid',
  'token',
  '*.token',
  'selectionToken',
  '*.selectionToken',
  'apiKey',
  '*.apiKey',
  'headers.authorization',
  'req.headers.authorization',
  'req.headers["x-shopify-hmac-sha256"]',
  'req.headers["x-fal-webhook-signature"]',
  'req.headers["x-webhook-secret"]',
  // The storefront's session id and Shopify's app-proxy signature both travel in the query
  // string, so the whole request URL is redacted from Fastify's access logs rather than only
  // the path (matching Fastify's default req serializer output shape).
  'req.url',
];

let root: Logger | undefined;

export function logger(name?: string): Logger {
  if (!root) {
    const { NODE_ENV, LOG_LEVEL } = config('app');
    const pretty = NODE_ENV === 'development' && process.stdout.isTTY;
    root = pino({
      level: LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      ...(pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : {}),
    });
  }
  return name ? root.child({ name }) : root;
}
