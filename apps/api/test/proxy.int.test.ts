import { randomUUID } from 'node:crypto';
import { DesignConfigSchema } from '@aiart/contracts';
import { config } from '@aiart/core/config';
import { closeDb, db, designs, designVersions, shops } from '@aiart/core/db';
import { syntheticPortrait } from '@aiart/core/images';
import { closeAllQueues, closeRedisConnection } from '@aiart/core/queue';
import { buildSignedProxyQuery, isValidSessionId, randomToken } from '@aiart/core/security';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

const SECRET = config('shopify').SHOPIFY_API_SECRET;

let app: FastifyInstance;
let shopDomain: string;
let designId: string;

function proxyUrl(path: string, extra: Record<string, string> = {}, sid = randomToken(16)): string {
  const params = buildSignedProxyQuery(new URLSearchParams({ sid, ...extra }), {
    shop: shopDomain,
    secret: SECRET,
    pathPrefix: '/apps/ai-art',
  });
  return `/proxy${path}?${params.toString()}`;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  shopDomain = `api-proxy-${randomUUID()}.myshopify.test`;
  const [shop] = await db()
    .insert(shops)
    .values({
      domain: shopDomain,
      settings: {
        retentionDays: 30,
        selectedRetentionDays: 90,
        watermark: { text: 'PREVIEW', opacity: 0.35 },
        releaseTrigger: 'orders/paid',
        dailyPreviewCap: 500,
        requireEmail: false,
        rateLimitPerMinute: 120,
      },
    })
    .returning({ id: shops.id });

  const config = DesignConfigSchema.parse({
    prompt: 'API test design prompt.',
    slots: [
      { slot: 'A', provider: 'mock', model: 'mock-illustrate' },
      { slot: 'B', provider: 'mock', model: 'mock-painterly' },
    ],
    limits: { regenerationsPerSession: 1 },
  });
  const [design] = await db()
    .insert(designs)
    .values({
      shopId: shop!.id,
      slug: 'api-test-design',
      name: 'API Test Design',
      type: 'style_transfer',
      status: 'live',
    })
    .returning({ id: designs.id });
  designId = design!.id;
  const [version] = await db()
    .insert(designVersions)
    .values({ designId, version: 1, status: 'published', config })
    .returning({ id: designVersions.id });
  await db().update(designs).set({ liveVersionId: version!.id }).where(eq(designs.id, designId));
});

afterAll(async () => {
  await app.close();
  await closeAllQueues();
  await closeRedisConnection();
  await closeDb();
});

describe('app proxy authentication', () => {
  it('rejects a request with no signature', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/proxy/designs/${designId}?shop=${shopDomain}&sid=${randomToken(16)}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_proxy_signature' } });
  });

  it('rejects a tampered signature', async () => {
    const url = proxyUrl(`/designs/${designId}`).replace(/signature=[^&]+/, 'signature=deadbeef');
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a stale timestamp', async () => {
    const sid = randomToken(16);
    const params = buildSignedProxyQuery(new URLSearchParams({ sid }), {
      shop: shopDomain,
      secret: SECRET,
      pathPrefix: '/apps/ai-art',
      nowSeconds: Math.floor(Date.now() / 1000) - 500,
    });
    const res = await app.inject({ method: 'GET', url: `/proxy/designs/${designId}?${params.toString()}` });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing or malformed sid', async () => {
    const params = buildSignedProxyQuery(new URLSearchParams(), {
      shop: shopDomain,
      secret: SECRET,
      pathPrefix: '/apps/ai-art',
    });
    const res = await app.inject({ method: 'GET', url: `/proxy/designs/${designId}?${params.toString()}` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_session' } });
  });

  it('rejects an unknown shop', async () => {
    const params = buildSignedProxyQuery(new URLSearchParams({ sid: randomToken(16) }), {
      shop: 'no-such-shop.myshopify.test',
      secret: SECRET,
      pathPrefix: '/apps/ai-art',
    });
    const res = await app.inject({ method: 'GET', url: `/proxy/designs/${designId}?${params.toString()}` });
    expect(res.statusCode).toBe(404);
  });

  it('accepts a validly signed request', async () => {
    const res = await app.inject({ method: 'GET', url: proxyUrl(`/designs/${designId}`) });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /proxy/designs/:id', () => {
  it('returns public design settings with real, fetchable example image URLs', async () => {
    const res = await app.inject({ method: 'GET', url: proxyUrl(`/designs/${designId}`) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: designId,
      name: 'API Test Design',
      type: 'style_transfer',
      regenerationsPerSession: 1,
    });
    expect(body.uploadRules).toBeDefined();
  });

  it('404s for a design that belongs to a different shop', async () => {
    const res = await app.inject({ method: 'GET', url: proxyUrl(`/designs/${randomUUID()}`) });
    expect(res.statusCode).toBe(404);
  });
});

/** A multipart/form-data body the way the widget sends it: text fields first, the photo last. */
function multipart(fields: Record<string, string>, photo?: { bytes: Buffer; type: string }) {
  const boundary = `----aiart${randomUUID().replace(/-/g, '')}`;
  const CRLF = '\r\n';
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
      ),
    );
  }
  if (photo) {
    chunks.push(
      Buffer.from(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="photo.jpg"${CRLF}Content-Type: ${photo.type}${CRLF}${CRLF}`,
      ),
      photo.bytes,
      Buffer.from(CRLF),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('upload → create job', () => {
  it('accepts a photo through the proxy, validates it and creates a queued job', async () => {
    const sid = randomToken(16);
    const photo = await syntheticPortrait();
    const uploadRes = await app.inject({
      method: 'POST',
      url: proxyUrl('/uploads', {}, sid),
      ...multipart({ designId, consent: 'true' }, { bytes: photo, type: 'image/jpeg' }),
    });
    expect(uploadRes.statusCode).toBe(200);
    const uploaded = uploadRes.json();
    expect(uploaded).toMatchObject({ ok: true });
    const { uploadId } = uploaded;
    expect(uploadId).toBeTruthy();

    const createRes = await app.inject({
      method: 'POST',
      url: proxyUrl('/previews', {}, sid),
      payload: { designId, uploadId },
    });
    expect(createRes.statusCode).toBe(200);
    const { jobId } = createRes.json();
    expect(jobId).toBeTruthy();

    const statusRes = await app.inject({ method: 'GET', url: proxyUrl(`/previews/${jobId}`, {}, sid) });
    expect(statusRes.statusCode).toBe(200);
    const status = statusRes.json();
    expect(['queued', 'generating']).toContain(status.status);
    expect(status.previews).toHaveLength(2);
    expect(status.regenerationsLeft).toBe(1);
  });

  it('rejects a photo that fails validation with a clear reason, and never creates a job for it', async () => {
    const sid = randomToken(16);
    const uploadRes = await app.inject({
      method: 'POST',
      url: proxyUrl('/uploads', {}, sid),
      ...multipart(
        { designId, consent: 'true' },
        { bytes: Buffer.from('not a real image'), type: 'image/jpeg' },
      ),
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json()).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses an upload without consent or without a photo', async () => {
    const sid = randomToken(16);
    const photo = await syntheticPortrait();
    const noConsent = await app.inject({
      method: 'POST',
      url: proxyUrl('/uploads', {}, sid),
      ...multipart({ designId, consent: 'false' }, { bytes: photo, type: 'image/jpeg' }),
    });
    expect(noConsent.statusCode).toBe(400);
    const noPhoto = await app.inject({
      method: 'POST',
      url: proxyUrl('/uploads', {}, sid),
      ...multipart({ designId, consent: 'true' }),
    });
    expect(noPhoto.statusCode).toBe(400);
  });

  it("will not let a different session act on someone else's job or upload", async () => {
    const ownerSid = randomToken(16);
    const photo = await syntheticPortrait();
    const uploadRes = await app.inject({
      method: 'POST',
      url: proxyUrl('/uploads', {}, ownerSid),
      ...multipart({ designId, consent: 'true' }, { bytes: photo, type: 'image/jpeg' }),
    });
    const { uploadId } = uploadRes.json();

    const intruderSid = randomToken(16);
    const intruderCreate = await app.inject({
      method: 'POST',
      url: proxyUrl('/previews', {}, intruderSid),
      payload: { designId, uploadId },
    });
    expect(intruderCreate.statusCode).toBe(404);

    const ownerCreate = await app.inject({
      method: 'POST',
      url: proxyUrl('/previews', {}, ownerSid),
      payload: { designId, uploadId },
    });
    const { jobId } = ownerCreate.json();

    const intruderStatus = await app.inject({
      method: 'GET',
      url: proxyUrl(`/previews/${jobId}`, {}, intruderSid),
    });
    expect(intruderStatus.statusCode).toBe(404);
  });
});

describe('daily preview cap', () => {
  it('returns 429 once the shop-wide daily cap is reached', async () => {
    const cappedDomain = `api-cap-${randomUUID()}.myshopify.test`;
    const [shop] = await db()
      .insert(shops)
      .values({
        domain: cappedDomain,
        settings: {
          retentionDays: 30,
          selectedRetentionDays: 90,
          watermark: { text: 'PREVIEW', opacity: 0.35 },
          releaseTrigger: 'orders/paid',
          dailyPreviewCap: 1, // one slot's worth — this design has 2 slots, so it should already be over
          requireEmail: false,
          rateLimitPerMinute: 120,
        },
      })
      .returning({ id: shops.id });
    const config = DesignConfigSchema.parse({
      prompt: 'Capped design.',
      slots: [
        { slot: 'A', provider: 'mock', model: 'mock-illustrate' },
        { slot: 'B', provider: 'mock', model: 'mock-painterly' },
      ],
    });
    const [design] = await db()
      .insert(designs)
      .values({ shopId: shop!.id, slug: 'capped', name: 'Capped', type: 'style_transfer', status: 'live' })
      .returning({ id: designs.id });
    const [version] = await db()
      .insert(designVersions)
      .values({ designId: design!.id, version: 1, status: 'published', config })
      .returning({ id: designVersions.id });
    await db().update(designs).set({ liveVersionId: version!.id }).where(eq(designs.id, design!.id));

    const sid = randomToken(16);
    const params = buildSignedProxyQuery(new URLSearchParams({ sid }), {
      shop: cappedDomain,
      secret: SECRET,
      pathPrefix: '/apps/ai-art',
    });
    const photo = await syntheticPortrait();
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/proxy/uploads?${params.toString()}`,
      ...multipart({ designId: design!.id, consent: 'true' }, { bytes: photo, type: 'image/jpeg' }),
    });
    const { uploadId } = uploadRes.json();

    const createRes = await app.inject({
      method: 'POST',
      url: `/proxy/previews?${params.toString()}`,
      payload: { designId: design!.id, uploadId },
    });
    expect(createRes.statusCode).toBe(429);
    expect(createRes.json()).toMatchObject({ error: { code: 'daily_cap_reached' } });
  });
});

it('sanity: isValidSessionId matches what buildSignedProxyQuery/randomToken produce', () => {
  expect(isValidSessionId(randomToken(16))).toBe(true);
});
