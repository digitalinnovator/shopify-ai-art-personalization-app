import { Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config';

let connection: Redis | undefined;

/** Workers must disable command-count limits on their own connection, per BullMQ's docs. */
export function redisConnection(): Redis {
  connection ??= new Redis(config('redis').REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  const current = connection;
  connection = undefined;
  await current?.quit();
}

/** Isolates dev, test and e2e queues on the same Redis instance. */
function prefix(): string {
  return config('redis').QUEUE_PREFIX;
}

export interface GenerateJobData {
  previewId: string;
}
export interface FinalizeJobData {
  previewId: string;
}
export interface OrderJobData {
  orderEventId: string;
}
// The maintenance queue's repeatable job carries no payload.
export type MaintenanceJobData = Record<string, never>;

export const QUEUE_NAMES = {
  generate: 'generate',
  finalize: 'finalize',
  orders: 'orders',
  maintenance: 'maintenance',
} as const;

const queues = new Map<string, Queue>();

function baseOptions(): Pick<QueueOptions, 'connection' | 'prefix'> {
  return { connection: redisConnection(), prefix: prefix() };
}

function getQueue<T>(name: string): Queue<T> {
  const existing = queues.get(name) as Queue<T> | undefined;
  if (existing) return existing;
  const q = new Queue<T>(name, baseOptions());
  queues.set(name, q);
  return q;
}

export const generateQueue = () => getQueue<GenerateJobData>(QUEUE_NAMES.generate);
export const finalizeQueue = () => getQueue<FinalizeJobData>(QUEUE_NAMES.finalize);
export const ordersQueue = () => getQueue<OrderJobData>(QUEUE_NAMES.orders);
export const maintenanceQueue = () => getQueue<MaintenanceJobData>(QUEUE_NAMES.maintenance);

/** BullMQ job ids reject `:`, so ids are `gen-<previewId>` / `fin-<previewId>`, not `gen:<id>`. */
export const jobIds = {
  generate: (previewId: string) => `gen-${previewId}`,
  finalize: (previewId: string) => `fin-${previewId}`,
  order: (orderEventId: string) => `ord-${orderEventId}`,
};

export async function enqueueGenerate(previewId: string): Promise<void> {
  await generateQueue().add(
    'generate',
    { previewId },
    { jobId: jobIds.generate(previewId), attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  );
}

export async function enqueueFinalize(previewId: string): Promise<void> {
  await finalizeQueue().add(
    'finalize',
    { previewId },
    { jobId: jobIds.finalize(previewId), attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
  );
}

export async function enqueueOrder(orderEventId: string): Promise<void> {
  await ordersQueue().add(
    'process',
    { orderEventId },
    { jobId: jobIds.order(orderEventId), attempts: 8, backoff: { type: 'exponential', delay: 5000 } },
  );
}

/** Runs the maintenance sweep every minute via BullMQ's job scheduler (not a raw repeat option). */
export async function scheduleMaintenance(): Promise<void> {
  await maintenanceQueue().upsertJobScheduler(
    'sweep',
    { every: 60_000 },
    { name: 'sweep', data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } },
  );
}

export function makeWorker<T>(
  name: string,
  processor: (job: import('bullmq').Job<T>) => Promise<void>,
  opts: Partial<WorkerOptions> = {},
): Worker<T> {
  return new Worker<T>(name, processor, { ...baseOptions(), concurrency: 4, ...opts });
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
