import { hmacHex, safeEqual } from './hmac';

/**
 * Shopify app proxy signatures.
 * https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
 *
 * 1. Drop `signature` from the query.
 * 2. Build `key=value` per key, joining repeated keys' values with `,`.
 * 3. Sort those strings and concatenate them with no separator.
 * 4. HMAC-SHA256 (hex) with the app's shared secret.
 *
 * Empty values (e.g. `logged_in_customer_id=` for guests) are part of the signed message.
 */

export type QueryInput = string | URLSearchParams | Record<string, string | string[]>;

function toEntries(query: QueryInput): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const add = (key: string, value: string) => {
    const values = grouped.get(key);
    if (values) values.push(value);
    else grouped.set(key, [value]);
  };
  if (typeof query === 'string' || query instanceof URLSearchParams) {
    const params = typeof query === 'string' ? new URLSearchParams(query.replace(/^\?/, '')) : query;
    for (const [key, value] of params) add(key, value);
  } else {
    for (const [key, value] of Object.entries(query)) {
      for (const v of Array.isArray(value) ? value : [value]) add(key, v);
    }
  }
  return grouped;
}

export function appProxyMessage(query: QueryInput): string {
  const parts: string[] = [];
  for (const [key, values] of toEntries(query)) {
    if (key === 'signature') continue;
    parts.push(`${key}=${values.join(',')}`);
  }
  // Byte-order sort of the joined strings, as in Shopify's reference implementation.
  parts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return parts.join('');
}

export function signAppProxyQuery(query: QueryInput, secret: string): string {
  return hmacHex(secret, appProxyMessage(query));
}

export interface AppProxyContext {
  shop: string;
  /** Empty string when the shopper is not logged in. */
  loggedInCustomerId: string;
  pathPrefix: string;
  timestamp: number;
}

export type AppProxyVerification =
  | { ok: true; context: AppProxyContext }
  | { ok: false; reason: 'missing_signature' | 'bad_signature' | 'missing_shop' | 'stale_timestamp' };

/** Shopify's own library allows ±90 seconds of clock difference. */
export const APP_PROXY_TOLERANCE_SECONDS = 90;

export function verifyAppProxy(
  query: QueryInput,
  secret: string,
  opts: { nowSeconds?: number; toleranceSeconds?: number } = {},
): AppProxyVerification {
  const entries = toEntries(query);
  const signature = entries.get('signature')?.[0];
  if (!signature) return { ok: false, reason: 'missing_signature' };

  const expected = signAppProxyQuery(query, secret);
  if (!safeEqual(expected, signature.toLowerCase())) return { ok: false, reason: 'bad_signature' };

  const shop = entries.get('shop')?.[0];
  if (!shop) return { ok: false, reason: 'missing_shop' };

  const timestamp = Number(entries.get('timestamp')?.[0]);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? APP_PROXY_TOLERANCE_SECONDS;
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  return {
    ok: true,
    context: {
      shop,
      loggedInCustomerId: entries.get('logged_in_customer_id')?.[0] ?? '',
      pathPrefix: entries.get('path_prefix')?.[0] ?? '',
      timestamp,
    },
  };
}

/**
 * Adds the parameters Shopify's proxy adds and signs the result. Used by the local storefront
 * harness (which imitates the proxy) and by tests.
 */
export function buildSignedProxyQuery(
  original: URLSearchParams,
  opts: {
    shop: string;
    secret: string;
    pathPrefix: string;
    loggedInCustomerId?: string;
    nowSeconds?: number;
  },
): URLSearchParams {
  const params = new URLSearchParams(original);
  params.delete('signature');
  params.set('shop', opts.shop);
  params.set('logged_in_customer_id', opts.loggedInCustomerId ?? '');
  params.set('path_prefix', opts.pathPrefix);
  params.set('timestamp', String(opts.nowSeconds ?? Math.floor(Date.now() / 1000)));
  params.set('signature', signAppProxyQuery(params, opts.secret));
  return params;
}
