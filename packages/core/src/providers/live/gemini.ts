import { config } from '../../config';
import type { GenerationRequest } from '../../templates';
import {
  type ImageProvider,
  type ProviderContext,
  ProviderPermanentError,
  type SubmitResult,
} from '../types';
import { fetchWithTimeout, temporary, throwForStatus } from './shared';

/**
 * Google Gemini API, `generateContent` with image output (synchronous).
 * https://ai.google.dev/gemini-api/docs/image-generation
 *
 * Images travel inline as base64 parts after the prompt, customer photo first. Models:
 * gemini-3.1-flash-image (Nano Banana 2), gemini-3-pro-image (Nano Banana Pro),
 * gemini-3.1-flash-lite-image. Every output carries Google's invisible SynthID watermark.
 *
 * Slot settings understood: `imageSize` (1K | 2K | 4K, default from the design's long edge).
 */

const LABEL = 'gemini';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GENERATION_TIMEOUT_MS = 120_000;
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);

function apiKey(): string {
  const key = config('providers').GEMINI_API_KEY;
  if (!key) throw new ProviderPermanentError('GEMINI_API_KEY is not configured');
  return key;
}

export function imageSizeFor(request: GenerationRequest): '1K' | '2K' | '4K' {
  const override = request.settings.imageSize;
  if (override === '1K' || override === '2K' || override === '4K') return override;
  if (request.output.longEdge > 2048) return '4K';
  if (request.output.longEdge > 1024) return '2K';
  return '1K';
}

export function buildBody(request: GenerationRequest, ctx: ProviderContext): Record<string, unknown> {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: request.prompt },
          ...ctx.images.map((img) => ({
            inlineData: { mimeType: img.contentType, data: img.bytes.toString('base64') },
          })),
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: request.output.aspectRatio, imageSize: imageSizeFor(request) },
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
    },
  };
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

async function submit(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE_URL}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey(), 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(request, ctx)),
      },
      ctx.signal,
      GENERATION_TIMEOUT_MS,
    );
  } catch (err) {
    throw temporary(LABEL, 'request failed', err);
  }
  if (!res.ok) await throwForStatus(LABEL, res);

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    return { kind: 'refused', message: 'This request was declined by the content filter.' };
  }
  const candidate = data.candidates?.[0];
  const image = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!image?.inlineData?.data) {
    if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
      return { kind: 'refused', message: 'This request was declined by the content filter.' };
    }
    const text = candidate?.content?.parts?.find((p) => p.text)?.text;
    throw new ProviderPermanentError(
      `${LABEL}: response contained no image${text ? ` (model said: ${text.slice(0, 200)})` : ''}`,
    );
  }
  return {
    kind: 'completed',
    images: [
      {
        bytes: Buffer.from(image.inlineData.data, 'base64'),
        contentType: image.inlineData.mimeType ?? 'image/png',
      },
    ],
  };
}

export const geminiProvider: ImageProvider = {
  id: 'gemini',
  supportsWebhook: false,
  submit,
};

export function geminiConfigured(): boolean {
  return Boolean(config('providers').GEMINI_API_KEY);
}
