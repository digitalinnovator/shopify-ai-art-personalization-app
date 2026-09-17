import { ProviderPermanentError, ProviderTemporaryError } from '../types';

export const MAX_RESULT_BYTES = 25 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 30_000;

/** `fetch` with a hard timeout, also cancelled by the caller's abort signal. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Wraps a network failure as temporary so the queue retries it. */
export function temporary(label: string, what: string, err: unknown): ProviderTemporaryError {
  return new ProviderTemporaryError(
    `${label}: ${what} (${err instanceof Error ? err.message : String(err)})`,
  );
}

/** Reads a provider error body, whatever shape it has, into one line for the admin's error column. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text) as {
        error?: { message?: string; code?: string } | string;
        message?: string;
        detail?: unknown;
      };
      if (typeof data.error === 'string') return data.error;
      if (data.error?.message) return data.error.message;
      if (data.message) return data.message;
      if (data.detail) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {
      // not JSON
    }
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Maps an HTTP status to the retry class the worker understands. Auth and bad requests never
 * get better on retry; rate limits and server errors usually do.
 */
export async function throwForStatus(label: string, res: Response): Promise<never> {
  const detail = await errorMessage(res);
  const suffix = detail ? `: ${detail}` : '';
  if (res.status === 401 || res.status === 403)
    throw new ProviderPermanentError(`${label}: authentication failed (${res.status})${suffix}`);
  if (res.status === 404)
    throw new ProviderPermanentError(`${label}: unknown model or endpoint (404)${suffix}`);
  if (res.status === 400 || res.status === 422)
    throw new ProviderPermanentError(`${label}: invalid request (${res.status})${suffix}`);
  if (res.status === 402) throw new ProviderPermanentError(`${label}: billing problem (402)${suffix}`);
  throw new ProviderTemporaryError(`${label}: request failed (${res.status})${suffix}`);
}

/** Downloads a result image with a size cap; result URLs are short lived, so call it promptly. */
export async function downloadImage(
  label: string,
  url: string,
  signal: AbortSignal,
  init: RequestInit = {},
): Promise<{ bytes: Buffer; contentType: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, signal);
  } catch (err) {
    throw temporary(label, 'downloading the result image failed', err);
  }
  if (!res.ok)
    throw new ProviderTemporaryError(`${label}: downloading the result image failed (${res.status})`);
  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_RESULT_BYTES)
    throw new ProviderPermanentError(`${label}: result image exceeds the size limit`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_RESULT_BYTES)
    throw new ProviderPermanentError(`${label}: result image exceeds the size limit`);
  return { bytes, contentType: res.headers.get('content-type')?.split(';')[0] || 'image/png' };
}

export function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}
