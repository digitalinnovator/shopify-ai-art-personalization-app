import { randomUUID } from 'node:crypto';
import { DesignConfigSchema } from '@aiart/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeDb,
  db,
  designs,
  designVersions,
  jobs,
  orderItems,
  orders,
  previews,
  selections,
  shops,
  uploads,
} from '../src/db';
import { closeAllQueues, closeRedisConnection } from '../src/queue';
import { hashToken, randomToken } from '../src/security';
import { createJob, getJob, regenerateJob, selectPreview } from '../src/services/jobs';
import { processOrderEvent, recordOrderEvent } from '../src/services/orders';

const config = DesignConfigSchema.parse({
  prompt: 'Test design prompt for integration tests.',
  slots: [
    { slot: 'A', provider: 'mock', model: 'mock-illustrate' },
    { slot: 'B', provider: 'mock', model: 'mock-painterly' },
  ],
  limits: { regenerationsPerSession: 1 },
});

let shopId: string;
let designId: string;
let versionId: string;

async function makeUpload(): Promise<string> {
  const id = randomUUID();
  await db()
    .insert(uploads)
    .values({
      id,
      shopId,
      sessionId: 'sess-1',
      storageKey: `shops/${shopId}/uploads/${id}/photo.jpg`,
      status: 'validated',
      consentAt: new Date(),
      consentVersion: 'test',
    });
  return id;
}

beforeAll(async () => {
  const domain = `jobs-orders-${randomUUID()}.myshopify.test`;
  const [shop] = await db()
    .insert(shops)
    .values({
      domain,
      settings: {
        retentionDays: 30,
        selectedRetentionDays: 90,
        watermark: { text: 'PREVIEW', opacity: 0.35 },
        releaseTrigger: 'orders/paid',
        dailyPreviewCap: 500,
        requireEmail: false,
        rateLimitPerMinute: 30,
      },
    })
    .returning({ id: shops.id });
  shopId = shop!.id;
  const [design] = await db()
    .insert(designs)
    .values({ shopId, slug: 'test-design', name: 'Test Design', type: 'style_transfer', status: 'live' })
    .returning({ id: designs.id });
  designId = design!.id;
  const [version] = await db()
    .insert(designVersions)
    .values({ designId, version: 1, status: 'published', config })
    .returning({ id: designVersions.id });
  versionId = version!.id;
  await db().update(designs).set({ liveVersionId: versionId }).where(eq(designs.id, designId));
});

afterAll(async () => {
  await closeAllQueues();
  await closeRedisConnection();
  await closeDb();
});

describe('createJob', () => {
  it('creates a job with one preview row per slot, in round 1', async () => {
    const uploadId = await makeUpload();
    const { jobId, created } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    expect(created).toBe(true);
    const view = await getJob(jobId);
    expect(view?.job.status).toBe('queued');
    expect(view?.previews).toHaveLength(2);
    expect(view?.previews.map((p) => p.slot).sort()).toEqual(['A', 'B']);
  });

  it('returns the same active job for a second call on the same upload and design (idempotent)', async () => {
    const uploadId = await makeUpload();
    const first = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    const second = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);
  });

  it('allows a fresh job after the previous one failed', async () => {
    const uploadId = await makeUpload();
    const first = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    await db().update(jobs).set({ status: 'failed' }).where(eq(jobs.id, first.jobId));
    const second = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    expect(second.created).toBe(true);
    expect(second.jobId).not.toBe(first.jobId);
  });

  it('allows unlimited admin_test jobs on the same sample photo', async () => {
    const uploadId = await makeUpload();
    const a = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'admin',
      source: 'admin_test',
    });
    const b = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'admin',
      source: 'admin_test',
    });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.jobId).not.toBe(b.jobId);
  });
});

describe('regenerateJob', () => {
  async function settledJob() {
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    await db().update(jobs).set({ status: 'ready' }).where(eq(jobs.id, jobId));
    await db().update(previews).set({ status: 'ready' }).where(eq(previews.jobId, jobId));
    return jobId;
  }

  it('only lets one of two concurrent regenerate calls succeed when the limit is 1', async () => {
    const jobId = await settledJob();
    const [a, b] = await Promise.all([regenerateJob(jobId), regenerateJob(jobId)]);
    const results = [a, b];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    if (!failed[0]!.ok) expect(failed[0]!.reason).toBe('limit_reached');

    const view = await getJob(jobId);
    expect(view?.job.round).toBe(2);
    expect(view?.previews).toHaveLength(2); // round 2's fresh previews, not round 1's
    expect(view?.previews.every((p) => p.round === 2)).toBe(true);
  });

  it('refuses to regenerate a job that is still generating', async () => {
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    const result = await regenerateJob(jobId);
    expect(result).toEqual({ ok: false, reason: 'not_settled' });
  });

  it('reports not_found for an unknown job id', async () => {
    expect(await regenerateJob(randomUUID())).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('selectPreview + order release', () => {
  async function readyJobWithSelection() {
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    await db().update(jobs).set({ status: 'ready' }).where(eq(jobs.id, jobId));
    const rows = await db()
      .update(previews)
      .set({
        status: 'ready',
        originalKey: `shops/${shopId}/jobs/${jobId}/r1-A-original.png`,
      })
      .where(eq(previews.jobId, jobId))
      .returning();
    const previewA = rows.find((p) => p.slot === 'A')!;
    // Put a real object at the "original" key so order release has something to copy.
    const { putObject } = await import('../src/storage');
    await putObject(previewA.originalKey!, Buffer.from('fake-final-artwork'), 'image/png');
    return { jobId, previewA };
  }

  it('rejects selecting a preview that is not ready', async () => {
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-1',
      source: 'storefront',
    });
    const view = await getJob(jobId);
    const result = await selectPreview(jobId, view!.previews[0]!.id);
    expect(result).toEqual({ error: 'not_ready' });
  });

  it('selecting marks the job selected and returns a token whose hash is stored (not the token itself)', async () => {
    const { jobId, previewA } = await readyJobWithSelection();
    const result = await selectPreview(jobId, previewA.id);
    if ('error' in result) throw new Error(`expected success, got ${result.error}`);
    const [row] = await db().select().from(selections).where(eq(selections.previewId, previewA.id));
    expect(row?.tokenHash).toBe(hashToken(result.token));
    expect(row?.tokenHash).not.toBe(result.token);
    const view = await getJob(jobId);
    expect(view?.job.status).toBe('selected');
  });

  it('processes create-then-paid webhooks: marks ordered on create, releases the file on paid', async () => {
    const { jobId, previewA } = await readyJobWithSelection();
    const selectResult = await selectPreview(jobId, previewA.id);
    if ('error' in selectResult) throw new Error('expected success');
    const token = selectResult.token;

    const shopifyOrderId = `order-${randomUUID()}`;
    const payload = {
      id: shopifyOrderId,
      name: '#1001',
      financial_status: 'pending',
      customer: { id: 'cust-1', email: 'buyer@example.com' },
      line_items: [
        {
          id: 'li-1',
          title: 'Test Design',
          quantity: 2,
          properties: [{ name: '_ai_selection', value: token }],
        },
      ],
    };

    const created = await recordOrderEvent({
      shopId,
      webhookId: `wh-create-${randomUUID()}`,
      topic: 'orders/create',
      payload,
    });
    expect(created.duplicate).toBe(false);
    await processOrderEvent(created.orderEventId);

    const [selectionAfterCreate] = await db().select().from(selections).where(eq(selections.jobId, jobId));
    expect(selectionAfterCreate?.status).toBe('ordered');

    const [orderRow] = await db().select().from(orders).where(eq(orders.shopifyOrderId, shopifyOrderId));
    const [itemAfterCreate] = await db()
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderRow!.id));
    expect(itemAfterCreate?.status).toBe('pending'); // not released yet: releaseTrigger is orders/paid
    expect(itemAfterCreate?.quantity).toBe(2);

    const paid = await recordOrderEvent({
      shopId,
      webhookId: `wh-paid-${randomUUID()}`,
      topic: 'orders/paid',
      payload: { ...payload, financial_status: 'paid' },
    });
    await processOrderEvent(paid.orderEventId);

    const [itemAfterPaid] = await db().select().from(orderItems).where(eq(orderItems.orderId, orderRow!.id));
    expect(itemAfterPaid?.status).toBe('released');
    expect(itemAfterPaid?.finalKey).toBeTruthy();

    const [selectionAfterPaid] = await db().select().from(selections).where(eq(selections.jobId, jobId));
    expect(selectionAfterPaid?.status).toBe('released');

    const [finalOrderRow] = await db().select().from(orders).where(eq(orders.id, orderRow!.id));
    expect(finalOrderRow?.status).toBe('released');
  });

  it('ignores a redelivered webhook (same webhook id) instead of double-processing', async () => {
    const { jobId, previewA } = await readyJobWithSelection();
    const selectResult = await selectPreview(jobId, previewA.id);
    if ('error' in selectResult) throw new Error('expected success');

    const webhookId = `wh-dup-${randomUUID()}`;
    const payload = {
      id: `order-${randomUUID()}`,
      financial_status: 'paid',
      line_items: [{ id: 'li-1', properties: [{ name: '_ai_selection', value: selectResult.token }] }],
    };
    const first = await recordOrderEvent({ shopId, webhookId, topic: 'orders/paid', payload });
    const second = await recordOrderEvent({ shopId, webhookId, topic: 'orders/paid', payload });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.orderEventId).toBe('');
  });

  it('cancelling an order revokes items that were never released', async () => {
    const { jobId, previewA } = await readyJobWithSelection();
    const selectResult = await selectPreview(jobId, previewA.id);
    if ('error' in selectResult) throw new Error('expected success');

    const shopifyOrderId = `order-${randomUUID()}`;
    const payload = {
      id: shopifyOrderId,
      financial_status: 'pending',
      line_items: [{ id: 'li-1', properties: [{ name: '_ai_selection', value: selectResult.token }] }],
    };
    const created = await recordOrderEvent({
      shopId,
      webhookId: `wh-c-${randomUUID()}`,
      topic: 'orders/create',
      payload,
    });
    await processOrderEvent(created.orderEventId);

    const cancelled = await recordOrderEvent({
      shopId,
      webhookId: `wh-x-${randomUUID()}`,
      topic: 'orders/cancelled',
      payload,
    });
    await processOrderEvent(cancelled.orderEventId);

    const [orderRow] = await db().select().from(orders).where(eq(orders.shopifyOrderId, shopifyOrderId));
    expect(orderRow?.status).toBe('cancelled');
    const [item] = await db().select().from(orderItems).where(eq(orderItems.orderId, orderRow!.id));
    expect(item?.status).toBe('revoked');
  });

  it('flags an order item as needing attention when its selection token is unknown', async () => {
    const payload = {
      id: `order-${randomUUID()}`,
      financial_status: 'paid',
      line_items: [{ id: 'li-1', properties: [{ name: '_ai_selection', value: randomToken() }] }],
    };
    const created = await recordOrderEvent({
      shopId,
      webhookId: `wh-unk-${randomUUID()}`,
      topic: 'orders/paid',
      payload,
    });
    await processOrderEvent(created.orderEventId);
    const [orderRow] = await db().select().from(orders).where(eq(orders.shopifyOrderId, payload.id));
    expect(orderRow?.status).toBe('needs_attention');
  });
});
