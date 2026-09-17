import { config } from '@aiart/core/config';
import type { FastifyRequest } from 'fastify';

/**
 * Best-effort shopper IP behind Shopify's app proxy. `request.ip` is Shopify's own egress IP
 * (Fastify's default trust-proxy behaviour does not apply here, since Shopify — not our own load
 * balancer — is the one adding the header), so rate limiting must read the forwarded header
 * instead.
 *
 * Convention: the first address in `X-Forwarded-For` is the original client. This is a
 * reasonable default but is unverified against Shopify's exact proxy behaviour — confirm it
 * against real traffic before relying on it in production (see docs/GO-LIVE.md).
 */
export function clientIp(request: FastifyRequest): string {
  const header = config('api').CLIENT_IP_HEADER;
  const value = request.headers[header];
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(',')[0]?.trim();
  return first || request.ip;
}
