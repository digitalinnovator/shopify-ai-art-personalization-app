import { and, desc, eq } from 'drizzle-orm';
import { db, jobs, privacyRequests, shops, uploads } from '../db';
import { deletePrefix, storageKeys } from '../storage';

export type PrivacyTopic = 'customers/data_request' | 'customers/redact' | 'shop/redact';

export interface PrivacyWebhookInput {
  shopDomain: string;
  shopId?: string;
  topic: PrivacyTopic;
  customerId?: string;
  payload: unknown;
}

export async function recordPrivacyRequest(input: PrivacyWebhookInput): Promise<string> {
  const [row] = await db()
    .insert(privacyRequests)
    .values({
      shopId: input.shopId,
      shopDomain: input.shopDomain,
      topic: input.topic,
      customerId: input.customerId,
      payload: input.payload as Record<string, unknown>,
    })
    .returning({ id: privacyRequests.id });
  return row!.id;
}

export async function listPrivacyRequests(shopId: string, limit = 100) {
  return db()
    .select()
    .from(privacyRequests)
    .where(eq(privacyRequests.shopId, shopId))
    .orderBy(desc(privacyRequests.createdAt))
    .limit(limit);
}

async function markCompleted(requestId: string, summary: string): Promise<void> {
  await db()
    .update(privacyRequests)
    .set({ status: 'completed', summary, completedAt: new Date() })
    .where(eq(privacyRequests.id, requestId));
}

/** Deletes a customer's photos, previews and selections. Orders are kept, with their link to the selection cleared. */
export async function handleCustomerRedact(
  requestId: string,
  shopId: string,
  customerId: string,
): Promise<void> {
  const customerUploads = await db()
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.shopId, shopId), eq(uploads.customerId, customerId)));

  let jobCount = 0;
  for (const upload of customerUploads) {
    const customerJobs = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.uploadId, upload.id));
    for (const job of customerJobs) {
      await deletePrefix(storageKeys.jobPrefix(shopId, job.id));
      await db().delete(jobs).where(eq(jobs.id, job.id)); // cascades previews and selections
      jobCount++;
    }
    await deletePrefix(storageKeys.uploadPrefix(shopId, upload.id));
    await db().delete(uploads).where(eq(uploads.id, upload.id));
  }
  await markCompleted(
    requestId,
    `Deleted ${customerUploads.length} upload(s) and ${jobCount} job(s) for customer ${customerId}`,
  );
}

/** A shop uninstall's data-deletion request: everything under the shop's storage prefix and row. */
export async function handleShopRedact(requestId: string, shopDomain: string): Promise<void> {
  const [shop] = await db().select().from(shops).where(eq(shops.domain, shopDomain));
  if (!shop) {
    await markCompleted(requestId, 'Shop had already been removed');
    return;
  }
  const deletedObjects = await deletePrefix(storageKeys.shopPrefix(shop.id));
  await db().delete(shops).where(eq(shops.id, shop.id)); // cascades every table scoped to this shop
  await markCompleted(
    requestId,
    `Deleted ${deletedObjects} storage object(s) and all data for ${shopDomain}`,
  );
}
