import { config as coreConfig } from '@aiart/core/config';
import { logger } from '@aiart/core/logger';
import { getProvider, ProviderPermanentError, ProviderTimeoutError } from '@aiart/core/providers';
import type { GenerateJobData } from '@aiart/core/queue';
import { aggregateJobStatus, markPreviewFailed, markPreviewSubmitted } from '@aiart/core/services';
import { buildGenerationRequest } from '@aiart/core/templates';
import type { Job as BullJob } from 'bullmq';
import { finalizePreviewWithImages } from '../lib/finalize-preview';
import { loadPreviewContext } from '../lib/load-context';
import { resolveTemplateImages } from '../lib/resolve-images';

const log = logger('worker:generate');
const PROVIDER_TIMEOUT_MS = 60_000;

/** Where an async provider (fal, BFL) sends its result: the public webhook base, else the API URL. */
function providerWebhookUrl(providerId: string): string {
  const api = coreConfig('api');
  const base = (api.WEBHOOK_PUBLIC_URL ?? api.API_PUBLIC_URL).replace(/\/+$/, '');
  return `${base}/webhooks/ai/${providerId}`;
}

/**
 * Submits one preview slot to its provider. A synchronous ("completed") result is finalized
 * immediately; an asynchronous ("pending") one is recorded and finished later by `finalize`, woken
 * up by a provider webhook or the maintenance sweep.
 */
export async function processGenerate(job: BullJob<GenerateJobData>): Promise<void> {
  const { previewId } = job.data;
  const ctx = await loadPreviewContext(previewId);
  if (!ctx) {
    log.warn({ previewId }, 'preview context missing — job or upload was deleted; skipping');
    return;
  }
  const { preview, job: dbJob, config, upload, shop } = ctx;

  if (preview.status !== 'pending') {
    log.info(
      { previewId, status: preview.status },
      'preview already progressed; skipping duplicate generate job',
    );
    return;
  }

  const slotConfig = config.slots.find((s) => s.slot === preview.slot);
  if (!slotConfig) {
    await markPreviewFailed(previewId, {
      error: `Design has no configuration for slot ${preview.slot}`,
      errorKind: 'permanent',
    });
    await aggregateJobStatus(dbJob.id);
    return;
  }
  const provider = getProvider(preview.provider);
  if (!provider) {
    await markPreviewFailed(previewId, {
      error: `Unknown provider "${preview.provider}"`,
      errorKind: 'permanent',
    });
    await aggregateJobStatus(dbJob.id);
    return;
  }

  const request = buildGenerationRequest(config, slotConfig, upload.storageKey);
  const images = await resolveTemplateImages(config, upload.storageKey);
  const startedAt = new Date();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const result = await provider.submit(preview.model, request, {
      images,
      webhookUrl: providerWebhookUrl(provider.id),
      signal: controller.signal,
    });

    if (result.kind === 'completed') {
      await finalizePreviewWithImages({
        shopId: dbJob.shopId,
        jobId: dbJob.id,
        previewId,
        round: dbJob.round,
        slot: preview.slot,
        images: result.images,
        output: config.output,
        watermark: shop.settings.watermark,
        startedAt,
      });
    } else if (result.kind === 'pending') {
      await markPreviewSubmitted(previewId, { providerRequestId: result.requestId, pollUrl: result.pollUrl });
    } else {
      await markPreviewFailed(previewId, { error: result.message, errorKind: 'refused' });
      await aggregateJobStatus(dbJob.id);
    }
  } catch (err) {
    if (err instanceof ProviderPermanentError) {
      await markPreviewFailed(previewId, { error: err.message, errorKind: 'permanent' });
      await aggregateJobStatus(dbJob.id);
      return;
    }
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      const errorKind = err instanceof ProviderTimeoutError ? 'timeout' : 'temporary';
      await markPreviewFailed(previewId, {
        error: err instanceof Error ? err.message : String(err),
        errorKind,
      });
      await aggregateJobStatus(dbJob.id);
      return;
    }
    throw err; // let BullMQ retry with its configured backoff
  } finally {
    clearTimeout(timeoutHandle);
  }
}
