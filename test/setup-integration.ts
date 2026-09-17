// Points every integration test at the isolated test database, bucket and queue prefix
// (created by `pnpm bootstrap`). Runs before each integration test file.
import { loadEnv, resetConfig } from '../packages/core/src/config';
import { closeDb, runMigrations } from '../packages/core/src/db';
import {
  closeAllQueues,
  closeRedisConnection,
  finalizeQueue,
  generateQueue,
  maintenanceQueue,
  ordersQueue,
} from '../packages/core/src/queue';

loadEnv();
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://aiart:aiart@localhost:5433/aiart_test';
process.env.S3_BUCKET = 'aiart-test';
process.env.QUEUE_PREFIX = 'aiart-test';
process.env.MOCK_PROVIDER_DELAY_MS = '0';
resetConfig();

// Bring the test database up to the current schema. Migrations are idempotent, so this is cheap
// when nothing changed, and a new migration no longer needs a manual step before tests pass.
await runMigrations();
await closeDb();

// Test files that don't run a worker (e.g. the API's own tests) still enqueue real BullMQ jobs.
// Left unconsumed, they'd pile up in Redis across runs and get picked up by a later file's
// worker, delaying its own jobs behind a growing backlog. Every integration file starts from a
// clean queue.
for (const queue of [generateQueue(), finalizeQueue(), ordersQueue(), maintenanceQueue()]) {
  await queue.obliterate({ force: true }).catch(() => {});
}
await closeAllQueues();
await closeRedisConnection();
