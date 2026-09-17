/** Storefront path Shopify's app proxy forwards to our backend (`/apps/ai-art/*` → API `/proxy/*`). */
export const PROXY_PREFIX = '/apps/ai-art';

/** Hidden line item property that carries the selection token through checkout. */
export const SELECTION_PROPERTY = '_ai_selection';

/** Visible line item property so customers see which preview they chose. */
export const SELECTION_LABEL_PROPERTY = 'Personalized';

/** Bumped whenever the consent wording shown before upload changes. Stored on every upload. */
export const CONSENT_VERSION = '2026-09-v1';

/** Provider ids the admin knows how to describe, whether or not an adapter is currently configured. */
export const KNOWN_PROVIDER_IDS = ['mock', 'fal', 'bfl', 'gemini', 'openai'] as const;

export const PREVIEW_SLOTS = ['A', 'B'] as const;
export type PreviewSlot = (typeof PREVIEW_SLOTS)[number];

/** How often the widget polls job status, and the ceiling it backs off to. */
export const POLL_INTERVAL_MS = 2500;
export const POLL_MAX_INTERVAL_MS = 5000;
