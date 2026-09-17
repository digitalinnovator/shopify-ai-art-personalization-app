import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { CONSENT_VERSION, type DesignConfig, DesignConfigSchema, type SlotConfig } from '@aiart/contracts';
import { closeDb, db, designs, designVersions, orderItems, shops, uploads } from '@aiart/core/db';
import { syntheticPortrait } from '@aiart/core/images';
import {
  closeAllQueues,
  closeRedisConnection,
  enqueueFinalize,
  enqueueOrder,
  makeWorker,
  QUEUE_NAMES,
} from '@aiart/core/queue';
import { createJob, getJob, recordOrderEvent, selectPreview } from '@aiart/core/services';
import { getObject, putObject, storageKeys } from '@aiart/core/storage';
import type { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processFinalize } from '../src/processors/finalize';
import { processGenerate } from '../src/processors/generate';
import { processOrder } from '../src/processors/orders';

let workers: Worker[];
let shopId: string;

beforeAll(async () => {
  workers = [
    makeWorker(QUEUE_NAMES.generate, processGenerate, { concurrency: 4 }),
    makeWorker(QUEUE_NAMES.finalize, processFinalize, { concurrency: 4 }),
    makeWorker(QUEUE_NAMES.orders, processOrder, { concurrency: 4 }),
  ];
  await Promise.all(workers.map((w) => w.waitUntilReady()));

  const domain = `worker-pipeline-${randomUUID()}.myshopify.test`;
  const [shop] = await db()
    .insert(shops)
    .values({
      domain,
      settings: {
        retentionDays: 30,
        selectedRetentionDays: 90,
        watermark: { text: 'PREVIEW', opacity: 0.35 },
        releaseTrigger: 'orders/paid',
        dailyPreviewCap: 5000,
        requireEmail: false,
        rateLimitPerMinute: 300,
      },
    })
    .returning({ id: shops.id });
  shopId = shop!.id;
});

afterAll(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await closeAllQueues();
  await closeRedisConnection();
  await closeDb();
});

async function createLiveDesign(
  slots: SlotConfig[],
): Promise<{ designId: string; versionId: string; config: DesignConfig }> {
  const config = DesignConfigSchema.parse({
    prompt: 'Worker pipeline test design.',
    slots,
    limits: { regenerationsPerSession: 1 },
  });
  const [design] = await db()
    .insert(designs)
    .values({
      shopId,
      slug: `pipeline-${randomUUID()}`,
      name: 'Pipeline',
      type: 'style_transfer',
      status: 'live',
    })
    .returning({ id: designs.id });
  const [version] = await db()
    .insert(designVersions)
    .values({ designId: design!.id, version: 1, status: 'published', config })
    .returning({ id: designVersions.id });
  await db().update(designs).set({ liveVersionId: version!.id }).where(eq(designs.id, design!.id));
  return { designId: design!.id, versionId: version!.id, config };
}

async function makeUpload(): Promise<string> {
  const id = randomUUID();
  const photo = await syntheticPortrait();
  const key = storageKeys.uploadPhoto(shopId, id);
  await putObject(key, photo, 'image/jpeg');
  await db().insert(uploads).values({
    id,
    shopId,
    sessionId: 'sess-worker-test',
    storageKey: key,
    status: 'validated',
    mime: 'image/jpeg',
    bytes: photo.length,
    consentAt: new Date(),
    consentVersion: CONSENT_VERSION,
  });
  return id;
}

async function waitUntil<T>(fn: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result !== undefined) return result;
    await sleep(100);
  }
  throw new Error('waitUntil timed out');
}

describe('generate → finalize pipeline (mock provider, sync mode)', () => {
  it('turns a new job into two ready, watermarked previews with real stored files', async () => {
    const { designId, versionId, config } = await createLiveDesign([
      { slot: 'A', provider: 'mock', model: 'mock-illustrate', promptSuffix: '', seed: 1, settings: {} },
      { slot: 'B', provider: 'mock', model: 'mock-painterly', promptSuffix: '', seed: 2, settings: {} },
    ]);
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-worker-test',
      source: 'storefront',
    });

    const view = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.previews.every((p) => p.status === 'ready' || p.status === 'failed') ? v : undefined;
    });

    expect(view.job.status).toBe('ready');
    expect(view.previews).toHaveLength(2);
    for (const preview of view.previews) {
      expect(preview.status).toBe('ready');
      expect(preview.originalKey).toBeTruthy();
      expect(preview.previewKey).toBeTruthy();
      const original = await getObject(preview.originalKey!);
      const watermarked = await getObject(preview.previewKey!);
      expect(original && original.length).toBeGreaterThan(500);
      expect(watermarked && watermarked.length).toBeGreaterThan(500);
    }
  });

  it('marks the job partial when one slot refuses and the other succeeds', async () => {
    const { designId, versionId, config } = await createLiveDesign([
      {
        slot: 'A',
        provider: 'mock',
        model: 'mock-illustrate',
        promptSuffix: '',
        settings: { simulate: 'refusal' },
      },
      { slot: 'B', provider: 'mock', model: 'mock-painterly', promptSuffix: '', settings: {} },
    ]);
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-worker-test',
      source: 'storefront',
    });

    const view = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.job.status !== 'queued' && v.job.status !== 'generating' ? v : undefined;
    });
    expect(view.job.status).toBe('partial');
    const failed = view.previews.find((p) => p.slot === 'A');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorKind).toBe('refused');
  });

  it('marks the job failed when a slot permanently fails after exhausting retries', async () => {
    const { designId, versionId, config } = await createLiveDesign([
      {
        slot: 'A',
        provider: 'mock',
        model: 'mock-illustrate',
        promptSuffix: '',
        settings: { simulate: 'permanent_failure' },
      },
      {
        slot: 'B',
        provider: 'mock',
        model: 'mock-painterly',
        promptSuffix: '',
        settings: { simulate: 'permanent_failure' },
      },
    ]);
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-worker-test',
      source: 'storefront',
    });

    const view = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.job.status === 'failed' ? v : undefined;
    });
    expect(view.previews.every((p) => p.status === 'failed' && p.errorKind === 'permanent')).toBe(true);
  });
});

describe('async (webhook) mode', () => {
  it('leaves the preview submitted, then finalize completes it once woken up', async () => {
    const { designId, versionId, config } = await createLiveDesign([
      {
        slot: 'A',
        provider: 'mock',
        model: 'mock-illustrate',
        promptSuffix: '',
        settings: { mode: 'webhook' },
      },
      {
        slot: 'B',
        provider: 'mock',
        model: 'mock-painterly',
        promptSuffix: '',
        settings: { mode: 'webhook' },
      },
    ]);
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-worker-test',
      source: 'storefront',
    });

    const submitted = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.previews.every((p) => p.status === 'submitted') ? v : undefined;
    });
    expect(submitted.previews.every((p) => p.providerRequestId && p.pollUrl)).toBe(true);

    // In production the mock provider's own webhook POST (to the API) is what calls
    // `enqueueFinalize`; here there is no API listening, so this reproduces exactly what that
    // route does: wake `finalize` for each preview once its result should be ready.
    await sleep(50);
    for (const preview of submitted.previews) await enqueueFinalize(preview.id);

    const ready = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.job.status === 'ready' ? v : undefined;
    });
    expect(ready.previews.every((p) => p.status === 'ready')).toBe(true);
  });
});

describe('order release through the real orders worker', () => {
  it('releases the selected preview once the order is paid', async () => {
    const { designId, versionId, config } = await createLiveDesign([
      { slot: 'A', provider: 'mock', model: 'mock-illustrate', promptSuffix: '', settings: {} },
      { slot: 'B', provider: 'mock', model: 'mock-painterly', promptSuffix: '', settings: {} },
    ]);
    const uploadId = await makeUpload();
    const { jobId } = await createJob({
      shopId,
      designId,
      designVersionId: versionId,
      config,
      uploadId,
      sessionId: 'sess-worker-test',
      source: 'storefront',
    });
    const ready = await waitUntil(async () => {
      const v = await getJob(jobId);
      return v && v.job.status === 'ready' ? v : undefined;
    });
    const chosen = ready.previews.find((p) => p.slot === 'A')!;
    const selection = await selectPreview(jobId, chosen.id);
    if ('error' in selection) throw new Error('expected selection to succeed');

    // Unique per test run: order_items rows from other tests (or earlier runs against the same
    // shared test database) must never be picked up by this test's own lookups below.
    const shopifyOrderId = `order-${randomUUID()}`;
    const lineItemId = `li-${randomUUID()}`;
    const { orderEventId } = await recordOrderEvent({
      shopId,
      webhookId: `wh-${randomUUID()}`,
      topic: 'orders/paid',
      payload: {
        id: shopifyOrderId,
        financial_status: 'paid',
        line_items: [{ id: lineItemId, properties: [{ name: '_ai_selection', value: selection.token }] }],
      },
    });
    await enqueueOrder(orderEventId);

    const finalRow = await waitUntil(async () => {
      const [row] = await db().select().from(orderItems).where(eq(orderItems.lineItemId, lineItemId));
      return row?.status === 'released' ? row : undefined;
    });
    expect(finalRow.finalKey).toBeTruthy();
    const finalBytes = await getObject(finalRow.finalKey!);
    expect(finalBytes && finalBytes.length).toBeGreaterThan(500);
  });
});
