import type { DesignConfig } from '@aiart/contracts';
import type { Job, Preview, Shop, Upload } from '@aiart/core/db';
import { getJobById, getPreview, getShop, getUpload, getVersion } from '@aiart/core/services';

export interface PreviewContext {
  preview: Preview;
  job: Job;
  config: DesignConfig;
  upload: Upload;
  shop: Shop;
}

/** Everything a generate/finalize processor needs, loaded from a bare `previewId`. */
export async function loadPreviewContext(previewId: string): Promise<PreviewContext | undefined> {
  const preview = await getPreview(previewId);
  if (!preview) return undefined;
  const job = await getJobById(preview.jobId);
  if (!job) return undefined;
  const version = await getVersion(job.designVersionId);
  if (!version) return undefined;
  const upload = await getUpload(job.shopId, job.uploadId);
  if (!upload) return undefined;
  const shop = await getShop(job.shopId);
  if (!shop) return undefined;
  return { preview, job, config: version.config as DesignConfig, upload, shop };
}
