#!/usr/bin/env node
// Guards the storefront widget bundle size. The widget ships inside every merchant product page,
// so it must stay small; the most likely regression is an import from the `@aiart/contracts`
// barrel, which drags zod in. Fails the build when either limit is exceeded.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsPath = join(root, 'apps', 'storefront', 'dist-widget', 'ai-art-preview.js');
const cssPath = join(root, 'apps', 'storefront', 'dist-widget', 'ai-art-preview.css');

// The full widget (stepper, drop zone, lightbox, copy, icons) minifies to ~24 KB (~7 KB gzipped).
// The limit leaves headroom for small changes but catches a zod-sized regression (+90 KB).
const MAX_JS_BYTES = 28 * 1024;
const MAX_CSS_BYTES = 14 * 1024;

const js = statSync(jsPath).size;
const css = statSync(cssPath).size;
const source = readFileSync(jsPath, 'utf8');
const problems = [];

if (js > MAX_JS_BYTES) problems.push(`ai-art-preview.js is ${js} bytes (limit ${MAX_JS_BYTES})`);
if (css > MAX_CSS_BYTES) problems.push(`ai-art-preview.css is ${css} bytes (limit ${MAX_CSS_BYTES})`);
if (source.includes('ZodError')) {
  problems.push('zod is bundled: import from "@aiart/contracts/constants" or "/statuses", not the barrel');
}

console.log(`widget bundle: js ${(js / 1024).toFixed(1)} KB, css ${(css / 1024).toFixed(1)} KB`);
if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
