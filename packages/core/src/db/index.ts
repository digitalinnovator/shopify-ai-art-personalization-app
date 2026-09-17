import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

export * from './schema';
export { schema };

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the pool or an open transaction. */
export type Executor = Db | Tx;

let client: postgres.Sql | undefined;
let instance: Db | undefined;

export function db(): Db {
  if (!instance) {
    client = postgres(config('db').DATABASE_URL, { max: 10, onnotice: () => {} });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export async function closeDb(): Promise<void> {
  const current = client;
  client = undefined;
  instance = undefined;
  await current?.end({ timeout: 5 });
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(db(), { migrationsFolder: MIGRATIONS_FOLDER });
}
