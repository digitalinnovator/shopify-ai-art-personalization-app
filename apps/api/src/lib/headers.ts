import type { IncomingHttpHeaders } from 'node:http';

/** Fastify/Node header values can be `string | string[] | undefined`; providers just want the first value. */
export function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}
