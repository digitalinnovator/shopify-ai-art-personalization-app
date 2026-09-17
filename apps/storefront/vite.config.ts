// This config (and the harness plugin it loads) imports `@aiart/core`, whose files use
// extensionless relative imports (fine under `tsx`, which every other app/script in this repo
// runs through — but Vite loads its own config with plain Node ESM resolution, which requires
// real extensions). Run this file via `pnpm dev` (which invokes `node --import tsx …/vite.js`,
// see package.json) rather than the bare `vite` binary, so the same resolution patch applies here.
import { loadEnv } from '@aiart/core/config';
import { defineConfig } from 'vite';
import { storefrontHarnessPlugin } from './harness/proxy-plugin';

loadEnv();

export default defineConfig({
  server: {
    port: Number(process.env.HARNESS_PORT) || 5173,
    strictPort: true,
  },
  plugins: [storefrontHarnessPlugin()],
});
