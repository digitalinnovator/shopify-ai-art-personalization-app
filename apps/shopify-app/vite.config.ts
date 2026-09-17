// Run through `pnpm dev` / `pnpm dev:shopify` (`node --import tsx …`), not the bare `react-router`
// binary — this config, and route modules that import `@aiart/core`, rely on tsx's resolution
// patch for the workspace packages' extensionless internal imports. See
// apps/storefront/vite.config.ts for the full explanation.
import { loadEnv } from '@aiart/core/config';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

// `shopify app dev` passes its tunnel URL as HOST rather than SHOPIFY_APP_URL. scripts/dev-shopify.mjs
// normally maps it, but this keeps a bare `pnpm dev` under the CLI working too. It runs before
// loadEnv so the localhost value in the repo-root .env does not win.
if (process.env.HOST?.startsWith('http') && !process.env.SHOPIFY_APP_URL) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

loadEnv();

// Under `shopify app dev` the CLI sets PORT and (via the mapping above) SHOPIFY_APP_URL, its tunnel.
// Mirror Shopify's React Router template: allow the tunnel host and run HMR over wss through it.
// Locally, the values from .env keep everything on localhost.
const appUrl = process.env.SHOPIFY_APP_URL;
const host = appUrl ? new URL(appUrl).hostname : 'localhost';
// Plain `pnpm dev` (port 3000) pins HMR to 64999 like Shopify's template. A CLI-started instance
// (PORT set) on localhost must not claim the same socket, since both can run at the same time.
const hmr =
  host !== 'localhost'
    ? { protocol: 'wss' as const, host, port: Number(process.env.FRONTEND_PORT) || 8002, clientPort: 443 }
    : process.env.PORT
      ? undefined
      : { protocol: 'ws' as const, host: 'localhost', port: 64999, clientPort: 64999 };

// There is one public URL (the tunnel, later the real host) and Shopify sends the storefront's
// app-proxy traffic and the webhooks to it. Those paths belong to the API process, so the dev
// server forwards them there untouched — webhook HMACs are checked over the raw bytes, and the
// proxy does not re-encode them.
const apiUrl = `http://localhost:${process.env.API_PORT || 4000}`;

// Images (design examples, previews, thumbnails) are presigned storage URLs. In development the
// storage is the local MinIO container, which a Shopify page (https) cannot load from
// http://localhost. `pnpm shopify:sync-env` therefore points S3_PUBLIC_ENDPOINT at the tunnel, and
// this forwards the bucket's path to MinIO. The Host header is left untouched on purpose: the
// presigned signature covers it, and MinIO checks it against the host the link was signed for.
const storageEndpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const storageBucket = process.env.S3_BUCKET || 'aiart-dev';

export default defineConfig({
  plugins: [reactRouter()],
  // Pre-bundle these up front. Discovering them mid-session makes Vite re-optimize and briefly
  // serve two React copies, which surfaces as "Cannot read properties of null (reading 'useContext')".
  optimizeDeps: {
    include: ['@shopify/shopify-app-react-router/react', '@shopify/shopify-app-react-router/server'],
  },
  server: {
    port: Number(process.env.PORT) || Number(process.env.ADMIN_PORT) || 3000,
    strictPort: true,
    allowedHosts: host === 'localhost' ? undefined : [host],
    cors: { preflightContinue: true },
    hmr,
    proxy: {
      '/proxy': { target: apiUrl },
      '/webhooks': { target: apiUrl },
      [`/${storageBucket}`]: { target: storageEndpoint, changeOrigin: false },
    },
  },
});
