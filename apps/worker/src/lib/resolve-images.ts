import type { DesignConfig } from '@aiart/contracts';
import type { ResolvedImage } from '@aiart/core/providers';
import { getObject } from '@aiart/core/storage';

function mimeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Loads the bytes for every image role a generation request needs: the photo, plus the design's own references. */
export async function resolveTemplateImages(
  config: DesignConfig,
  subjectKey: string,
): Promise<ResolvedImage[]> {
  const images: ResolvedImage[] = [];

  const subjectBytes = await getObject(subjectKey);
  if (!subjectBytes) throw new Error(`Subject photo missing in storage: ${subjectKey}`);
  images.push({ role: 'subject', bytes: subjectBytes, contentType: mimeFromKey(subjectKey) });

  if (config.referenceImages.scene) {
    const bytes = await getObject(config.referenceImages.scene);
    if (bytes) images.push({ role: 'scene', bytes, contentType: mimeFromKey(config.referenceImages.scene) });
  }
  for (const key of config.referenceImages.style) {
    const bytes = await getObject(key);
    if (bytes) images.push({ role: 'style', bytes, contentType: mimeFromKey(key) });
  }

  return images;
}
