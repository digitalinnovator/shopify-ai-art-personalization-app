import { timingSafeEqual } from 'node:crypto';
import { config } from '../../config';
import type { GenerationRequest } from '../../templates';
import { resolveDimensions } from '../../templates';
import {
  type GeneratedImage,
  type ImageProvider,
  type ParsedWebhook,
  type ProviderContext,
  ProviderPermanentError,
  ProviderTemporaryError,
  type SubmitResult,
} from '../types';
import { downloadImage, fetchWithTimeout, temporary, throwForStatus } from './shared';

/**
 * Black Forest Labs API (asynchronous: submit, then poll or receive a webhook).
 * https://docs.bfl.ml
 *
 * Models are endpoint names: flux-2-pro, flux-2-max, flux-2-flex, flux-kontext-pro,
 * flux-kontext-max. FLUX.2 takes up to 8 reference images as `input_image`, `input_image_2`
 * and so on; Kontext takes one. The customer photo is always `input_image`.
 *
 * Results are fetched from the polling URL captured at submit time, never from a webhook body,
 * and BFL deletes them after about ten minutes, so `finalize` downloads promptly.
 *
 * Slot settings understood: `safety_tolerance` (0 strict to 6 permissive, default 2),
 * `guidance`, `steps` (Flex only), `prompt_upsampling`.
 */

const LABEL = 'bfl';
const BASE_URL = 'https://api.bfl.ai/v1';
const MAX_INPUT_IMAGES = 8;

function apiKey(): string {
  const key = config('providers').BFL_API_KEY;
  if (!key) throw new ProviderPermanentError('BFL_API_KEY is not configured');
  return key;
}

function isKontext(model: string): boolean {
  return model.includes('kontext');
}

/** FLUX.2 sizes are given in pixels, multiples of 16, and we stay under 4 megapixels. */
export function dimensionsFor(output: GenerationRequest['output']): { width: number; height: number } {
  const { width, height } = resolveDimensions(output.aspectRatio, Math.min(output.longEdge, 2048));
  const snap = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  return { width: snap(width), height: snap(height) };
}

function dataUri(img: ProviderContext['images'][number]): string {
  return img.bytes.toString('base64');
}

export function buildBody(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Record<string, unknown> {
  const images = isKontext(model) ? ctx.images.slice(0, 1) : ctx.images.slice(0, MAX_INPUT_IMAGES);
  const inputs: Record<string, string> = {};
  images.forEach((img, i) => {
    inputs[i === 0 ? 'input_image' : `input_image_${i + 1}`] = dataUri(img);
  });
  const { safety_tolerance: safety, ...rest } = request.settings;
  const providerConfig = config('providers');
  return {
    prompt: request.prompt,
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    safety_tolerance: typeof safety === 'number' ? safety : 2,
    output_format: 'png',
    ...(isKontext(model) ? { aspect_ratio: request.output.aspectRatio } : dimensionsFor(request.output)),
    ...inputs,
    ...(providerConfig.BFL_WEBHOOK_SECRET
      ? { webhook_url: ctx.webhookUrl, webhook_secret: providerConfig.BFL_WEBHOOK_SECRET }
      : {}),
    ...rest,
  };
}

interface SubmitResponse {
  id: string;
  polling_url: string;
}

interface PollResponse {
  id?: string;
  status:
    | 'Pending'
    | 'Ready'
    | 'Error'
    | 'Content Moderated'
    | 'Request Moderated'
    | 'Task not found'
    | string;
  result?: { sample?: string };
  details?: unknown;
}

async function submit(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE_URL}/${encodeURIComponent(model)}`,
      {
        method: 'POST',
        headers: { 'x-key': apiKey(), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(buildBody(model, request, ctx)),
      },
      ctx.signal,
    );
  } catch (err) {
    throw temporary(LABEL, 'request failed', err);
  }
  if (!res.ok) await throwForStatus(LABEL, res);

  const data = (await res.json()) as SubmitResponse;
  if (!data.id || !data.polling_url)
    throw new ProviderPermanentError(`${LABEL}: submit response had no id or polling url`);
  return { kind: 'pending', requestId: data.id, pollUrl: data.polling_url };
}

async function fetchResult(pollUrl: string, signal: AbortSignal): Promise<GeneratedImage[]> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      pollUrl,
      { headers: { 'x-key': apiKey(), accept: 'application/json' } },
      signal,
    );
  } catch (err) {
    throw temporary(LABEL, 'fetching the result failed', err);
  }
  if (!res.ok) await throwForStatus(LABEL, res);

  const data = (await res.json()) as PollResponse;
  switch (data.status) {
    case 'Ready': {
      const url = data.result?.sample;
      if (!url) throw new ProviderPermanentError(`${LABEL}: result had no image`);
      return [await downloadImage(LABEL, url, signal)];
    }
    case 'Pending':
      throw new ProviderTemporaryError(`${LABEL}: result not ready yet`);
    case 'Content Moderated':
    case 'Request Moderated':
      throw new ProviderPermanentError(`${LABEL}: declined by the content filter (${data.status})`);
    case 'Task not found':
      throw new ProviderPermanentError(`${LABEL}: request expired or unknown`);
    default:
      throw new ProviderPermanentError(
        `${LABEL}: generation failed (${data.status})${data.details ? `: ${JSON.stringify(data.details).slice(0, 200)}` : ''}`,
      );
  }
}

/** BFL echoes the `webhook_secret` from the request back as a header; compare in constant time. */
function verifyWebhook(_rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
  const expected = config('providers').BFL_WEBHOOK_SECRET;
  const received = headers['x-webhook-secret'];
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseWebhook(body: unknown): ParsedWebhook {
  const b = body as { id?: string; status?: string; error?: string };
  const requestId = String(b.id ?? '');
  if (b.status === 'Ready') return { kind: 'completed', requestId, images: [] };
  return {
    kind: 'failed',
    requestId,
    message: b.error ?? `bfl reported ${b.status ?? 'an error'}`,
    temporary: false,
  };
}

export const bflProvider: ImageProvider = {
  id: 'bfl',
  supportsWebhook: true,
  submit,
  fetchResult,
  verifyWebhook,
  parseWebhook,
};

export function bflConfigured(): boolean {
  return Boolean(config('providers').BFL_API_KEY);
}
