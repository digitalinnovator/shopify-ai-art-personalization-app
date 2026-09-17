import { hmacBase64, safeEqual } from './hmac';

/**
 * Shopify webhook HMAC: base64 HMAC-SHA256 of the raw request body with the app's client secret,
 * sent in `X-Shopify-Hmac-Sha256`. Must be computed over the exact bytes received.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https
 */
export function signShopifyWebhook(rawBody: Buffer | string, secret: string): string {
  return hmacBase64(secret, rawBody);
}

export function verifyShopifyWebhook(
  rawBody: Buffer | string,
  hmacHeader: string | undefined | null,
  secret: string,
): boolean {
  if (!hmacHeader) return false;
  const expected = Buffer.from(signShopifyWebhook(rawBody, secret), 'base64');
  const received = Buffer.from(hmacHeader.trim(), 'base64');
  return safeEqual(expected, received);
}

/** Headers Shopify sends with every webhook delivery (lower-cased as Node exposes them). */
export const SHOPIFY_WEBHOOK_HEADERS = {
  hmac: 'x-shopify-hmac-sha256',
  topic: 'x-shopify-topic',
  shopDomain: 'x-shopify-shop-domain',
  webhookId: 'x-shopify-webhook-id',
  eventId: 'x-shopify-event-id',
  triggeredAt: 'x-shopify-triggered-at',
  apiVersion: 'x-shopify-api-version',
} as const;
