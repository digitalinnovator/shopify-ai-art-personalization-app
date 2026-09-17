import { config } from '../../config';
import type { GenerationRequest } from '../../templates';
import {
  type ImageProvider,
  type ProviderContext,
  ProviderPermanentError,
  type SubmitResult,
} from '../types';
import { errorMessage, extensionFor, fetchWithTimeout, temporary, throwForStatus } from './shared';

/**
 * OpenAI Images API, edits endpoint (synchronous).
 * https://developers.openai.com/api/reference/resources/images/methods/edit
 *
 * The customer photo goes first in `image[]`, then the design's scene and style images, so the
 * prompt can refer to "the first image" for the person. Models: gpt-image-2, gpt-image-2.5-*,
 * gpt-image-1.5, gpt-image-1-mini (see the catalog in @aiart/contracts).
 *
 * Slot settings understood: `quality` (low | medium | high | auto, default medium),
 * `moderation` (auto | low), `background` (auto | transparent | opaque).
 */

const LABEL = 'openai';
const EDITS_URL = 'https://api.openai.com/v1/images/edits';
const GENERATION_TIMEOUT_MS = 120_000;

function apiKey(): string {
  const key = config('providers').OPENAI_API_KEY;
  if (!key) throw new ProviderPermanentError('OPENAI_API_KEY is not configured');
  return key;
}

/** GPT Image models accept square, portrait or landscape at these fixed sizes; we resize after. */
export function sizeFor(output: GenerationRequest['output']): '1024x1024' | '1024x1536' | '1536x1024' {
  const [w, h] = output.aspectRatio.split(':').map(Number) as [number, number];
  if (w > h) return '1536x1024';
  if (h > w) return '1024x1536';
  return '1024x1024';
}

function settingString(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildForm(model: string, request: GenerationRequest, ctx: ProviderContext): FormData {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', request.prompt);
  form.append('n', '1');
  form.append('size', sizeFor(request.output));
  form.append('output_format', 'png');
  form.append('quality', settingString(request.settings, 'quality') ?? 'medium');
  const moderation = settingString(request.settings, 'moderation');
  if (moderation) form.append('moderation', moderation);
  const background = settingString(request.settings, 'background');
  if (background) form.append('background', background);
  // Only the 1.x models take input_fidelity; gpt-image-2 always uses high fidelity and rejects it.
  if (model.startsWith('gpt-image-1')) form.append('input_fidelity', 'high');
  for (const img of ctx.images) {
    form.append(
      'image[]',
      new Blob([new Uint8Array(img.bytes)], { type: img.contentType }),
      `${img.role}.${extensionFor(img.contentType)}`,
    );
  }
  return form;
}

interface EditsResponse {
  data?: { b64_json?: string; url?: string }[];
}

interface OpenAiError {
  error?: { code?: string; type?: string; message?: string };
}

async function submit(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      EDITS_URL,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey()}` },
        body: buildForm(model, request, ctx),
      },
      ctx.signal,
      GENERATION_TIMEOUT_MS,
    );
  } catch (err) {
    throw temporary(LABEL, 'request failed', err);
  }

  if (res.status === 400) {
    // A content filter rejection is a refusal (customer facing message), not a bug.
    const text = await res.clone().text();
    let parsed: OpenAiError = {};
    try {
      parsed = JSON.parse(text) as OpenAiError;
    } catch {
      // handled below
    }
    const code = parsed.error?.code ?? '';
    const message = parsed.error?.message ?? '';
    if (code === 'moderation_blocked' || /safety|moderation|content policy/i.test(message)) {
      return { kind: 'refused', message: 'This request was declined by the content filter.' };
    }
  }
  if (!res.ok) await throwForStatus(LABEL, res);

  const data = (await res.json()) as EditsResponse;
  const first = data.data?.[0];
  if (!first?.b64_json) {
    throw new ProviderPermanentError(`${LABEL}: response contained no image${first?.url ? ' data' : ''}`);
  }
  return {
    kind: 'completed',
    images: [{ bytes: Buffer.from(first.b64_json, 'base64'), contentType: 'image/png' }],
  };
}

export const openaiProvider: ImageProvider = {
  id: 'openai',
  supportsWebhook: false,
  submit,
};

export function openaiConfigured(): boolean {
  return Boolean(config('providers').OPENAI_API_KEY);
}

// Re-exported for tests that want to assert on the mapped message of a non-2xx response.
export { errorMessage as readOpenAiError };
