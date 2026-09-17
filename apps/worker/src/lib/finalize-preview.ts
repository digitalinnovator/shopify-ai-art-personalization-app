import type { OutputRules, PreviewSlot } from '@aiart/contracts';
import { applyWatermark, imageDimensions, resizeToLongEdge } from '@aiart/core/images';
import type { GeneratedImage } from '@aiart/core/providers';
import { ProviderPermanentError } from '@aiart/core/providers';
import { aggregateJobStatus, markPreviewReady } from '@aiart/core/services';
import { putObject, storageKeys } from '@aiart/core/storage';

function extFromContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

export interface FinalizeParams {
  shopId: string;
  jobId: string;
  previewId: string;
  round: number;
  slot: PreviewSlot;
  images: GeneratedImage[];
  output: OutputRules;
  watermark: { text: string; opacity: number };
  startedAt: Date;
}

/**
 * Turns a provider's raw result into what the storefront and the order flow need: the original
 * (purchasable) file stored privately, plus a resized, watermarked preview copy. Shared by the
 * `generate` processor's synchronous path and the `finalize` processor's webhook/poll path, so a
 * mock (or future real) provider only has one place its output is turned into stored files.
 */
export async function finalizePreviewWithImages(params: FinalizeParams): Promise<void> {
  const image = params.images[0];
  if (!image) throw new ProviderPermanentError('Provider returned no images for this preview');

  const ext = extFromContentType(image.contentType);
  const originalKey = storageKeys.previewOriginal(
    params.shopId,
    params.jobId,
    params.round,
    params.slot,
    ext,
  );
  await putObject(originalKey, image.bytes, image.contentType);
  const { width, height } = await imageDimensions(image.bytes);

  const resized = await resizeToLongEdge(image.bytes, params.output.previewLongEdge);
  const previewBytes = params.output.watermarkPreview
    ? await applyWatermark(resized, params.watermark)
    : resized;
  const previewKey = storageKeys.previewWatermarked(params.shopId, params.jobId, params.round, params.slot);
  await putObject(
    previewKey,
    previewBytes,
    params.output.watermarkPreview ? 'image/jpeg' : image.contentType,
  );

  await markPreviewReady(params.previewId, {
    originalKey,
    previewKey,
    width,
    height,
    durationMs: Date.now() - params.startedAt.getTime(),
  });
  await aggregateJobStatus(params.jobId);
}
