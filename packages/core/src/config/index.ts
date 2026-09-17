import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

/** Empty strings in .env mean "not set". */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const booleanString = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * Each subsystem validates only the variables it needs, on first use, so a missing
 * provider key never stops the admin panel from starting (and so on).
 */
const sections = {
  app: z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  }),
  db: z.object({
    DATABASE_URL: z.url(),
  }),
  redis: z.object({
    REDIS_URL: z.string().min(1),
    QUEUE_PREFIX: z.string().min(1).default('aiart'),
  }),
  storage: z.object({
    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: optionalString,
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString.default(true),
  }),
  shopify: z.object({
    SHOPIFY_API_KEY: z.string().min(1),
    SHOPIFY_API_SECRET: z.string().min(8),
    SHOPIFY_APP_URL: z.url(),
    SHOPIFY_SCOPES: z.string().default('read_orders'),
    DEV_SHOP_DOMAIN: z.string().min(1).default('dev-store.myshopify.com'),
  }),
  api: z.object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_PUBLIC_URL: z.url(),
    /**
     * Public https base AI providers call back to (`{WEBHOOK_PUBLIC_URL}/webhooks/ai/{provider}`).
     * Must be reachable from the internet; defaults to API_PUBLIC_URL, which in local development
     * is localhost and therefore only reached by the fallback poll.
     */
    WEBHOOK_PUBLIC_URL: optionalString.pipe(z.url().optional()),
    CLIENT_IP_HEADER: z.string().min(1).default('x-forwarded-for'),
  }),
  worker: z.object({
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4001),
  }),
  admin: z.object({
    AUTH_MODE: z.enum(['mock', 'shopify']).default('mock'),
    ADMIN_PORT: z.coerce.number().int().positive().default(3000),
    ADMIN_SESSION_SECRET: z.string().min(16),
  }),
  mock: z.object({
    MOCK_PROVIDER_DELAY_MS: z.coerce.number().int().min(0).default(1500),
    MOCK_WEBHOOK_SECRET: z.string().min(8),
  }),
  providers: z.object({
    FAL_KEY: optionalString,
    BFL_API_KEY: optionalString,
    BFL_WEBHOOK_SECRET: optionalString,
    GEMINI_API_KEY: optionalString,
    OPENAI_API_KEY: optionalString,
  }),
} as const;

export type ConfigSection = keyof typeof sections;
export type Config<K extends ConfigSection> = z.output<(typeof sections)[K]>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const cache = new Map<ConfigSection, unknown>();
let envLoaded = false;

function findRepoRoot(start: string): string | undefined {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Loads the repo-root `.env` once. Variables already present in the environment win. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const root = findRepoRoot(process.cwd());
  const file = root ? join(root, '.env') : undefined;
  if (!file || !existsSync(file)) return;
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function config<K extends ConfigSection>(section: K): Config<K> {
  const cached = cache.get(section);
  if (cached) return cached as Config<K>;
  loadEnv();
  const result = sections[section].safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(
      `Invalid or missing environment variables for "${section}":\n${problems}\nSee .env.example.`,
    );
  }
  cache.set(section, result.data);
  return result.data as Config<K>;
}

/** Test helper: forget cached sections so changed `process.env` values are read again. */
export function resetConfig(): void {
  cache.clear();
}
