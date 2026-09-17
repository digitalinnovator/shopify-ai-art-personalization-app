#!/usr/bin/env node
// Copies the built storefront widget into the theme app extension, which is what Shopify deploys
// to the merchant's product page. Runs as the last step of `pnpm --filter @aiart/storefront build:widget`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'apps', 'storefront', 'dist-widget');
const to = join(root, 'apps', 'shopify-app', 'extensions', 'ai-art-preview', 'assets');

mkdirSync(to, { recursive: true });
for (const file of ['ai-art-preview.js', 'ai-art-preview.css']) {
  copyFileSync(join(from, file), join(to, file));
}
console.log(`copied widget assets to ${to}`);
