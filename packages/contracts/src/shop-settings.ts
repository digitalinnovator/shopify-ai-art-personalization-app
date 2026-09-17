import { z } from 'zod';
import { RELEASE_TRIGGERS } from './statuses';

/** Store-wide settings edited on the admin Settings screen. */
export const ShopSettingsSchema = z.object({
  /** Days to keep photos and previews of customers who never selected a preview. */
  retentionDays: z.number().int().min(1).max(365).default(30),
  /** Days to keep originals that were selected but not (yet) ordered, e.g. abandoned carts. */
  selectedRetentionDays: z.number().int().min(1).max(730).default(90),
  watermark: z
    .object({
      text: z
        .string()
        .trim()
        .min(1)
        .max(24)
        .regex(/^[A-Za-z0-9 .-]+$/, 'Letters, numbers, spaces, dots and dashes only')
        .default('PREVIEW'),
      opacity: z.number().min(0.05).max(0.9).default(0.35),
    })
    .prefault({}),
  /** Which Shopify order event releases the final artwork. */
  releaseTrigger: z.enum(RELEASE_TRIGGERS).default('orders/paid'),
  /** Upper bound on previews generated per store per day (cost control). */
  dailyPreviewCap: z.number().int().min(0).max(100_000).default(500),
  /** Ask for an email before generating (cost control, optional). */
  requireEmail: z.boolean().default(false),
  /** Storefront requests per minute per shopper. */
  rateLimitPerMinute: z.number().int().min(1).max(600).default(30),
});
export type ShopSettings = z.output<typeof ShopSettingsSchema>;
export type ShopSettingsInput = z.input<typeof ShopSettingsSchema>;

export const DEFAULT_SHOP_SETTINGS: ShopSettings = ShopSettingsSchema.parse({});
