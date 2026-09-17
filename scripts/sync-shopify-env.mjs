#!/usr/bin/env node
// Under `shopify app dev`, apps/shopify-app/scripts/dev-shopify.mjs saves the credentials and tunnel
// URL the CLI provides to apps/shopify-app/.env (the CLI itself no longer writes that file). The API
// and worker read the repo-root .env (see packages/core/src/config), and they need the same client
// secret to verify app-proxy signatures and webhook HMACs — so copy the Shopify values across.
//
//   pnpm shopify:sync-env
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appEnvPath = join(root, 'apps', 'shopify-app', '.env');
const rootEnvPath = join(root, '.env');

if (!existsSync(appEnvPath)) {
  console.error(`No ${appEnvPath} yet — run \`shopify app dev\` in apps/shopify-app first.`);
  process.exit(1);
}

const appEnv = parseEnv(readFileSync(appEnvPath, 'utf8'));
const mapping = {
  SHOPIFY_API_KEY: appEnv.SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET: appEnv.SHOPIFY_API_SECRET,
  SHOPIFY_APP_URL: appEnv.SHOPIFY_APP_URL,
  SHOPIFY_SCOPES: appEnv.SCOPES,
  // Presigned image links must be reachable from the Shopify page (https), so they go through the
  // tunnel too; the admin dev server forwards the bucket path to the local MinIO (vite.config.ts).
  // Set it back to http://localhost:9000 when working without the tunnel.
  S3_PUBLIC_ENDPOINT: appEnv.SHOPIFY_APP_URL,
  // AI providers with async results (fal, BFL) call back to this address. The admin dev server
  // forwards /webhooks to the API, so the tunnel reaches it; localhost would not.
  WEBHOOK_PUBLIC_URL: appEnv.SHOPIFY_APP_URL,
};

let rootEnv = existsSync(rootEnvPath) ? readFileSync(rootEnvPath, 'utf8') : '';
const updated = [];
for (const [key, value] of Object.entries(mapping)) {
  if (!value) continue;
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(rootEnv)) rootEnv = rootEnv.replace(pattern, line);
  else rootEnv += `${rootEnv.endsWith('\n') || rootEnv === '' ? '' : '\n'}${line}\n`;
  updated.push(key);
}
writeFileSync(rootEnvPath, rootEnv);
console.log(`Updated ${updated.join(', ')} in .env (values redacted).`);
