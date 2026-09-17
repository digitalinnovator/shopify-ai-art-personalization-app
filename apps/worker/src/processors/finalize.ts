import { logger } from '@aiart/core/logger';
import { getProvider, ProviderPermanentError, ProviderTimeoutError } from '@aiart/core/providers';
import type { FinalizeJobData } from '@aiart/core/queue';
import { aggregateJobStatus, markPreviewFailed } from '@aiart/core/services';
import type { Job as BullJob } from 'bullmq';
import { finalizePreviewWithImages } from '../lib/finalize-preview';
import { loadPreviewContext } from '../lib/load-context';

const log = logger('worker:finalize');
const PROVIDER_TIMEOUT_MS = 60_000;

/**
 * Completes a preview that is waiting on an async provider result — woken up either by that
 * provider's webhook or by the maintenance sweep once a preview has been `submitted` too long.
 * Always re-fetches from the poll URL captured at submit time, never from anything in a webhook
 * body, so a forged callback can't point this at an arbitrary URL.
 */
export async function processFinalize(job: BullJob<FinalizeJobData>): Promise<void> {
  const { previewId } = job.data;
  const ctx = await loadPreviewContext(previewId);
  if (!ctx) {
    log.warn({ previewId }, 'preview context missing; skipping');
    return;
  }
  const { preview, job: dbJob, config, shop } = ctx;

  if (preview.status !== 'submitted') {
    log.info(
      { previewId, status: preview.status },
      'preview is not awaiting a result; skipping (redelivery or stale trigger)',
    );
    return;
  }

  const provider = getProvider(preview.provider);
  if (!provider?.fetchResult || !preview.pollUrl) {
    await markPreviewFailed(previewId, {
      error: 'This provider cannot be polled for a result',
      errorKind: 'permanent',
    });
    await aggregateJobStatus(dbJob.id);
    return;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  const startedAt = preview.submittedAt ?? preview.createdAt;

  try {
    const images = await provider.fetchResult(preview.pollUrl, controller.signal);
    await finalizePreviewWithImages({
      shopId: dbJob.shopId,
      jobId: dbJob.id,
      previewId,
      round: dbJob.round,
      slot: preview.slot,
      images,
      output: config.output,
      watermark: shop.settings.watermark,
      startedAt,
    });
  } catch (err) {
    if (err instanceof ProviderPermanentError) {
      await markPreviewFailed(previewId, { error: err.message, errorKind: 'permanent' });
      await aggregateJobStatus(dbJob.id);
      return;
    }
    const maxAttempts = job.opts.attempts ?? 5;
    if (job.attemptsMade >= maxAttempts) {
      const errorKind = err instanceof ProviderTimeoutError ? 'timeout' : 'temporary';
      await markPreviewFailed(previewId, {
        error: err instanceof Error ? err.message : String(err),
        errorKind,
      });
      await aggregateJobStatus(dbJob.id);
      return;
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
