import sharp from 'sharp';
import { textPath } from './stroke-font';

/**
 * Tiled, semi-transparent watermark drawn as SVG stroked paths (see stroke-font.ts) so it never
 * depends on fontconfig finding a system font. Composited once at the preview's own resolution.
 */
export async function applyWatermark(
  image: Buffer,
  opts: { text?: string; opacity?: number } = {},
): Promise<Buffer> {
  const text = opts.text ?? 'PREVIEW';
  const opacity = opts.opacity ?? 0.35;
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const glyphSize = Math.max(18, Math.round(width / 14));
  const { d, width: textWidth } = textPath(text, { size: glyphSize });
  const cellW = textWidth + glyphSize * 2.2;
  const cellH = glyphSize * 3.4;
  const strokeWidth = Math.max(1.5, glyphSize * 0.11);

  // A rotated tile pattern reads clearly without covering any one spot completely.
  const tile = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}">
      <g transform="translate(${glyphSize * 1.1} ${cellH / 2 - glyphSize / 2}) rotate(-22 ${textWidth / 2} ${glyphSize / 2})">
        <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${strokeWidth}"
          stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>
        <path d="${d}" fill="none" stroke="#000000" stroke-width="${strokeWidth * 0.4}"
          stroke-linecap="round" stroke-linejoin="round" opacity="${opacity * 0.6}"/>
      </g>
    </svg>`;
  const tileBuffer = await sharp(Buffer.from(tile)).png().toBuffer();

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <pattern id="wm" patternUnits="userSpaceOnUse" width="${cellW}" height="${cellH}">
        <image href="data:image/png;base64,${tileBuffer.toString('base64')}" width="${cellW}" height="${cellH}"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm)"/>
  </svg>`;

  return sharp(image)
    .composite([{ input: Buffer.from(overlay), blend: 'over' }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Resizes to fit within `longEdge` on the longer side, without upscaling. */
export async function resizeToLongEdge(image: Buffer, longEdge: number): Promise<Buffer> {
  return sharp(image)
    .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
    .toBuffer();
}

/** A small badge (e.g. "A · mock-illustrate") drawn top-left, used by the mock provider. */
export async function drawBadge(image: Buffer, label: string): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 1024;
  const glyphSize = Math.max(14, Math.round(width / 28));
  const pad = glyphSize * 0.6;
  const { d, width: textWidth } = textPath(label, { size: glyphSize, x: pad, y: pad });
  const boxW = textWidth + pad * 2;
  const boxH = glyphSize + pad * 2;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${meta.height ?? 1024}">
    <rect x="12" y="12" width="${boxW}" height="${boxH}" rx="6" fill="#1c1830cc"/>
    <path d="${d}" transform="translate(12 12)" fill="none" stroke="#ffffff" stroke-width="${glyphSize * 0.14}"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return sharp(image)
    .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }])
    .toBuffer();
}
