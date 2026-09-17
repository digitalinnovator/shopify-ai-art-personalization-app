import { registerProvider } from '../registry';
import { bflConfigured, bflProvider } from './bfl';
import { falConfigured, falProvider } from './fal';
import { geminiConfigured, geminiProvider } from './gemini';
import { openaiConfigured, openaiProvider } from './openai';

/**
 * Registers every live adapter whose API key is present in `.env`, so an unconfigured provider
 * simply never shows up as configured (see the Models admin screen). Called once, at import
 * time, from `registry.ts`.
 *
 * Which models each provider offers, with indicative prices, lives in the catalog in
 * `@aiart/contracts` (`MODEL_CATALOG`); the adapters themselves have no per-model code.
 */
export function registerLiveProviders(): void {
  if (falConfigured()) registerProvider(falProvider);
  if (bflConfigured()) registerProvider(bflProvider);
  if (geminiConfigured()) registerProvider(geminiProvider);
  if (openaiConfigured()) registerProvider(openaiProvider);
}
