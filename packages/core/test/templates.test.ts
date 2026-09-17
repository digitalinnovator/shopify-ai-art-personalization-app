import { DesignConfigSchema } from '@aiart/contracts';
import { describe, expect, it } from 'vitest';
import { buildGenerationRequest, resolveDimensions } from '../src/templates';

const config = DesignConfigSchema.parse({
  prompt: 'Place the person from the customer photo as the knight in the scene image.',
  preserve: ['facial features', 'skin tone', 'hairstyle'],
  avoid: ['text', 'extra people'],
  referenceImages: { scene: 'designs/knight/scene.png', style: ['designs/knight/style-1.png'] },
  slots: [
    { slot: 'A', provider: 'mock', model: 'mock-illustrate', seed: 1001 },
    { slot: 'B', provider: 'mock', model: 'mock-painterly', promptSuffix: 'Offer a variation.' },
  ],
  output: { aspectRatio: '4:5', finalLongEdge: 1600 },
});

describe('buildGenerationRequest', () => {
  it('assembles the prompt from the template, preserve/avoid clauses and the slot suffix', () => {
    const req = buildGenerationRequest(config, config.slots[1]!, 'uploads/u1/photo.jpg');
    expect(req.prompt).toContain('Place the person from the customer photo');
    expect(req.prompt).toContain("Keep the customer's facial features, skin tone, hairstyle unchanged.");
    expect(req.prompt).toContain('Do not include text, extra people.');
    expect(req.prompt).toContain('Offer a variation.');
  });

  it('attaches the subject photo plus the scene and style references with their roles', () => {
    const req = buildGenerationRequest(config, config.slots[0]!, 'uploads/u1/photo.jpg');
    expect(req.images).toEqual([
      { role: 'subject', storageKey: 'uploads/u1/photo.jpg' },
      { role: 'scene', storageKey: 'designs/knight/scene.png' },
      { role: 'style', storageKey: 'designs/knight/style-1.png' },
    ]);
  });

  it('carries the slot seed and settings, and the output aspect ratio', () => {
    const req = buildGenerationRequest(config, config.slots[0]!, 'uploads/u1/photo.jpg');
    expect(req.seed).toBe(1001);
    expect(req.output).toEqual({ aspectRatio: '4:5', longEdge: 1600 });
  });

  it('omits reference images a design has none of', () => {
    const noRefs = DesignConfigSchema.parse({ ...config, referenceImages: {} });
    const req = buildGenerationRequest(noRefs, noRefs.slots[0]!, 'uploads/u1/photo.jpg');
    expect(req.images).toEqual([{ role: 'subject', storageKey: 'uploads/u1/photo.jpg' }]);
  });
});

describe('resolveDimensions', () => {
  it('keeps the long edge fixed and derives the short edge from the ratio', () => {
    expect(resolveDimensions('4:5', 1000)).toEqual({ width: 800, height: 1000 });
    expect(resolveDimensions('5:4', 1000)).toEqual({ width: 1000, height: 800 });
    expect(resolveDimensions('1:1', 1000)).toEqual({ width: 1000, height: 1000 });
    expect(resolveDimensions('16:9', 1600)).toEqual({ width: 1600, height: 900 });
  });
});
