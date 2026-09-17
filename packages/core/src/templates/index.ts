import type { AspectRatio, DesignConfig, SlotConfig } from '@aiart/contracts';

/** Role of each image attached to a generation request. Adapters map these to their own fields. */
export type ImageRole = 'subject' | 'scene' | 'style';

export interface TemplateImage {
  role: ImageRole;
  /** Storage key. The caller resolves this to bytes or a public URL depending on the provider. */
  storageKey: string;
}

export interface OutputSize {
  aspectRatio: AspectRatio;
  /** Long edge in pixels the provider should aim for; adapters translate this to their own fields. */
  longEdge: number;
}

/** Everything a provider adapter needs to generate one preview slot. Provider-agnostic. */
export interface GenerationRequest {
  prompt: string;
  images: TemplateImage[];
  output: OutputSize;
  seed?: number;
  /** Slot-level provider settings from the design config (safety tolerance, quality, …). */
  settings: Record<string, unknown>;
}

const ASPECT_TO_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1, h: 1 },
  '4:5': { w: 4, h: 5 },
  '5:4': { w: 5, h: 4 },
  '3:4': { w: 3, h: 4 },
  '4:3': { w: 4, h: 3 },
  '2:3': { w: 2, h: 3 },
  '3:2': { w: 3, h: 2 },
  '9:16': { w: 9, h: 16 },
  '16:9': { w: 16, h: 9 },
};

/** Pixel dimensions whose long edge matches `longEdge`, keeping the aspect ratio. */
export function resolveDimensions(
  aspectRatio: AspectRatio,
  longEdge: number,
): { width: number; height: number } {
  const { w, h } = ASPECT_TO_SIZE[aspectRatio];
  const long = Math.max(w, h);
  const width = w >= h ? longEdge : Math.round((longEdge * w) / long);
  const height = h >= w ? longEdge : Math.round((longEdge * h) / long);
  return { width, height };
}

/**
 * Builds the provider-agnostic request for one preview slot. The engine has no design-specific
 * code: every word of the prompt and every reference image comes from the design's config.
 */
export function buildGenerationRequest(
  config: DesignConfig,
  slot: SlotConfig,
  photoStorageKey: string,
): GenerationRequest {
  const clauses = [
    config.prompt.trim(),
    config.preserve.length > 0 ? `Keep the customer's ${config.preserve.join(', ')} unchanged.` : '',
    config.avoid.length > 0 ? `Do not include ${config.avoid.join(', ')}.` : '',
    slot.promptSuffix.trim(),
  ].filter(Boolean);

  const images: TemplateImage[] = [{ role: 'subject', storageKey: photoStorageKey }];
  if (config.referenceImages.scene) images.push({ role: 'scene', storageKey: config.referenceImages.scene });
  for (const key of config.referenceImages.style) images.push({ role: 'style', storageKey: key });

  return {
    prompt: clauses.join(' '),
    images,
    output: { aspectRatio: config.output.aspectRatio, longEdge: config.output.finalLongEdge },
    seed: slot.seed,
    settings: slot.settings,
  };
}
