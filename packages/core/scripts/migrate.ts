import { config } from '../src/config';
import { closeDb, runMigrations } from '../src/db';

const target = new URL(config('db').DATABASE_URL);
await runMigrations();
await closeDb();
console.log(`  migrations applied to ${target.pathname.slice(1)}`);
