import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db, type Job, jobs, orderEvents, previews, shops, type Upload, uploads } from '../db';
import { enqueueFinalize, enqueueGenerate, enqueueOrder } from '../queue';
import { deletePrefix, storageKeys } from '../storage';

const LOST_ENQUEUE_AFTER_MS = 2 * 60_000;
const SUBMITTED_TIMEOUT_MS = 3 * 60_000;
const UNPROCESSED_EVENT_AFTER_MS = 2 * 60_000;

/**
 * Re-enqueues work that was committed to the database but, for whatever reason (a crash between
 * the commit and the enqueue, a dropped webhook callback), never made further progress. Runs
 * every minute; every action here is idempotent (deterministic BullMQ job ids, or a check before
 * acting), so running it twice is harmless.
 */
export async function recoverStalledWork(): Promise<{ previews: number; finalize: number; orders: number }> {
  const lostPreviews = await db()
    .select({ id: previews.id })
    .from(previews)
    .where(
      and(
        eq(previews.status, 'pending'),
        lt(previews.updatedAt, new Date(Date.now() - LOST_ENQUEUE_AFTER_MS)),
      ),
    );
  for (const p of lostPreviews) await enqueueGenerate(p.id);

  const stuckPreviews = await db()
    .select({ id: previews.id })
    .from(previews)
    .where(
      and(
        eq(previews.status, 'submitted'),
        lt(previews.updatedAt, new Date(Date.now() - SUBMITTED_TIMEOUT_MS)),
      ),
    );
  for (const p of stuckPreviews) await enqueueFinalize(p.id);

  const unprocessedEvents = await db()
    .select({ id: orderEvents.id })
    .from(orderEvents)
    .where(
      and(
        isNull(orderEvents.processedAt),
        lt(orderEvents.createdAt, new Date(Date.now() - UNPROCESSED_EVENT_AFTER_MS)),
      ),
    );
  for (const e of unprocessedEvents) await enqueueOrder(e.id);

  return { previews: lostPreviews.length, finalize: stuckPreviews.length, orders: unprocessedEvents.length };
}

/** `expired` is deliberately excluded: it means a job's normal retention already passed without ever being selected. */
const SELECTED_STATUSES = ['selected', 'ordered', 'delivered'] as const;

async function hasReachedSelected(uploadId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.uploadId, uploadId), inArray(jobs.status, [...SELECTED_STATUSES])))
    .limit(1);
  return Boolean(row);
}

async function deleteUploadAndJobs(shopId: string, upload: Upload): Promise<void> {
  const relatedJobs: Pick<Job, 'id'>[] = await db()
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.uploadId, upload.id));
  for (const job of relatedJobs) {
    await deletePrefix(storageKeys.jobPrefix(shopId, job.id));
    await db().delete(jobs).where(eq(jobs.id, job.id));
  }
  await deletePrefix(storageKeys.uploadPrefix(shopId, upload.id));
  await db()
    .update(uploads)
    .set({ status: 'deleted', deletedAt: new Date() })
    .where(eq(uploads.id, upload.id));
}

/**
 * Deletes photos (and their generated previews) past the shop's retention window. Uploads whose
 * job was ever selected get the longer `selectedRetentionDays` window — this covers abandoned
 * carts, where the customer picked a preview but never checked out.
 */
export async function sweepRetention(): Promise<{ deleted: number }> {
  const allShops = await db().select().from(shops);
  let deleted = 0;
  for (const shop of allShops) {
    const candidates = await db()
      .select()
      .from(uploads)
      .where(and(eq(uploads.shopId, shop.id), eq(uploads.status, 'validated'), eq(uploads.isSample, false)));

    for (const upload of candidates) {
      const selected = await hasReachedSelected(upload.id);
      const days = selected ? shop.settings.selectedRetentionDays : shop.settings.retentionDays;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      if (upload.createdAt.getTime() < cutoff) {
        await deleteUploadAndJobs(shop.id, upload);
        deleted++;
      }
    }

    // Jobs that were never selected age out to `expired` once past the plain retention window,
    // even if their upload was already deleted for an earlier reason.
    const cutoff = new Date(Date.now() - shop.settings.retentionDays * 24 * 60 * 60 * 1000);
    await db()
      .update(jobs)
      .set({ status: 'expired' })
      .where(
        and(
          eq(jobs.shopId, shop.id),
          inArray(jobs.status, ['ready', 'partial', 'failed']),
          lt(jobs.updatedAt, cutoff),
        ),
      );
  }
  return { deleted };
}

export async function runMaintenanceSweep(): Promise<void> {
  await recoverStalledWork();
  await sweepRetention();
}
