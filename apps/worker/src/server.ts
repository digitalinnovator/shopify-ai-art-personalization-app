import { closeDb } from '@aiart/core/db';
import { logger } from '@aiart/core/logger';
import { registerLiveProviders } from '@aiart/core/providers';
import {
  closeAllQueues,
  closeRedisConnection,
  makeWorker,
  QUEUE_NAMES,
  scheduleMaintenance,
} from '@aiart/core/queue';
import { startHealthServer } from './health';
import { processFinalize } from './processors/finalize';
import { processGenerate } from './processors/generate';
import { processMaintenance } from './processors/maintenance';
import { processOrder } from './processors/orders';

const log = logger('worker');

registerLiveProviders();

const workers = [
  makeWorker(QUEUE_NAMES.generate, processGenerate, { concurrency: 4 }),
  makeWorker(QUEUE_NAMES.finalize, processFinalize, { concurrency: 4 }),
  makeWorker(QUEUE_NAMES.orders, processOrder, { concurrency: 4 }),
  makeWorker(QUEUE_NAMES.maintenance, processMaintenance, { concurrency: 1 }),
];

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    log.error({ queue: worker.name, jobId: job?.id, err }, 'job failed');
  });
}

await scheduleMaintenance();
const health = startHealthServer();
log.info({ queues: workers.map((w) => w.name) }, 'worker started');

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('shutting down');
  await Promise.all(workers.map((w) => w.close()));
  await new Promise<void>((resolve) => health.close(() => resolve()));
  await closeAllQueues();
  await closeRedisConnection();
  await closeDb();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown();
  });
}
