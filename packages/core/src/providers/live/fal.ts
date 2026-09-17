import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { config } from '../../config';
import { sha256Hex } from '../../security';
import type { GenerationRequest } from '../../templates';
import {
  type GeneratedImage,
  type ImageProvider,
  type ParsedWebhook,
  type ProviderContext,
  ProviderPermanentError,
  ProviderTemporaryError,
  type SubmitResult,
} from '../types';

/**
 * fal's queue API. https://fal.ai/docs/model-apis/model-endpoints/queue
 * Every call here is written against the documented shapes but has not been run against a real
 * fal account (no API key in this environment) — re-verify field names once a key is available
 * (docs/GO-LIVE.md), ideally with `scripts/compare-models.ts`.
 *
 * Model ids are whatever the design's slot config names, e.g. `fal-ai/flux-2-pro/edit` or
 * `fal-ai/nano-banana-2/edit` — this adapter has no per-model branching.
 */

const FAL_BASE = 'https://queue.fal.run';
const JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
const JWKS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // fal: don't cache keys longer than this
const WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_RESULT_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

interface FalSubmitResponse {
  request_id: string;
  response_url: string;
  status_url: string;
  cancel_url: string;
}

interface FalResultImage {
  url: string;
  content_type?: string;
}

interface FalResultPayload {
  images?: FalResultImage[];
}

function apiKey(): string {
  const key = config('providers').FAL_KEY;
  if (!key) throw new ProviderPermanentError('FAL_KEY is not configured');
  return key;
}

/**
 * fal's edit models take a flat `image_urls` array with no role labels, so `subject`, `scene` and
 * `style` images are conveyed only by their position (subject first, per `buildGenerationRequest`)
 * — there is no per-role field to target instead.
 */
function imageUrls(images: ProviderContext['images']): string[] {
  return images.map((img) => {
    if (img.publicUrl) return img.publicUrl;
    // Fallback when storage isn't publicly reachable. Whether fal accepts data URIs in
    // `image_urls` is unconfirmed — verify before depending on this path in production.
    return `data:${img.contentType};base64,${img.bytes.toString('base64')}`;
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function submit(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Promise<SubmitResult> {
  const body = {
    prompt: request.prompt,
    image_urls: imageUrls(ctx.images),
    seed: request.seed,
    ...request.settings,
  };

  const url = `${FAL_BASE}/${model}?fal_webhook=${encodeURIComponent(ctx.webhookUrl)}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { authorization: `Key ${apiKey()}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      ctx.signal,
    );
  } catch (err) {
    throw new ProviderTemporaryError(
      `fal: request failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  if (res.status === 401 || res.status === 403)
    throw new ProviderPermanentError(`fal: authentication failed (${res.status})`);
  if (res.status === 422 || res.status === 400)
    throw new ProviderPermanentError(`fal: invalid request (${res.status})`);
  if (!res.ok) throw new ProviderTemporaryError(`fal: submit failed (${res.status})`);

  const data = (await res.json()) as FalSubmitResponse;
  // The result URL is captured now and is the only thing `fetchResult` ever trusts later —
  // never a URL taken from a webhook body.
  return { kind: 'pending', requestId: data.request_id, pollUrl: data.response_url };
}

async function fetchResult(pollUrl: string, signal: AbortSignal): Promise<GeneratedImage[]> {
  let res: Response;
  try {
    res = await fetchWithTimeout(pollUrl, { headers: { authorization: `Key ${apiKey()}` } }, signal);
  } catch (err) {
    throw new ProviderTemporaryError(
      `fal: fetching result failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (res.status === 404) throw new ProviderTemporaryError('fal: result not ready yet');
  if (!res.ok) throw new ProviderTemporaryError(`fal: result fetch failed (${res.status})`);

  const payload = (await res.json()) as FalResultPayload;
  const images = payload.images ?? [];
  if (images.length === 0) throw new ProviderPermanentError('fal: result contained no images');

  const downloaded: GeneratedImage[] = [];
  for (const image of images) {
    const imageRes = await fetchWithTimeout(image.url, {}, signal);
    if (!imageRes.ok)
      throw new ProviderTemporaryError(`fal: downloading result image failed (${imageRes.status})`);
    const contentLength = Number(imageRes.headers.get('content-length') ?? '0');
    if (contentLength > MAX_RESULT_BYTES)
      throw new ProviderPermanentError('fal: result image exceeds the size limit');
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    if (bytes.length > MAX_RESULT_BYTES)
      throw new ProviderPermanentError('fal: result image exceeds the size limit');
    downloaded.push({
      bytes,
      contentType: image.content_type ?? imageRes.headers.get('content-type') ?? 'image/png',
    });
  }
  return downloaded;
}

// --- webhook verification: ED25519 over `requestId\nuserId\ntimestamp\nsha256(body)` ---

interface JwksKey {
  kty: string;
  crv: string;
  x: string;
}

let jwksCache: { keys: JwksKey[]; fetchedAt: number } | undefined;

async function getJwks(): Promise<JwksKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_MAX_AGE_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`fal: could not fetch JWKS (${res.status})`);
  const data = (await res.json()) as { keys: JwksKey[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function verifyWithKey(message: Buffer, signature: Buffer, jwk: JwksKey): boolean {
  try {
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: jwk.crv, x: jwk.x }, format: 'jwk' });
    return verifySignature(null, message, publicKey, signature);
  } catch {
    return false;
  }
}

async function verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<boolean> {
  const requestId = headers['x-fal-webhook-request-id'];
  const userId = headers['x-fal-webhook-user-id'];
  const timestamp = headers['x-fal-webhook-timestamp'];
  const signatureHex = headers['x-fal-webhook-signature'];
  if (!requestId || !userId || !timestamp || !signatureHex) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const message = Buffer.from([requestId, userId, timestamp, sha256Hex(rawBody)].join('\n'));
  const signature = Buffer.from(signatureHex, 'hex');
  const keys = await getJwks();
  return keys.some((key) => verifyWithKey(message, signature, key));
}

function parseWebhook(body: unknown): ParsedWebhook {
  const b = body as { request_id: string; status: 'OK' | 'ERROR'; error?: string };
  if (b.status === 'OK') return { kind: 'completed', requestId: b.request_id, images: [] };
  return {
    kind: 'failed',
    requestId: b.request_id,
    message: b.error ?? 'fal reported an error',
    temporary: false,
  };
}

export const falProvider: ImageProvider = {
  id: 'fal',
  supportsWebhook: true,
  submit,
  verifyWebhook,
  parseWebhook,
  fetchResult,
};

/** Registers the fal adapter only when FAL_KEY is set — see registerLiveProviders in ../index.ts. */
export function falConfigured(): boolean {
  return Boolean(config('providers').FAL_KEY);
}
