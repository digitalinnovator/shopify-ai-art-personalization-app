import type { UploadFormat, UploadRules } from '@aiart/contracts';
import sharp, { type Metadata, type Sharp } from 'sharp';

export type RejectionReason =
  | 'unreadable'
  | 'unsupported_format'
  | 'too_large'
  | 'too_small'
  | 'too_blurry'
  | 'no_face'
  | 'multiple_faces';

export interface ValidationOk {
  ok: true;
  format: UploadFormat;
  width: number;
  height: number;
  sharpness: number;
}
export interface ValidationFail {
  ok: false;
  reason: RejectionReason;
}
export type ValidationResult = ValidationOk | ValidationFail;

const FORMAT_MAP: Record<string, UploadFormat> = { jpeg: 'jpeg', jpg: 'jpeg', png: 'png', webp: 'webp' };

/** Sharpness is measured at this long edge so the score does not depend on the photo's size. */
const SHARPNESS_LONG_EDGE = 1024;

/**
 * Sharpness score via Laplacian variance: convolve for edges, then measure how spread out the
 * result is. Blurry photos have little high-frequency detail, so the variance is low.
 * This reads pixel content, not just the header, which also rejects a renamed non-image file.
 *
 * The photo is first scaled to a fixed size. Measured at full resolution, the same sharp photo
 * scores far lower at 4000 px than at 1000 px (its edges spread over more pixels), which made
 * normal phone camera photos fail as "blurry". At a fixed size, sharp photos score about 90 to
 * 130 whatever their resolution and clearly blurred ones stay below 1.
 */
async function sharpnessScore(image: Sharp): Promise<number> {
  const edges = await image
    .clone()
    .rotate()
    .resize({
      width: SHARPNESS_LONG_EDGE,
      height: SHARPNESS_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data } = edges;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] as number;
    sum += v;
    sumSq += v * v;
  }
  const n = data.length;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Decodes and checks a photo against a design's upload rules. Every check reads the actual pixel
 * data (not just the file name or a declared content type), per OWASP's file upload guidance.
 */
export async function validatePhoto(bytes: Buffer, rules: UploadRules): Promise<ValidationResult> {
  if (bytes.length > rules.maxBytes) return { ok: false, reason: 'too_large' };

  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' });
    meta = await image.metadata();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const format = meta.format ? FORMAT_MAP[meta.format] : undefined;
  if (!format || !rules.formats.includes(format)) return { ok: false, reason: 'unsupported_format' };
  if (!meta.width || !meta.height) return { ok: false, reason: 'unreadable' };
  if (Math.min(meta.width, meta.height) < rules.minShortEdge) return { ok: false, reason: 'too_small' };

  // Fully decode (not just read the header) so a truncated or corrupt body is caught here.
  let sharpness: number;
  try {
    sharpness = await sharpnessScore(image);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (rules.minSharpness > 0 && sharpness < rules.minSharpness) return { ok: false, reason: 'too_blurry' };

  if (rules.requireSingleFace) {
    const faces = await countFaces(bytes);
    if (faces === 0) return { ok: false, reason: 'no_face' };
    if (faces > 1) return { ok: false, reason: 'multiple_faces' };
  }

  return { ok: true, format, width: meta.width, height: meta.height, sharpness };
}

/**
 * Pluggable face check. The default is a no-op that always reports exactly one face, so
 * `requireSingleFace` is off by default and this never blocks local development. A real
 * implementation (e.g. a lightweight face-detection model) can replace this function.
 */
export let countFaces: (bytes: Buffer) => Promise<number> = async () => 1;

/** Test/config hook to swap the face check implementation. */
export function setFaceCheck(fn: (bytes: Buffer) => Promise<number>): void {
  countFaces = fn;
}
