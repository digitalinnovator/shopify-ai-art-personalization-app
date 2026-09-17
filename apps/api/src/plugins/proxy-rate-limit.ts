import { redisConnection } from '@aiart/core/queue';
import { getShop } from '@aiart/core/services';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { clientIp } from '../lib/client-ip';

const DEFAULT_PER_MINUTE = 30;

/**
 * Limits storefront traffic per shopper, using each shop's own configured limit. Keyed by shop +
 * IP + logged-in customer id (when present) — `proxyCtx` is always set by the time this runs,
 * because `@fastify/rate-limit` hooks into `preHandler`, which always fires after the
 * `onRequest` hook that sets it.
 */
export async function installProxyRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    timeWindow: '1 minute',
    redis: redisConnection(),
    nameSpace: 'aiart-rl-',
    max: async (request) => {
      const shopId = request.proxyCtx?.shopId;
      if (!shopId) return DEFAULT_PER_MINUTE;
      const shop = await getShop(shopId);
      return shop?.settings.rateLimitPerMinute ?? DEFAULT_PER_MINUTE;
    },
    keyGenerator: (request) => {
      const ctx = request.proxyCtx;
      return `${ctx?.shopId ?? 'unknown'}:${clientIp(request)}:${ctx?.customerId ?? ''}`;
    },
    errorResponseBuilder: () => ({
      error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' },
    }),
  });
}
