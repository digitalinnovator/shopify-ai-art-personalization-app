import {
  estimateSessionCost,
  findModel,
  formatUsd,
  KNOWN_PROVIDER_IDS,
  MODEL_CATALOG,
  modelsForProvider,
  PROVIDERS,
} from '@aiart/contracts';
import { describe, expect, it } from 'vitest';

describe('model catalog', () => {
  it('describes every known provider exactly once', () => {
    expect(PROVIDERS.map((p) => p.id).sort()).toEqual([...KNOWN_PROVIDER_IDS].sort());
  });

  it('has unique model ids per provider and at least one model for every provider', () => {
    const seen = new Set<string>();
    for (const m of MODEL_CATALOG) {
      const key = `${m.provider}/${m.id}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.priceUsd === null || m.priceUsd >= 0).toBe(true);
    }
    for (const p of PROVIDERS) expect(modelsForProvider(p.id).length).toBeGreaterThan(0);
  });

  it('estimates the spend for a session from the slots and the regeneration limit', () => {
    const slots = [
      { slot: 'A', provider: 'gemini', model: 'gemini-3.1-flash-image' },
      { slot: 'B', provider: 'bfl', model: 'flux-2-pro' },
    ];
    const a = findModel('gemini', 'gemini-3.1-flash-image')?.priceUsd ?? 0;
    const b = findModel('bfl', 'flux-2-pro')?.priceUsd ?? 0;
    const estimate = estimateSessionCost(slots, 2);
    expect(estimate.perRound).toBeCloseTo(a + b, 6);
    expect(estimate.maxPerSession).toBeCloseTo((a + b) * 3, 6);
    expect(estimate.unknownSlots).toEqual([]);

    const unknown = estimateSessionCost([...slots, { slot: 'C', provider: 'fal', model: 'custom/thing' }], 0);
    expect(unknown.perRound).toBeNull();
    expect(unknown.unknownSlots).toEqual(['C']);
  });

  it('formats dollars with two decimals, or three when the third digit matters', () => {
    expect(formatUsd(0.045)).toBe('$0.045');
    expect(formatUsd(0.1)).toBe('$0.10');
    expect(formatUsd(0.134)).toBe('$0.134');
    expect(formatUsd(1.2)).toBe('$1.20');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
