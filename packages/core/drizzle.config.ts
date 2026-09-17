import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only reads the schema; migrations are applied by scripts/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
