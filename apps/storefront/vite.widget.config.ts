import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Builds the storefront widget as one small, dependency-free IIFE + CSS file for the theme app
 * extension (`apps/shopify-app/extensions/ai-art-preview/assets/`). Run with
 * `pnpm --filter @aiart/storefront build:widget`.
 */
export default defineConfig({
  build: {
    outDir: 'dist-widget',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(dirname, 'src/widget/main.ts'),
      name: 'AiArtPreview',
      formats: ['iife'],
      fileName: () => 'ai-art-preview.js',
    },
    rollupOptions: {
      output: { assetFileNames: 'ai-art-preview.[ext]' },
    },
    target: 'es2020',
    minify: 'esbuild',
  },
});
