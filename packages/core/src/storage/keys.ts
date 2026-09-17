import type { PreviewSlot } from '@aiart/contracts';

/**
 * Every object lives under `shops/<shopId>/`, so a shop redact request is one prefix delete.
 * Keys never contain customer data, only ids.
 */
export const storageKeys = {
  shopPrefix: (shopId: string) => `shops/${shopId}/`,
  uploadPrefix: (shopId: string, uploadId: string) => `shops/${shopId}/uploads/${uploadId}/`,
  /** What the browser uploads. Deleted right after validation (it may carry EXIF/GPS data). */
  uploadRaw: (shopId: string, uploadId: string) => `shops/${shopId}/uploads/${uploadId}/raw`,
  /** Normalized copy: auto-oriented, metadata stripped, re-encoded. */
  uploadPhoto: (shopId: string, uploadId: string) => `shops/${shopId}/uploads/${uploadId}/photo.jpg`,
  jobPrefix: (shopId: string, jobId: string) => `shops/${shopId}/jobs/${jobId}/`,
  previewOriginal: (shopId: string, jobId: string, round: number, slot: PreviewSlot, ext: string) =>
    `shops/${shopId}/jobs/${jobId}/r${round}-${slot}-original.${ext}`,
  previewWatermarked: (shopId: string, jobId: string, round: number, slot: PreviewSlot) =>
    `shops/${shopId}/jobs/${jobId}/r${round}-${slot}-preview.jpg`,
  final: (shopId: string, orderId: string, lineItemId: string, ext: string) =>
    `shops/${shopId}/finals/${orderId}/${lineItemId}.${ext}`,
  designAsset: (shopId: string, designId: string, fileName: string) =>
    `shops/${shopId}/designs/${designId}/${fileName}`,
  sample: (shopId: string, fileName: string) => `shops/${shopId}/samples/${fileName}`,
};
