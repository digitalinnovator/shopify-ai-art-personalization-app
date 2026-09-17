/**
 * A tiny single-stroke font for watermarks and mock-provider badges. Glyphs are polylines on a
 * 4×6 grid (y down). Rendering text as SVG paths avoids system fonts entirely.
 */
type Polyline = ReadonlyArray<readonly [number, number]>;

const O: Polyline = [
  [1, 0],
  [3, 0],
  [4, 1],
  [4, 5],
  [3, 6],
  [1, 6],
  [0, 5],
  [0, 1],
  [1, 0],
];
const P: Polyline = [
  [0, 6],
  [0, 0],
  [3, 0],
  [4, 1],
  [4, 2],
  [3, 3],
  [0, 3],
];

const GLYPHS: Record<string, Polyline[]> = {
  A: [
    [
      [0, 6],
      [0, 2],
      [2, 0],
      [4, 2],
      [4, 6],
    ],
    [
      [0, 3.5],
      [4, 3.5],
    ],
  ],
  B: [
    [
      [0, 3],
      [0, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [3, 3],
      [0, 3],
      [0, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
    ],
  ],
  C: [
    [
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
    ],
  ],
  D: [
    [
      [0, 0],
      [0, 6],
      [3, 6],
      [4, 5],
      [4, 1],
      [3, 0],
      [0, 0],
    ],
  ],
  E: [
    [
      [4, 0],
      [0, 0],
      [0, 6],
      [4, 6],
    ],
    [
      [0, 3],
      [3, 3],
    ],
  ],
  F: [
    [
      [4, 0],
      [0, 0],
      [0, 6],
    ],
    [
      [0, 3],
      [3, 3],
    ],
  ],
  G: [
    [
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 3],
      [2, 3],
    ],
  ],
  H: [
    [
      [0, 0],
      [0, 6],
    ],
    [
      [4, 0],
      [4, 6],
    ],
    [
      [0, 3],
      [4, 3],
    ],
  ],
  I: [
    [
      [1, 0],
      [3, 0],
    ],
    [
      [2, 0],
      [2, 6],
    ],
    [
      [1, 6],
      [3, 6],
    ],
  ],
  J: [
    [
      [4, 0],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
    ],
  ],
  K: [
    [
      [0, 0],
      [0, 6],
    ],
    [
      [4, 0],
      [0, 4],
    ],
    [
      [1.3, 3],
      [4, 6],
    ],
  ],
  L: [
    [
      [0, 0],
      [0, 6],
      [4, 6],
    ],
  ],
  M: [
    [
      [0, 6],
      [0, 0],
      [2, 3],
      [4, 0],
      [4, 6],
    ],
  ],
  N: [
    [
      [0, 6],
      [0, 0],
      [4, 6],
      [4, 0],
    ],
  ],
  O: [O],
  P: [P],
  Q: [
    O,
    [
      [2.5, 4.5],
      [4, 6],
    ],
  ],
  R: [
    P,
    [
      [2, 3],
      [4, 6],
    ],
  ],
  S: [
    [
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
      [0, 2],
      [1, 3],
      [3, 3],
      [4, 4],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
    ],
  ],
  T: [
    [
      [0, 0],
      [4, 0],
    ],
    [
      [2, 0],
      [2, 6],
    ],
  ],
  U: [
    [
      [0, 0],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 0],
    ],
  ],
  V: [
    [
      [0, 0],
      [2, 6],
      [4, 0],
    ],
  ],
  W: [
    [
      [0, 0],
      [1, 6],
      [2, 3],
      [3, 6],
      [4, 0],
    ],
  ],
  X: [
    [
      [0, 0],
      [4, 6],
    ],
    [
      [4, 0],
      [0, 6],
    ],
  ],
  Y: [
    [
      [0, 0],
      [2, 3],
      [4, 0],
    ],
    [
      [2, 3],
      [2, 6],
    ],
  ],
  Z: [
    [
      [0, 0],
      [4, 0],
      [0, 6],
      [4, 6],
    ],
  ],
  '0': [
    O,
    [
      [4, 1],
      [0, 5],
    ],
  ],
  '1': [
    [
      [1, 1],
      [2, 0],
      [2, 6],
    ],
    [
      [1, 6],
      [3, 6],
    ],
  ],
  '2': [
    [
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [0, 6],
      [4, 6],
    ],
  ],
  '3': [
    [
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [3, 3],
      [4, 4],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
    ],
    [
      [1.5, 3],
      [3, 3],
    ],
  ],
  '4': [
    [
      [3, 6],
      [3, 0],
      [0, 4],
      [4, 4],
    ],
  ],
  '5': [
    [
      [4, 0],
      [0, 0],
      [0, 3],
      [3, 3],
      [4, 4],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
    ],
  ],
  '6': [
    [
      [4, 1],
      [3, 0],
      [1, 0],
      [0, 1],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
      [0, 3],
    ],
  ],
  '7': [
    [
      [0, 0],
      [4, 0],
      [1.5, 6],
    ],
  ],
  '8': [
    [
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 2],
      [3, 3],
      [1, 3],
      [0, 2],
      [0, 1],
      [1, 0],
    ],
    [
      [1, 3],
      [0, 4],
      [0, 5],
      [1, 6],
      [3, 6],
      [4, 5],
      [4, 4],
      [3, 3],
    ],
  ],
  '9': [
    [
      [4, 3],
      [1, 3],
      [0, 2],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
      [4, 5],
      [3, 6],
      [1, 6],
      [0, 5],
    ],
  ],
  '.': [
    [
      [1.8, 5.6],
      [2.2, 5.6],
      [2.2, 6],
      [1.8, 6],
      [1.8, 5.6],
    ],
  ],
  '-': [
    [
      [0.5, 3],
      [3.5, 3],
    ],
  ],
  ' ': [],
};

const GLYPH_WIDTH = 4;
const GLYPH_ADVANCE = 5.5;

export function supportedCharacter(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS;
}

/**
 * SVG path data for `text`, with its top-left corner at (x, y) and the given cap height in pixels.
 * Unsupported characters render as blanks. Stroke the path; it has no fill.
 */
export function textPath(
  text: string,
  opts: { size: number; x?: number; y?: number },
): {
  d: string;
  width: number;
  height: number;
} {
  const scale = opts.size / 6;
  const x0 = opts.x ?? 0;
  const y0 = opts.y ?? 0;
  const parts: string[] = [];
  const chars = [...text.toUpperCase()];
  chars.forEach((ch, i) => {
    const offset = x0 + i * GLYPH_ADVANCE * scale;
    for (const line of GLYPHS[ch] ?? []) {
      line.forEach(([gx, gy], j) => {
        const px = (offset + gx * scale).toFixed(1);
        const py = (y0 + gy * scale).toFixed(1);
        parts.push(`${j === 0 ? 'M' : 'L'}${px} ${py}`);
      });
    }
  });
  const width = chars.length === 0 ? 0 : ((chars.length - 1) * GLYPH_ADVANCE + GLYPH_WIDTH) * scale;
  return { d: parts.join(' '), width, height: opts.size };
}
