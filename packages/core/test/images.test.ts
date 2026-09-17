import { UploadRulesSchema } from '@aiart/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizePhoto } from '../src/images/normalize';
import { syntheticFlat, syntheticPortrait, syntheticScene } from '../src/images/synthetic';
import { setFaceCheck, validatePhoto } from '../src/images/validate';
import { applyWatermark, drawBadge, resizeToLongEdge } from '../src/images/watermark';

const rules = UploadRulesSchema.parse({});

describe('validatePhoto', () => {
  it('accepts a normal-looking photo', async () => {
    const photo = await syntheticPortrait();
    const result = await validatePhoto(photo, rules);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.format).toBe('jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.sharpness).toBeGreaterThan(rules.minSharpness);
    }
  });

  it('rejects a file that is not really an image (bad magic bytes)', async () => {
    const result = await validatePhoto(Buffer.from('not an image, just text'), rules);
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rejects a file larger than maxBytes', async () => {
    const photo = await syntheticPortrait();
    const result = await validatePhoto(photo, { ...rules, maxBytes: 100 });
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects an image smaller than minShortEdge', async () => {
    const tiny = await syntheticPortrait({ width: 100, height: 125 });
    const result = await validatePhoto(tiny, rules);
    expect(result).toEqual({ ok: false, reason: 'too_small' });
  });

  it('rejects an unsupported format', async () => {
    const gif = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#888' } })
      .gif()
      .toBuffer();
    const result = await validatePhoto(gif, rules);
    expect(result).toEqual({ ok: false, reason: 'unsupported_format' });
  });

  it('rejects a flat, featureless (blurry) image', async () => {
    const flat = await syntheticFlat();
    const result = await validatePhoto(flat, rules);
    expect(result).toEqual({ ok: false, reason: 'too_blurry' });
  });

  it('accepts a sharp photo at phone camera resolution, and still rejects a blurred one', async () => {
    // Regression: sharpness used to be measured at full size, so a 4032 px phone photo scored
    // below the limit and was refused as blurry.
    const portrait = await syntheticPortrait();
    const large = await sharp(portrait).resize({ width: 4032 }).jpeg({ quality: 92 }).toBuffer();
    const accepted = await validatePhoto(large, rules);
    expect(accepted.ok).toBe(true);

    const blurred = await sharp(large).blur(18).jpeg({ quality: 92 }).toBuffer();
    expect(await validatePhoto(blurred, rules)).toEqual({ ok: false, reason: 'too_blurry' });
  });

  it('lets a design disable the blur check with minSharpness: 0', async () => {
    const flat = await syntheticFlat();
    const result = await validatePhoto(flat, { ...rules, minSharpness: 0 });
    expect(result.ok).toBe(true);
  });

  it('runs the pluggable face check only when requireSingleFace is set', async () => {
    const photo = await syntheticPortrait();
    expect((await validatePhoto(photo, rules)).ok).toBe(true);

    setFaceCheck(async () => 0);
    try {
      expect(await validatePhoto(photo, { ...rules, requireSingleFace: true })).toEqual({
        ok: false,
        reason: 'no_face',
      });
    } finally {
      setFaceCheck(async () => 1);
    }

    setFaceCheck(async () => 2);
    try {
      expect(await validatePhoto(photo, { ...rules, requireSingleFace: true })).toEqual({
        ok: false,
        reason: 'multiple_faces',
      });
    } finally {
      setFaceCheck(async () => 1);
    }
  });
});

describe('normalizePhoto', () => {
  it('strips EXIF/GPS metadata and re-encodes as JPEG', async () => {
    const withExif = await sharp(await syntheticPortrait())
      .withExif({ IFD0: { Make: 'TestCam' } })
      .withMetadata({ orientation: 1 })
      .toBuffer();
    const { buffer, width, height } = await normalizePhoto(withExif);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    const meta = await sharp(buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });
});

describe('watermark and resize', () => {
  it('produces a differently-pixelled, same-size JPEG', async () => {
    const photo = await syntheticPortrait({ width: 640, height: 800 });
    const watermarked = await applyWatermark(photo, { text: 'PREVIEW' });
    const meta = await sharp(watermarked).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(800);

    const rawBefore = await sharp(photo).raw().toBuffer();
    const rawAfter = await sharp(watermarked).raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < Math.min(rawBefore.length, rawAfter.length); i++) {
      if (rawBefore[i] !== rawAfter[i]) diff++;
    }
    expect(diff).toBeGreaterThan(1000);
  });

  it('resizes to fit the long edge without upscaling', async () => {
    const scene = await syntheticScene({ width: 2000, height: 1000 });
    const resized = await resizeToLongEdge(scene, 800);
    const meta = await sharp(resized).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(400);

    const small = await syntheticScene({ width: 300, height: 200 });
    const notUpscaled = await resizeToLongEdge(small, 800);
    const smallMeta = await sharp(notUpscaled).metadata();
    expect(smallMeta.width).toBe(300);
  });

  it('draws a badge without throwing', async () => {
    const photo = await syntheticPortrait();
    const badged = await drawBadge(photo, 'A · MOCK-ILLUSTRATE');
    const meta = await sharp(badged).metadata();
    expect(meta.width).toBeGreaterThan(0);
  });
});
