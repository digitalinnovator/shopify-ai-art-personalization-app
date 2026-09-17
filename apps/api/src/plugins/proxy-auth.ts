import { config } from '@aiart/core/config';
import { isValidSessionId, verifyAppProxy } from '@aiart/core/security';
import { getShopByDomain } from '@aiart/core/services';
import type { FastifyInstance } from 'fastify';
import { badRequest, notFound, unauthorized } from '../lib/errors';

export interface ProxyContext {
  shopId: string;
  shopDomain: string;
  sessionId: string;
  customerId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    proxyCtx?: ProxyContext;
  }
}

/**
 * Verifies Shopify's app proxy signature and resolves the shop and shopper session for every
 * request in the current scope. This is a plain function (not `.register()`ed) so its
 * `addHook`/`decorateRequest` calls land directly on the caller's Fastify instance instead of a
 * new encapsulated child — otherwise sibling routes registered on the same instance would not
 * see `request.proxyCtx`.
 *
 * Verification happens in `onRequest`, before Fastify's schema validation would otherwise strip
 * Shopify's query parameters (`shop`, `timestamp`, `signature`, …) as "unknown" fields.
 */
export function installProxyAuth(app: FastifyInstance): void {
  app.decorateRequest('proxyCtx', undefined);

  app.addHook('onRequest', async (request) => {
    const rawUrl = request.raw.url ?? '';
    const queryStart = rawUrl.indexOf('?');
    const params = new URLSearchParams(queryStart >= 0 ? rawUrl.slice(queryStart + 1) : '');

    const secret = config('shopify').SHOPIFY_API_SECRET;
    const result = verifyAppProxy(params, secret);
    if (!result.ok) {
      throw unauthorized('invalid_proxy_signature', `App proxy verification failed (${result.reason})`);
    }

    const sid = params.get('sid');
    if (!isValidSessionId(sid)) {
      throw badRequest('invalid_session', 'Missing or malformed sid query parameter');
    }

    const shop = await getShopByDomain(result.context.shop);
    if (!shop) {
      throw notFound('unknown_shop', `${result.context.shop} is not an installed shop`);
    }

    request.proxyCtx = {
      shopId: shop.id,
      shopDomain: shop.domain,
      sessionId: sid,
      customerId: result.context.loggedInCustomerId || undefined,
    };
  });
}

/** Only call from a handler inside a scope where `installProxyAuth` ran — the hook always sets this first. */
export function requireProxyCtx(request: { proxyCtx?: ProxyContext }): ProxyContext {
  if (!request.proxyCtx) throw new Error('proxyCtx is not set — installProxyAuth did not run for this route');
  return request.proxyCtx;
}
