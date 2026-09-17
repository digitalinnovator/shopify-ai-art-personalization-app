import type { GenerationRequest } from '../templates';

/** Bytes resolved for each image role the request needs, plus a public URL when storage exposes one. */
export interface ResolvedImage {
  role: GenerationRequest['images'][number]['role'];
  bytes: Buffer;
  contentType: string;
  /** Present only when the storage endpoint is reachable from the provider (Section B / live use). */
  publicUrl?: string;
}

export interface ProviderContext {
  images: ResolvedImage[];
  /** Where this provider's async callback should be sent: `{WEBHOOK_PUBLIC_URL or API_PUBLIC_URL}/webhooks/ai/{id}`. */
  webhookUrl: string;
  signal: AbortSignal;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
}

export type SubmitResult =
  | { kind: 'completed'; images: GeneratedImage[] }
  | { kind: 'pending'; requestId: string; pollUrl: string }
  | { kind: 'refused'; message: string };

export type ParsedWebhook =
  | { kind: 'completed'; requestId: string; images: GeneratedImage[] }
  | { kind: 'failed'; requestId: string; message: string; temporary: boolean };

/**
 * One interface over every image-generation backend (the mock provider, and fal/BFL/Gemini/OpenAI
 * in Section B). A design's slot names a provider id and model id from this registry; swapping
 * models is a config change, never a code change.
 */
export interface ImageProvider {
  id: string;
  supportsWebhook: boolean;

  submit(model: string, request: GenerationRequest, ctx: ProviderContext): Promise<SubmitResult>;

  /**
   * Verifies an incoming webhook's authenticity. Only defined when `supportsWebhook` is true.
   * Most providers check this synchronously (HMAC with a local secret); fal's needs an async JWKS
   * fetch, so callers must always `await` the result even for providers that return a plain
   * boolean — awaiting a non-promise value is a no-op.
   */
  verifyWebhook?(rawBody: Buffer, headers: Record<string, string | undefined>): boolean | Promise<boolean>;

  /** Parses a verified webhook body. Never trust URLs inside it — only the request id. */
  parseWebhook?(body: unknown): ParsedWebhook;

  /** Re-fetches a result from the URL captured at submit time (never from a callback body). */
  fetchResult?(pollUrl: string, signal: AbortSignal): Promise<GeneratedImage[]>;
}

/** Timed out waiting for the provider. Workers treat this the same as a temporary error (retry). */
export class ProviderTimeoutError extends Error {
  override name = 'ProviderTimeoutError';
}

/** A network hiccup or 5xx — worth retrying with the queue's backoff. */
export class ProviderTemporaryError extends Error {
  override name = 'ProviderTemporaryError';
}

/** Retrying would not help (bad request, invalid model, quota exhausted) — fail at once. */
export class ProviderPermanentError extends Error {
  override name = 'ProviderPermanentError';
}
