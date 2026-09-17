import sharp from 'sharp';

/**
 * Auto-orients from EXIF, then strips all metadata (including GPS location) and re-encodes.
 * The source object should be deleted right after this runs — see storage key comments.
 */
export async function imageDimensions(bytes: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

export async function normalizePhoto(
  bytes: Buffer,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const pipeline = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate(); // .rotate() with no args auto-orients
  const { data, info } = await pipeline
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  // Re-run through sharp once more with no EXIF passed forward: toBuffer() above already drops
  // input metadata unless withMetadata() is called, so `data` is already stripped.
  return { buffer: data, width: info.width, height: info.height };
}
