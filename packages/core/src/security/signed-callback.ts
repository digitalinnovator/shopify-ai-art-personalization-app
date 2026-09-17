import { hmacHex, safeEqual } from './hmac';

/**
 * Timestamped HMAC used by the mock provider's webhook callbacks (and any future provider that
 * signs with a shared secret): `hex(HMAC-SHA256(secret, "<timestamp>.<rawBody>"))`.
 */
export const SIGNED_CALLBACK_HEADERS = {
  signature: 'x-callback-signature',
  timestamp: 'x-callback-timestamp',
} as const;

export function signCallback(rawBody: Buffer | string, secret: string, timestamp: number): string {
  return hmacHex(secret, `${timestamp}.${rawBody.toString()}`);
}

export function verifyCallback(
  rawBody: Buffer | string,
  headers: { signature?: string; timestamp?: string },
  secret: string,
  opts: { nowSeconds?: number; toleranceSeconds?: number } = {},
): boolean {
  const timestamp = Number(headers.timestamp);
  if (!headers.signature || !Number.isFinite(timestamp)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (opts.toleranceSeconds ?? 300)) return false;
  return safeEqual(signCallback(rawBody, secret, timestamp), headers.signature.toLowerCase());
}
