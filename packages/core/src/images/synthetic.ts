import sharp from 'sharp';

/**
 * Deterministic placeholder artwork and portraits for seed data, tests and the mock provider.
 * Everything is drawn from SVG shapes only (no <text>), because font rendering through
 * fontconfig is unreliable on Windows.
 */

/** Small seeded PRNG (mulberry32) so the same seed always draws the same image. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN_TONES = ['#f1c7a5', '#e0a878', '#c68642', '#8d5524', '#5c3a1e', '#f6d7c3'];
const HAIR_COLORS = ['#2b1b10', '#4a2c17', '#b5651d', '#e8c07a', '#111111', '#7a7a7a'];
const BACKGROUNDS = [
  ['#9ec5e8', '#e9f2fb'],
  ['#c7e0b4', '#f4f9ef'],
  ['#e8c2c9', '#fbf1f3'],
  ['#d9d0f2', '#f6f3fd'],
];

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)] as T;
}

/** A head-and-shoulders "customer photo". Sharp edges and fine hair strands so it passes blur checks. */
export async function syntheticPortrait(
  opts: { seed?: number; width?: number; height?: number; format?: 'jpeg' | 'png' } = {},
): Promise<Buffer> {
  const { seed = 1, width = 900, height = 1125, format = 'jpeg' } = opts;
  const rand = prng(seed);
  const skin = pick(SKIN_TONES, rand);
  const hair = pick(HAIR_COLORS, rand);
  const [bgA, bgB] = pick(BACKGROUNDS, rand);
  const shirt = `hsl(${Math.floor(rand() * 360)} 45% 42%)`;
  const cx = width / 2;
  const headR = width * 0.19;
  const headY = height * 0.4;
  const strands = Array.from({ length: 70 }, (_, i) => {
    const angle = Math.PI + (i / 69) * Math.PI;
    const x1 = cx + Math.cos(angle) * headR * 0.95;
    const y1 = headY + Math.sin(angle) * headR * 1.15;
    const x2 = cx + Math.cos(angle) * headR * (1.15 + rand() * 0.12);
    const y2 = headY + Math.sin(angle) * headR * (1.35 + rand() * 0.1);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${hair}" stroke-width="3"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <ellipse cx="${cx}" cy="${height * 0.98}" rx="${width * 0.42}" ry="${height * 0.3}" fill="${shirt}"/>
    <rect x="${cx - headR * 0.35}" y="${headY + headR * 0.8}" width="${headR * 0.7}" height="${headR * 0.8}" fill="${skin}"/>
    <ellipse cx="${cx}" cy="${headY}" rx="${headR}" ry="${headR * 1.22}" fill="${skin}" stroke="#00000033" stroke-width="2"/>
    <path d="M ${cx - headR * 1.05} ${headY - headR * 0.1} Q ${cx} ${headY - headR * 1.9} ${cx + headR * 1.05} ${headY - headR * 0.1} Q ${cx} ${headY - headR * 1.05} ${cx - headR * 1.05} ${headY - headR * 0.1} Z" fill="${hair}"/>
    ${strands}
    <ellipse cx="${cx - headR * 0.38}" cy="${headY - headR * 0.05}" rx="${headR * 0.13}" ry="${headR * 0.08}" fill="#ffffff"/>
    <ellipse cx="${cx + headR * 0.38}" cy="${headY - headR * 0.05}" rx="${headR * 0.13}" ry="${headR * 0.08}" fill="#ffffff"/>
    <circle cx="${cx - headR * 0.38}" cy="${headY - headR * 0.05}" r="${headR * 0.06}" fill="#2a1a0e"/>
    <circle cx="${cx + headR * 0.38}" cy="${headY - headR * 0.05}" r="${headR * 0.06}" fill="#2a1a0e"/>
    <path d="M ${cx - headR * 0.55} ${headY - headR * 0.28} q ${headR * 0.17} -${headR * 0.1} ${headR * 0.34} 0 M ${cx + headR * 0.21} ${headY - headR * 0.28} q ${headR * 0.17} -${headR * 0.1} ${headR * 0.34} 0" stroke="${hair}" stroke-width="5" fill="none"/>
    <path d="M ${cx} ${headY + headR * 0.02} l -${headR * 0.08} ${headR * 0.3} h ${headR * 0.14}" stroke="#00000055" stroke-width="3" fill="none"/>
    <path d="M ${cx - headR * 0.3} ${headY + headR * 0.55} Q ${cx} ${headY + headR * 0.75} ${cx + headR * 0.3} ${headY + headR * 0.55}" stroke="#8a3b3b" stroke-width="6" fill="none" stroke-linecap="round"/>
  </svg>`;
  const img = sharp(Buffer.from(svg));
  return format === 'png' ? img.png().toBuffer() : img.jpeg({ quality: 90 }).toBuffer();
}

/** An illustrated "scene" reference: sky, hills, a castle silhouette and a banner. */
export async function syntheticScene(
  opts: { seed?: number; width?: number; height?: number; palette?: [string, string, string] } = {},
): Promise<Buffer> {
  const { seed = 1, width = 1024, height = 1280, palette = ['#f3d9a4', '#8fb7e8', '#557f4f'] } = opts;
  const rand = prng(seed);
  const [sun, sky, land] = palette;
  const stars = Array.from({ length: 30 }, () => {
    const x = rand() * width;
    const y = rand() * height * 0.4;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1 + rand() * 3).toFixed(1)}" fill="#ffffffaa"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sun}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#sky)"/>${stars}
    <circle cx="${width * 0.78}" cy="${height * 0.2}" r="${width * 0.09}" fill="${sun}"/>
    <path d="M0 ${height * 0.7} Q ${width * 0.25} ${height * 0.55} ${width * 0.5} ${height * 0.68} T ${width} ${height * 0.62} V ${height} H 0 Z" fill="${land}"/>
    <path d="M ${width * 0.08} ${height * 0.66} v -${height * 0.2} h ${width * 0.05} v ${height * 0.04} h ${width * 0.04} v -${height * 0.04} h ${width * 0.05} v ${height * 0.2} Z" fill="#3b3550"/>
    <path d="M ${width * 0.1} ${height * 0.46} l ${width * 0.03} -${height * 0.06} l ${width * 0.03} ${height * 0.06} Z" fill="#b3364f"/>
    <path d="M0 ${height * 0.85} Q ${width * 0.5} ${height * 0.78} ${width} ${height * 0.88} V ${height} H 0 Z" fill="#00000022"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A "style" reference: brush-like strokes in a palette. */
export async function syntheticStyle(
  opts: { seed?: number; size?: number; hues?: number[] } = {},
): Promise<Buffer> {
  const { seed = 1, size = 768, hues = [20, 200, 330] } = opts;
  const rand = prng(seed);
  const strokes = Array.from({ length: 120 }, () => {
    const hue = pick(hues, rand) + Math.floor(rand() * 30);
    const x = rand() * size;
    const y = rand() * size;
    const len = 30 + rand() * 160;
    const angle = rand() * Math.PI;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    const w = 4 + rand() * 22;
    return `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="hsl(${hue} 55% ${45 + Math.floor(rand() * 30)}%)" stroke-opacity="0.7" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fbf8f1"/>${strokes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A plain, featureless image, useful for "blurry photo" tests. */
export async function syntheticFlat(
  opts: { width?: number; height?: number; color?: string } = {},
): Promise<Buffer> {
  const { width = 900, height = 1125, color = '#b8c4d0' } = opts;
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg({ quality: 90 })
    .toBuffer();
}
