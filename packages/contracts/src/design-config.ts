import { z } from 'zod';
import { PREVIEW_SLOTS } from './constants';

export const ASPECT_RATIOS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const UPLOAD_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];

/** One preview slot: which provider and model produce Preview A or Preview B. */
export const SlotConfigSchema = z.object({
  slot: z.enum(PREVIEW_SLOTS),
  /** Provider registry id: `mock`, `fal`, `bfl`, `gemini`, `openai`. */
  provider: z.string().min(1),
  /** Provider model id, e.g. `fal-ai/flux-2-pro/edit`. Free text so new models need no code change. */
  model: z.string().min(1),
  /** Appended to the design prompt for this slot only, e.g. to push slot B towards a variation. */
  promptSuffix: z.string().max(2000).default(''),
  /** Fixed seed for repeatable output where the provider supports it. */
  seed: z.number().int().nonnegative().optional(),
  /** Provider-specific options (safety tolerance, quality, mock failure simulation, …). */
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type SlotConfig = z.output<typeof SlotConfigSchema>;

export const OutputRulesSchema = z.object({
  aspectRatio: z.enum(ASPECT_RATIOS).default('4:5'),
  /** Long edge in pixels of the final (orderable) artwork. */
  finalLongEdge: z.number().int().min(512).max(4096).default(2048),
  /** Long edge in pixels of the watermarked copy shown on the storefront. */
  previewLongEdge: z.number().int().min(256).max(1600).default(768),
  watermarkPreview: z.boolean().default(true),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
});
export type OutputRules = z.output<typeof OutputRulesSchema>;

export const UploadRulesSchema = z.object({
  maxBytes: z
    .number()
    .int()
    .min(100_000)
    .max(25 * 1024 * 1024)
    .default(15 * 1024 * 1024),
  minShortEdge: z.number().int().min(128).max(4096).default(512),
  formats: z.array(z.enum(UPLOAD_FORMATS)).min(1).default(['jpeg', 'png', 'webp']),
  /** Reject photos whose sharpness score is below this (0 disables the check). */
  minSharpness: z.number().min(0).default(4),
  /** Ask the face check to require exactly one face. The default face check is a no-op. */
  requireSingleFace: z.boolean().default(false),
});
export type UploadRules = z.output<typeof UploadRulesSchema>;

export const LimitsSchema = z.object({
  regenerationsPerSession: z.number().int().min(0).max(10).default(1),
});
export type Limits = z.output<typeof LimitsSchema>;

/**
 * A design template version. The engine contains no design-specific code; it only reads this.
 * Image fields hold storage keys, never public URLs.
 */
export const DesignConfigSchema = z.object({
  prompt: z.string().min(10).max(8000),
  /** Fixed wording for what must be kept from the customer photo. */
  preserve: z.array(z.string().min(1)).default(['facial features', 'skin tone', 'hairstyle']),
  /** Fixed wording for what must not appear. */
  avoid: z.array(z.string().min(1)).default(['text', 'watermarks', 'extra people']),
  referenceImages: z
    .object({
      scene: z.string().min(1).optional(),
      style: z.array(z.string().min(1)).max(8).default([]),
    })
    .prefault({}),
  /** Example results shown in the storefront block before upload. */
  exampleImages: z.array(z.string().min(1)).max(6).default([]),
  slots: z
    .array(SlotConfigSchema)
    .length(2)
    .refine((slots) => new Set(slots.map((s) => s.slot)).size === slots.length, 'Slots must be A and B'),
  output: OutputRulesSchema.prefault({}),
  limits: LimitsSchema.prefault({}),
  uploadRules: UploadRulesSchema.prefault({}),
});
export type DesignConfig = z.output<typeof DesignConfigSchema>;
export type DesignConfigInput = z.input<typeof DesignConfigSchema>;
