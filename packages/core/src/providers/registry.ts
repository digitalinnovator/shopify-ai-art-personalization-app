import { mockProvider } from './mock';
import type { ImageProvider } from './types';

const registry = new Map<string, ImageProvider>([[mockProvider.id, mockProvider]]);

/**
 * Section B adapters (fal, bfl, gemini, openai) register themselves here when their API key is
 * present in config, so an unconfigured provider simply never appears — see providers/live/*.
 */
export function registerProvider(provider: ImageProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: string): ImageProvider | undefined {
  return registry.get(id);
}

export function listProviders(): ImageProvider[] {
  return [...registry.values()];
}
