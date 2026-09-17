import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '../src/config';
import { syntheticPortrait, syntheticScene } from '../src/images/synthetic';
import { mockProvider, resetMockProvider } from '../src/providers/mock';
import { ProviderPermanentError, ProviderTemporaryError, ProviderTimeoutError } from '../src/providers/types';
import { signCallback } from '../src/security';
import type { GenerationRequest } from '../src/templates';

const WEBHOOK_SECRET = 'test-mock-webhook-secret';

function baseRequest(settings: Record<string, unknown> = {}): GenerationRequest {
  return {
    prompt: 'test prompt',
    images: [{ role: 'subject', storageKey: 'x' }],
    output: { aspectRatio: '1:1', longEdge: 256 },
    settings,
  };
}

async function ctxWith(settings: Record<string, unknown> = {}) {
  const subject = await syntheticPortrait({ width: 300, height: 300 });
  const scene = settings.withScene ? await syntheticScene({ width: 300, height: 300 }) : undefined;
  const images = [
    { role: 'subject' as const, bytes: subject, contentType: 'image/jpeg' },
    ...(scene ? [{ role: 'scene' as const, bytes: scene, contentType: 'image/png' }] : []),
  ];
  return {
    images,
    webhookUrl: 'http://localhost:0/webhooks/ai/mock',
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  process.env.MOCK_PROVIDER_DELAY_MS = '0';
  process.env.MOCK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  resetConfig();
  resetMockProvider();
});

describe('mock provider — sync mode', () => {
  it('renders a real PNG image from the subject photo', async () => {
    const ctx = await ctxWith();
    const result = await mockProvider.submit('mock-illustrate', baseRequest(), ctx);
    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.images).toHaveLength(1);
      expect(result.images[0]!.contentType).toBe('image/png');
      expect(result.images[0]!.bytes.length).toBeGreaterThan(500);
    }
  });

  it('blends in a scene reference when one is supplied', async () => {
    const ctx = await ctxWith({ withScene: true });
    const result = await mockProvider.submit('mock-illustrate', baseRequest({ withScene: true }), ctx);
    expect(result.kind).toBe('completed');
  });

  it('returns a refusal result for simulate: refusal (not an error)', async () => {
    const ctx = await ctxWith();
    const result = await mockProvider.submit('mock-illustrate', baseRequest({ simulate: 'refusal' }), ctx);
    expect(result).toMatchObject({ kind: 'refused' });
  });

  it('throws a temporary error for simulate: temporary_failure', async () => {
    const ctx = await ctxWith();
    await expect(
      mockProvider.submit('m', baseRequest({ simulate: 'temporary_failure' }), ctx),
    ).rejects.toBeInstanceOf(ProviderTemporaryError);
  });

  it('throws a permanent error for simulate: permanent_failure', async () => {
    const ctx = await ctxWith();
    await expect(
      mockProvider.submit('m', baseRequest({ simulate: 'permanent_failure' }), ctx),
    ).rejects.toBeInstanceOf(ProviderPermanentError);
  });

  it('throws a timeout error once the caller aborts, for simulate: timeout', async () => {
    const controller = new AbortController();
    const ctx = { ...(await ctxWith()), signal: controller.signal };
    const pending = mockProvider.submit('m', baseRequest({ simulate: 'timeout' }), ctx);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

describe('mock provider — webhook mode', () => {
  it('returns pending immediately and delivers a signed callback', async () => {
    const ctx = await ctxWith();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const result = await mockProvider.submit('mock-illustrate', baseRequest({ mode: 'webhook' }), ctx);
    expect(result.kind).toBe('pending');
    if (result.kind !== 'pending') throw new Error('expected pending');
    expect(result.pollUrl).toBe(`mock://${result.requestId}`);

    // The delivery runs in the background (delay is 0ms in tests, but still async).
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(ctx.webhookUrl);
    const headers = init?.headers as Record<string, string>;
    expect(mockProvider.verifyWebhook!(Buffer.from(init!.body as string), headers)).toBe(true);

    const parsed = mockProvider.parseWebhook!(JSON.parse(init!.body as string));
    expect(parsed.kind).toBe('completed');
    if (parsed.kind === 'completed') expect(parsed.requestId).toBe(result.requestId);

    fetchSpy.mockRestore();
  });

  it('fetchResult reads back a completed result by pollUrl', async () => {
    const ctx = await ctxWith();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const result = await mockProvider.submit('mock-illustrate', baseRequest({ mode: 'webhook' }), ctx);
    if (result.kind !== 'pending') throw new Error('expected pending');
    await vi.waitFor(async () => {
      const images = await mockProvider.fetchResult!(result.pollUrl, ctx.signal);
      expect(images.length).toBeGreaterThan(0);
    });
    vi.restoreAllMocks();
  });

  it('fetchResult throws temporary while no result has arrived yet', async () => {
    const ctx = await ctxWith();
    // Never resolves the background job (long delay), so no result is stored.
    process.env.MOCK_PROVIDER_DELAY_MS = '60000';
    resetConfig();
    const submitPromise = mockProvider.submit('m', baseRequest({ mode: 'webhook' }), ctx);
    const result = await submitPromise;
    if (result.kind !== 'pending') throw new Error('expected pending');
    await expect(mockProvider.fetchResult!(result.pollUrl, ctx.signal)).rejects.toBeInstanceOf(
      ProviderTemporaryError,
    );
    process.env.MOCK_PROVIDER_DELAY_MS = '0';
    resetConfig();
  });

  it('rejects a webhook with a tampered signature', () => {
    const body = Buffer.from('{"requestId":"x","status":"OK","images":[]}');
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = signCallback(body, WEBHOOK_SECRET, timestamp);
    expect(
      mockProvider.verifyWebhook!(body, {
        'x-callback-signature': sig,
        'x-callback-timestamp': String(timestamp),
      }),
    ).toBe(true);
    expect(
      mockProvider.verifyWebhook!(Buffer.from('{"requestId":"y"}'), {
        'x-callback-signature': sig,
        'x-callback-timestamp': String(timestamp),
      }),
    ).toBe(false);
  });
});
