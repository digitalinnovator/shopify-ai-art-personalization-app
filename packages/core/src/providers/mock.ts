import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';
import { config } from '../config';
import { prng } from '../images/synthetic';
import { drawBadge } from '../images/watermark';
import { signCallback, verifyCallback } from '../security';
import type { GenerationRequest } from '../templates';
import { resolveDimensions } from '../templates';
import {
  type GeneratedImage,
  type ImageProvider,
  type ParsedWebhook,
  type ProviderContext,
  ProviderPermanentError,
  ProviderTemporaryError,
  ProviderTimeoutError,
  type SubmitResult,
} from './types';

/**
 * A real (not stock) placeholder image, generated locally so the whole flow — job, preview,
 * watermark, storage, selection, order — works without any AI API key.
 *
 * Settings read from the slot config (`design.slots[].settings`):
 *   mode: 'sync' | 'webhook'                                             default 'sync'
 *   simulate: 'success' | 'temporary_failure' | 'permanent_failure'
 *             | 'timeout' | 'refusal'                                    default 'success'
 */
type MockMode = 'sync' | 'webhook';
type MockSimulate = 'success' | 'temporary_failure' | 'permanent_failure' | 'timeout' | 'refusal';

interface MockSettings {
  mode: MockMode;
  simulate: MockSimulate;
}

function readSettings(settings: Record<string, unknown>): MockSettings {
  const mode = settings.mode === 'webhook' ? 'webhook' : 'sync';
  const allowed: MockSimulate[] = ['success', 'temporary_failure', 'permanent_failure', 'timeout', 'refusal'];
  const simulate = allowed.includes(settings.simulate as MockSimulate)
    ? (settings.simulate as MockSimulate)
    : 'success';
  return { mode, simulate };
}

/** Deterministic per-model treatment so the same model always looks the same way. */
function treatmentFor(model: string): {
  hueRotate: number;
  saturate: number;
  posterize?: number;
  blur?: number;
} {
  const rand = prng([...model].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  if (model.includes('illustrate')) return { hueRotate: 0, saturate: 1.6, posterize: 5 };
  if (model.includes('painterly')) return { hueRotate: 10, saturate: 1.25, blur: 1.4 };
  if (model.includes('watercolor')) return { hueRotate: -8, saturate: 0.75, blur: 0.6 };
  return { hueRotate: Math.floor(rand() * 360), saturate: 1 + rand() * 0.4 };
}

async function renderMockImage(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
): Promise<GeneratedImage> {
  const subject = ctx.images.find((i) => i.role === 'subject') ?? ctx.images[0];
  const scene = ctx.images.find((i) => i.role === 'scene');
  if (!subject) throw new ProviderPermanentError('No subject image supplied');

  const { width, height } = resolveDimensions(request.output.aspectRatio, request.output.longEdge);
  const treatment = treatmentFor(model);

  let pipeline = sharp(subject.bytes).resize(width, height, { fit: 'cover' }).modulate({
    saturation: treatment.saturate,
    hue: treatment.hueRotate,
  });
  if (treatment.blur) pipeline = pipeline.blur(treatment.blur);
  if (treatment.posterize) pipeline = pipeline.gamma().median(3);

  let composed = await pipeline.png().toBuffer();
  if (scene) {
    const sceneResized = await sharp(scene.bytes).resize(width, height, { fit: 'cover' }).toBuffer();
    composed = await sharp(sceneResized)
      .composite([{ input: composed, blend: 'over', top: 0, left: 0 }])
      .modulate({ saturation: 1.05 })
      .png()
      .toBuffer();
  }

  const badged = await drawBadge(composed, `MOCK ${model.replace(/^mock-/, '').toUpperCase()}`);
  return { bytes: badged, contentType: 'image/png' };
}

async function computeOutcome(
  model: string,
  request: GenerationRequest,
  ctx: ProviderContext,
  simulate: MockSimulate,
): Promise<{ kind: 'completed'; images: GeneratedImage[] } | { kind: 'refused'; message: string }> {
  if (simulate === 'temporary_failure')
    throw new ProviderTemporaryError(`mock: simulated temporary failure for ${model}`);
  if (simulate === 'permanent_failure')
    throw new ProviderPermanentError(`mock: simulated permanent failure for ${model}`);
  if (simulate === 'refusal')
    return { kind: 'refused', message: 'This request was declined by the content filter.' };
  const image = await renderMockImage(model, request, ctx);
  return { kind: 'completed', images: [image] };
}

async function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) throw new ProviderTimeoutError('mock: aborted before timeout simulation started');
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  throw new ProviderTimeoutError('mock: simulated timeout');
}

type DeliverableOutcome =
  | { kind: 'completed'; images: GeneratedImage[] }
  | { kind: 'failed'; message: string; temporary: boolean };

/** requestId -> outcome, for the in-process fallback poll (`fetchResult`) in webhook mode. */
const webhookResults = new Map<string, DeliverableOutcome>();

async function deliverWebhook(
  requestId: string,
  ctx: ProviderContext,
  outcome: DeliverableOutcome,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body =
    outcome.kind === 'completed'
      ? {
          requestId,
          status: 'OK' as const,
          images: outcome.images.map((img) => ({
            contentType: img.contentType,
            base64: img.bytes.toString('base64'),
          })),
        }
      : { requestId, status: 'ERROR' as const, message: outcome.message };
  const raw = JSON.stringify(body);
  webhookResults.set(requestId, outcome);
  try {
    await fetch(ctx.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-callback-signature': signCallback(raw, config('mock').MOCK_WEBHOOK_SECRET, timestamp),
        'x-callback-timestamp': String(timestamp),
      },
      body: raw,
    });
  } catch {
    // The sweeper's `fetchResult` fallback covers a callback delivery failure.
  }
}

export const mockProvider: ImageProvider = {
  id: 'mock',
  supportsWebhook: true,

  async submit(model, request, ctx): Promise<SubmitResult> {
    const { mode, simulate } = readSettings(request.settings);
    const delayMs = config('mock').MOCK_PROVIDER_DELAY_MS;

    if (simulate === 'timeout') {
      await Promise.race([sleep(delayMs), Promise.resolve()]);
      return waitForAbort(ctx.signal);
    }

    if (mode === 'sync') {
      await sleep(delayMs);
      return computeOutcome(model, request, ctx, simulate);
    }

    const requestId = randomUUID();
    void (async () => {
      await sleep(delayMs);
      try {
        const outcome = await computeOutcome(model, request, ctx, simulate);
        await deliverWebhook(
          requestId,
          ctx,
          outcome.kind === 'completed'
            ? outcome
            : { kind: 'failed', message: outcome.message, temporary: false },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const temporary = err instanceof ProviderTemporaryError;
        await deliverWebhook(requestId, ctx, { kind: 'failed', message, temporary }).catch(() => {});
      }
    })();
    return { kind: 'pending', requestId, pollUrl: `mock://${requestId}` };
  },

  verifyWebhook(rawBody, headers) {
    return verifyCallback(
      rawBody,
      { signature: headers['x-callback-signature'], timestamp: headers['x-callback-timestamp'] },
      config('mock').MOCK_WEBHOOK_SECRET,
    );
  },

  parseWebhook(body): ParsedWebhook {
    const b = body as {
      requestId: string;
      status: 'OK' | 'ERROR';
      images?: { contentType: string; base64: string }[];
      message?: string;
    };
    if (b.status === 'OK') {
      return {
        kind: 'completed',
        requestId: b.requestId,
        images: (b.images ?? []).map((img) => ({
          bytes: Buffer.from(img.base64, 'base64'),
          contentType: img.contentType,
        })),
      };
    }
    return {
      kind: 'failed',
      requestId: b.requestId,
      message: b.message ?? 'mock provider reported an error',
      temporary: false,
    };
  },

  async fetchResult(pollUrl): Promise<GeneratedImage[]> {
    const requestId = pollUrl.replace('mock://', '');
    const result = webhookResults.get(requestId);
    if (!result) throw new ProviderTemporaryError(`mock: no result yet for ${requestId}`);
    if (result.kind === 'failed') {
      throw result.temporary
        ? new ProviderTemporaryError(result.message)
        : new ProviderPermanentError(result.message);
    }
    return result.images;
  },
};

/** Test helper. */
export function resetMockProvider(): void {
  webhookResults.clear();
}
