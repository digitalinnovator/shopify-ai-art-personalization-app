import type { KNOWN_PROVIDER_IDS } from './constants';

export type ProviderId = (typeof KNOWN_PROVIDER_IDS)[number];

/**
 * The model catalog the admin panel offers in its dropdowns. It is reference data, not a limit:
 * a slot can always name a model id that is not listed here ("Custom model id" in the editor),
 * and the adapters have no per-model code.
 *
 * Prices are indicative. Providers bill per token or per megapixel and change their prices
 * often, so each entry records the date its id and price were checked against the provider's own
 * pages. Entries with `verifiedOn: null` were taken from the provider's catalog listings but not
 * re-checked; the admin shows them as approximate.
 */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Environment variable that unlocks the adapter. Null for the built in mock. */
  envKey: string | null;
  summary: string;
  pricingUrl: string | null;
}

export interface ModelInfo {
  provider: ProviderId;
  /** Sent to the provider exactly as stored in the slot config. */
  id: string;
  label: string;
  summary: string;
  /** Reference images the model accepts in one request (customer photo, scene, style images). */
  maxReferenceImages: number;
  /** Indicative cost of one generated image in US dollars at the sizes this app uses. Null when unknown. */
  priceUsd: number | null;
  priceNote: string;
  /** ISO date the id and price were checked against the provider's own pages; null means approximate. */
  verifiedOn: string | null;
}

export const PRICES_VERIFIED_ON = '2026-09-16';

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'mock',
    label: 'Mock provider',
    envKey: null,
    summary: 'Generates placeholder images locally so the whole flow works without an API key.',
    pricingUrl: null,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    summary: 'GPT Image models. Excellent instruction following and likeness, up to 16 reference images.',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    summary: 'Nano Banana image models. Top of the image editing leaderboards, strong painterly styles.',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  {
    id: 'bfl',
    label: 'Black Forest Labs',
    envKey: 'BFL_API_KEY',
    summary: 'FLUX.2 and FLUX.1 Kontext direct from the makers. Fast, consistent, priced per megapixel.',
    pricingUrl: 'https://docs.bfl.ml/quick_start/pricing',
  },
  {
    id: 'fal',
    label: 'fal.ai',
    envKey: 'FAL_KEY',
    summary: 'One account and one key for many models: Seedream, FLUX, Qwen, Ideogram, Recraft and more.',
    pricingUrl: 'https://fal.ai/models',
  },
];

const V = PRICES_VERIFIED_ON;

export const MODEL_CATALOG: ModelInfo[] = [
  // --- mock ---
  {
    provider: 'mock',
    id: 'mock-illustrate',
    label: 'Mock illustrate',
    summary: 'Posterized, saturated placeholder. Free, instant, no API key.',
    maxReferenceImages: 10,
    priceUsd: 0,
    priceNote: 'Free. Rendered locally.',
    verifiedOn: V,
  },
  {
    provider: 'mock',
    id: 'mock-painterly',
    label: 'Mock painterly',
    summary: 'Soft, warm placeholder. Free, instant, no API key.',
    maxReferenceImages: 10,
    priceUsd: 0,
    priceNote: 'Free. Rendered locally.',
    verifiedOn: V,
  },
  {
    provider: 'mock',
    id: 'mock-watercolor',
    label: 'Mock watercolor',
    summary: 'Muted, blurred placeholder. Free, instant, no API key.',
    maxReferenceImages: 10,
    priceUsd: 0,
    priceNote: 'Free. Rendered locally.',
    verifiedOn: V,
  },

  // --- OpenAI ---
  {
    provider: 'openai',
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    summary: 'Mainstream OpenAI model. Follows instructions closely and keeps the face well.',
    maxReferenceImages: 16,
    priceUsd: 0.03,
    priceNote: 'About $0.03 at 1K, $0.05 at 2K, $0.08 at 4K. Billed per output token.',
    verifiedOn: V,
  },
  {
    provider: 'openai',
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    summary: 'Newest OpenAI model, highest quality tier. Leads the Artificial Analysis editing arena.',
    maxReferenceImages: 16,
    priceUsd: 0.03,
    priceNote: 'Same per token rate as GPT Image 2, about $0.03 at 1K.',
    verifiedOn: V,
  },
  {
    provider: 'openai',
    id: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    summary: 'Newest OpenAI model, faster tier.',
    maxReferenceImages: 16,
    priceUsd: 0.03,
    priceNote: 'Same per token rate as GPT Image 2, about $0.03 at 1K.',
    verifiedOn: V,
  },
  {
    provider: 'openai',
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    summary: 'Previous generation. Still available and well tested.',
    maxReferenceImages: 16,
    priceUsd: 0.034,
    priceNote: 'About $0.034 at 1K medium quality.',
    verifiedOn: V,
  },
  {
    provider: 'openai',
    id: 'gpt-image-1-mini',
    label: 'GPT Image 1 Mini',
    summary: 'Cheapest OpenAI option. Lower quality, fine for quick previews.',
    maxReferenceImages: 16,
    priceUsd: 0.01,
    priceNote: 'About $0.01 at 1K medium quality.',
    verifiedOn: V,
  },

  // --- Google Gemini ---
  {
    provider: 'gemini',
    id: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    summary:
      'Top ranked image editor in blind votes. Strong likeness, great painterly and illustration styles.',
    maxReferenceImages: 10,
    priceUsd: 0.067,
    priceNote: '$0.067 at 1K, $0.101 at 2K, $0.151 at 4K.',
    verifiedOn: V,
  },
  {
    provider: 'gemini',
    id: 'gemini-3-pro-image',
    label: 'Nano Banana Pro',
    summary: 'Highest quality Google model. Best text rendering, up to 4K output.',
    maxReferenceImages: 14,
    priceUsd: 0.134,
    priceNote: '$0.134 at 1K or 2K, $0.24 at 4K.',
    verifiedOn: V,
  },
  {
    provider: 'gemini',
    id: 'gemini-3.1-flash-lite-image',
    label: 'Nano Banana 2 Lite',
    summary: 'Cheapest Google option. Good enough for previews.',
    maxReferenceImages: 10,
    priceUsd: 0.034,
    priceNote: '$0.034 at 1K.',
    verifiedOn: V,
  },

  // --- Black Forest Labs ---
  {
    provider: 'bfl',
    id: 'flux-2-pro',
    label: 'FLUX.2 Pro',
    summary: 'The workhorse. Fast, consistent, up to 8 reference images.',
    maxReferenceImages: 8,
    priceUsd: 0.045,
    priceNote: 'From $0.045 per edit. Scales with output megapixels.',
    verifiedOn: V,
  },
  {
    provider: 'bfl',
    id: 'flux-2-max',
    label: 'FLUX.2 Max',
    summary: 'Highest quality FLUX.',
    maxReferenceImages: 8,
    priceUsd: 0.07,
    priceNote: 'From $0.07. Scales with output megapixels.',
    verifiedOn: V,
  },
  {
    provider: 'bfl',
    id: 'flux-2-flex',
    label: 'FLUX.2 Flex',
    summary: 'Tunable steps and guidance for fine control.',
    maxReferenceImages: 8,
    priceUsd: 0.05,
    priceNote: 'From $0.05. Scales with output megapixels.',
    verifiedOn: V,
  },
  {
    provider: 'bfl',
    id: 'flux-kontext-pro',
    label: 'FLUX.1 Kontext Pro',
    summary: 'Proven single reference editing model.',
    maxReferenceImages: 1,
    priceUsd: 0.04,
    priceNote: '$0.04 per image.',
    verifiedOn: V,
  },
  {
    provider: 'bfl',
    id: 'flux-kontext-max',
    label: 'FLUX.1 Kontext Max',
    summary: 'Higher quality Kontext.',
    maxReferenceImages: 1,
    priceUsd: 0.08,
    priceNote: '$0.08 per image.',
    verifiedOn: V,
  },

  // --- fal.ai ---
  {
    provider: 'fal',
    id: 'fal-ai/bytedance/seedream/v4.5/edit',
    label: 'Seedream 4.5',
    summary: 'Cheap and strong editing from ByteDance. Up to 10 reference images.',
    maxReferenceImages: 10,
    priceUsd: 0.04,
    priceNote: '$0.04 per image on fal.',
    verifiedOn: V,
  },
  {
    provider: 'fal',
    id: 'fal-ai/flux-2-pro/edit',
    label: 'FLUX.2 Pro (via fal)',
    summary: 'Same model as BFL, billed through fal.',
    maxReferenceImages: 8,
    priceUsd: 0.03,
    priceNote: 'About $0.03 per megapixel on fal.',
    verifiedOn: null,
  },
  {
    provider: 'fal',
    id: 'fal-ai/nano-banana-2/edit',
    label: 'Nano Banana 2 (via fal)',
    summary: 'Google Gemini 3.1 Flash Image, billed through fal.',
    maxReferenceImages: 10,
    priceUsd: 0.067,
    priceNote: 'Roughly Google list price.',
    verifiedOn: null,
  },
  {
    provider: 'fal',
    id: 'fal-ai/flux-pro/kontext',
    label: 'FLUX.1 Kontext Pro (via fal)',
    summary: 'Single reference editing, billed through fal.',
    maxReferenceImages: 1,
    priceUsd: 0.04,
    priceNote: 'About $0.04 per image.',
    verifiedOn: null,
  },
  {
    provider: 'fal',
    id: 'fal-ai/qwen-image-edit',
    label: 'Qwen Image Edit',
    summary: 'Open model from Alibaba. Low cost, decent editing.',
    maxReferenceImages: 3,
    priceUsd: 0.03,
    priceNote: 'About $0.03 per image.',
    verifiedOn: null,
  },
  {
    provider: 'fal',
    id: 'fal-ai/ideogram/v3/remix',
    label: 'Ideogram 3 Remix',
    summary: 'Best for artwork that contains readable text, such as names or captions.',
    maxReferenceImages: 1,
    priceUsd: 0.06,
    priceNote: 'About $0.06 per image.',
    verifiedOn: null,
  },
  {
    provider: 'fal',
    id: 'fal-ai/recraft/v3/image-to-image',
    label: 'Recraft V3',
    summary: 'Illustration and vector style transfer.',
    maxReferenceImages: 1,
    priceUsd: 0.04,
    priceNote: 'About $0.04 per image.',
    verifiedOn: null,
  },
];

export function providerInfo(providerId: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === providerId);
}

export function modelsForProvider(providerId: string): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => m.provider === providerId);
}

export function findModel(providerId: string, modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.provider === providerId && m.id === modelId);
}

export interface SessionCostEstimate {
  /** Cost of one round (both preview slots). Null when any slot's price is unknown. */
  perRound: number | null;
  /** Cost if the customer uses every regeneration. Null when any slot's price is unknown. */
  maxPerSession: number | null;
  /** Slots whose model is not in the catalog, so their price is unknown. */
  unknownSlots: string[];
}

/** Indicative spend per customer session for two preview slots and up to N regenerations. */
export function estimateSessionCost(
  slots: { slot: string; provider: string; model: string }[],
  regenerationsPerSession: number,
): SessionCostEstimate {
  const unknownSlots: string[] = [];
  let perRound = 0;
  for (const s of slots) {
    const info = findModel(s.provider, s.model);
    if (!info || info.priceUsd === null) {
      unknownSlots.push(s.slot);
      continue;
    }
    perRound += info.priceUsd;
  }
  if (unknownSlots.length > 0) return { perRound: null, maxPerSession: null, unknownSlots };
  const rounds = 1 + Math.max(0, Math.floor(regenerationsPerSession));
  return { perRound, maxPerSession: perRound * rounds, unknownSlots };
}

/** "$0.045", "$0.10", "$1.20": two decimals, three when the third digit matters. */
export function formatUsd(amount: number): string {
  const rounded3 = Math.round(amount * 1000) / 1000;
  const twoDecimals = Math.round(rounded3 * 100) / 100;
  const digits = Math.abs(rounded3 - twoDecimals) >= 0.0005 ? 3 : 2;
  return `$${rounded3.toFixed(digits)}`;
}
