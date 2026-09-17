// Real Shopify authentication for the embedded admin. Only ever imported (dynamically) when
// AUTH_MODE=shopify, so the mock login used for local development never loads this module.
//
// Env vars come straight from `shopify app dev`, which injects SHOPIFY_API_KEY, SHOPIFY_API_SECRET,
// SCOPES and SHOPIFY_APP_URL (the tunnel) into the dev process. `loadEnv()` in vite.config.ts fills
// anything else from the repo-root `.env` — already-set variables always win.
import { db, shopifySessions } from '@aiart/core/db';
import { ApiVersion, AppDistribution, shopifyApp } from '@shopify/shopify-app-react-router/server';
import { DrizzleSessionStoragePostgres } from '@shopify/shopify-app-session-storage-drizzle';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? '',
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? '',
  apiVersion: ApiVersion.July26,
  scopes: (process.env.SCOPES ?? process.env.SHOPIFY_SCOPES ?? 'read_orders').split(',').map((s) => s.trim()),
  appUrl: process.env.SHOPIFY_APP_URL ?? '',
  authPathPrefix: '/auth',
  sessionStorage: new DrizzleSessionStoragePostgres(db(), shopifySessions),
  // A custom (single-store) app distributed from the Partner/Dev dashboard uses the same
  // token-exchange flow as an App Store app; SingleMerchant is only for apps created inside a
  // store's own admin.
  distribution: AppDistribution.AppStore,
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;
