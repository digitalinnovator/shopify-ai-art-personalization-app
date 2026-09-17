import { config } from '@aiart/core/config';
import type { Shop } from '@aiart/core/db';
import { ensureShop, getShopByDomain } from '@aiart/core/services';
import { redirect } from 'react-router';
import { getSession } from './session.server';

export interface AuthContext {
  shop: Shop;
  /** True when authenticated by Shopify (embedded in the admin), false for the local mock login. */
  embedded: boolean;
}

/**
 * `AUTH_MODE=shopify`: `@shopify/shopify-app-react-router` verifies the embedded app's session
 * token (or runs the install/token-exchange flow) and tells us which shop this is; the shop row is
 * created on first sight, so installing on a new store needs no manual step.
 *
 * `AUTH_MODE=mock`: trusts a signed cookie session set by `/login`. Never real authentication, so
 * it is refused outside development.
 */
export async function requireShop(request: Request): Promise<AuthContext> {
  const { AUTH_MODE } = config('admin');
  if (AUTH_MODE === 'shopify') {
    const { authenticate } = await import('../shopify.server');
    const { session } = await authenticate.admin(request);
    const shop = await ensureShop(session.shop);
    return { shop, embedded: true };
  }
  if (config('app').NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=mock must never run in production.');
  }
  const session = await getSession(request);
  const domain = session.get('shopDomain') as string | undefined;
  if (!domain) throw redirect('/login');
  const shop = await getShopByDomain(domain);
  if (!shop) throw redirect('/login');
  return { shop, embedded: false };
}
