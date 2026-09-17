import type { OrderJobData } from '@aiart/core/queue';
import { processOrderEvent } from '@aiart/core/services';
import type { Job as BullJob } from 'bullmq';

export async function processOrder(job: BullJob<OrderJobData>): Promise<void> {
  await processOrderEvent(job.data.orderEventId);
}
