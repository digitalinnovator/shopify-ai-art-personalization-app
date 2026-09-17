import { describe, expect, it } from 'vitest';
import {
  appProxyMessage,
  buildSignedProxyQuery,
  hashToken,
  isValidSessionId,
  randomToken,
  safeEqual,
  signAppProxyQuery,
  signCallback,
  signShopifyWebhook,
  verifyAppProxy,
  verifyCallback,
  verifyShopifyWebhook,
} from '../src/security';

const SECRET = 'hush';
const NOW = 1_700_000_000;

describe('app proxy signature', () => {
  // The example from Shopify's "Authenticate app proxies" docs.
  const docsQuery =
    'extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb';

  it('builds the canonical message like the docs (sorted, multi-values joined with commas)', () => {
    expect(appProxyMessage(docsQuery)).toBe(
      'extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555',
    );
  });

  it('verifies the docs example signature', () => {
    const result = verifyAppProxy(docsQuery, SECRET, { nowSeconds: 1317327555 });
    expect(result).toEqual({
      ok: true,
      context: {
        shop: 'shop-name.myshopify.com',
        loggedInCustomerId: '1',
        pathPrefix: '/apps/awesome_reviews',
        timestamp: 1317327555,
      },
    });
  });

  const signed = () =>
    buildSignedProxyQuery(new URLSearchParams('sid=abc'), {
      shop: 'dev-store.myshopify.com',
      secret: SECRET,
      pathPrefix: '/apps/ai-art',
      nowSeconds: NOW,
    });

  it('accepts a freshly signed query, including an empty logged_in_customer_id', () => {
    const q = signed();
    expect(q.get('logged_in_customer_id')).toBe('');
    const result = verifyAppProxy(q, SECRET, { nowSeconds: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.loggedInCustomerId).toBe('');
  });

  it('rejects a tampered parameter', () => {
    const q = signed();
    q.set('sid', 'someone-else');
    expect(verifyAppProxy(q, SECRET, { nowSeconds: NOW })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects the wrong secret', () => {
    expect(verifyAppProxy(signed(), 'other', { nowSeconds: NOW })).toMatchObject({ ok: false });
  });

  it('rejects a missing signature', () => {
    const q = signed();
    q.delete('signature');
    expect(verifyAppProxy(q, SECRET, { nowSeconds: NOW })).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it('rejects a signature of the wrong length without throwing', () => {
    const q = signed();
    q.set('signature', 'abc');
    expect(verifyAppProxy(q, SECRET, { nowSeconds: NOW })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects stale and future timestamps beyond 90 seconds', () => {
    expect(verifyAppProxy(signed(), SECRET, { nowSeconds: NOW + 91 })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verifyAppProxy(signed(), SECRET, { nowSeconds: NOW - 91 })).toMatchObject({ ok: false });
    expect(verifyAppProxy(signed(), SECRET, { nowSeconds: NOW + 90 }).ok).toBe(true);
  });

  it('treats an added duplicate value as tampering', () => {
    const q = signed();
    q.append('sid', 'second');
    expect(verifyAppProxy(q, SECRET, { nowSeconds: NOW }).ok).toBe(false);
  });

  it('signs the same message from an object or a query string', () => {
    const obj = { shop: 's.myshopify.com', a: ['1', '2'], timestamp: '5' };
    expect(signAppProxyQuery(obj, SECRET)).toBe(
      signAppProxyQuery('a=1&a=2&shop=s.myshopify.com&timestamp=5', SECRET),
    );
  });
});

describe('Shopify webhook HMAC', () => {
  const body = Buffer.from('{"id":820982911946154508,"email":"jon@example.com"}');

  it('verifies a signature over the raw bytes', () => {
    expect(verifyShopifyWebhook(body, signShopifyWebhook(body, SECRET), SECRET)).toBe(true);
  });

  it('fails when the body is re-serialized differently', () => {
    const header = signShopifyWebhook(body, SECRET);
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verifyShopifyWebhook(reserialized, header, SECRET)).toBe(false);
  });

  it('fails for a missing, garbage or wrong-secret header', () => {
    expect(verifyShopifyWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyShopifyWebhook(body, 'not-base64!!', SECRET)).toBe(false);
    expect(verifyShopifyWebhook(body, signShopifyWebhook(body, 'other'), SECRET)).toBe(false);
  });
});

describe('signed provider callbacks', () => {
  const body = '{"requestId":"r1","status":"OK"}';

  it('verifies within the time window and rejects outside it', () => {
    const sig = signCallback(body, SECRET, NOW);
    expect(
      verifyCallback(body, { signature: sig, timestamp: String(NOW) }, SECRET, { nowSeconds: NOW }),
    ).toBe(true);
    expect(
      verifyCallback(body, { signature: sig, timestamp: String(NOW) }, SECRET, { nowSeconds: NOW + 301 }),
    ).toBe(false);
  });

  it('rejects a changed body or timestamp', () => {
    const sig = signCallback(body, SECRET, NOW);
    expect(
      verifyCallback(`${body} `, { signature: sig, timestamp: String(NOW) }, SECRET, { nowSeconds: NOW }),
    ).toBe(false);
    expect(
      verifyCallback(body, { signature: sig, timestamp: String(NOW + 1) }, SECRET, { nowSeconds: NOW }),
    ).toBe(false);
  });
});

describe('tokens', () => {
  it('creates url-safe random tokens and stable hashes', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('validates session ids', () => {
    expect(isValidSessionId(randomToken(16))).toBe(true);
    expect(isValidSessionId('short')).toBe(false);
    expect(isValidSessionId('has spaces in it and is long enough')).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
  });

  it('safeEqual handles length mismatch and empty input', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});
