import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(secret: string, message: string | Buffer): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function hmacBase64(secret: string, message: string | Buffer): string {
  return createHmac('sha256', secret).update(message).digest('base64');
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Constant-time comparison. Returns false (instead of throwing like `timingSafeEqual`)
 * when lengths differ.
 */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === 'string' ? Buffer.from(a) : a;
  const bufB = typeof b === 'string' ? Buffer.from(b) : b;
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
