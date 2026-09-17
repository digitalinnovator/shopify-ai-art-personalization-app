// `shopify app dev` runs this (see shopify.web.toml). It's the normal dev server with real Shopify
// authentication switched on — a small script rather than `AUTH_MODE=shopify pnpm dev` because the
// CLI runs the command through the platform shell, and that syntax doesn't work on Windows.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.AUTH_MODE = 'shopify';

// The CLI hands the tunnel URL over as HOST (and APP_URL), not SHOPIFY_APP_URL, and passes the
// app's real key, secret and scopes as plain env vars. Mirror Shopify's own template: expose the
// URL under the name the app reads, and drop HOST so it cannot change what the server binds to.
const tunnelUrl = process.env.HOST || process.env.APP_URL;
if (tunnelUrl?.startsWith('http')) {
  process.env.SHOPIFY_APP_URL = tunnelUrl;
  delete process.env.HOST;
}

// The CLI no longer writes a .env file, but the API and worker run outside the CLI and still need
// the same client secret and public URL. Save what the CLI gave us (the file is gitignored) so
// `pnpm shopify:sync-env` can copy it into the repo-root .env.
if (process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET && process.env.SHOPIFY_APP_URL) {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const lines = [
    '# Written by scripts/dev-shopify.mjs from the values `shopify app dev` provides. Do not commit.',
    `SHOPIFY_API_KEY=${process.env.SHOPIFY_API_KEY}`,
    `SHOPIFY_API_SECRET=${process.env.SHOPIFY_API_SECRET}`,
    `SHOPIFY_APP_URL=${process.env.SHOPIFY_APP_URL}`,
    `SCOPES=${process.env.SCOPES ?? ''}`,
  ];
  writeFileSync(join(appDir, '.env'), `${lines.join('\n')}\n`);
  console.log(
    `[dev-shopify] Tunnel ${process.env.SHOPIFY_APP_URL}. Credentials saved to apps/shopify-app/.env. ` +
      'Run `pnpm shopify:sync-env` at the repo root and restart the API and worker if they changed.',
  );
}

const child = spawn(process.execPath, ['--import', 'tsx', 'node_modules/@react-router/dev/bin.js', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
