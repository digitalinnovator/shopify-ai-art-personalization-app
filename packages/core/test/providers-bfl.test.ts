import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '../src/config';
import type { ProviderContext } from '../src/providers/types';
import { ProviderPermanentError, ProviderTemporaryError } from '../src/providers/types';
import type { GenerationRequest } from '../src/templates';

const request: GenerationRequest = {
  prompt: 'Turn the first image into a storybook knight.',
  images: [],
  output: { aspectRatio: '4:5', longEdge: 1600 },
  seed: 11,
  settings: {},
};

function context(): ProviderContext {
  return {
    images: [
      { role: 'subject', bytes: Buffer.from('photo'), contentType: 'image/jpeg' },
      { role: 'scene', bytes: Buffer.from('scene'), contentType: 'image/png' },
    ],
    webhookUrl: 'https://example.test/webhooks/ai/bfl',
    signal: new AbortController().signal,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.BFL_API_KEY = 'test-bfl-key';
  delete process.env.BFL_WEBHOOK_SECRET;
  resetConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BFL_API_KEY;
  delete process.env.BFL_WEBHOOK_SECRET;
  resetConfig();
});

describe('bfl adapter', () => {
  it('is only registered when BFL_API_KEY is configured', async () => {
    const { bflConfigured } = await import('../src/providers/live/bfl');
    expect(bflConfigured()).toBe(true);
    delete process.env.BFL_API_KEY;
    resetConfig();
    expect(bflConfigured()).toBe(false);
  });

  it('submits a FLUX.2 request with pixel sizes and numbered input images, then reports pending', async () => {
    const { bflProvider } = await import('../src/providers/live/bfl');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: 'req-1', polling_url: 'https://api.bfl.ai/v1/get_result?id=req-1' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await bflProvider.submit('flux-2-pro', request, context());
    expect(result).toEqual({
      kind: 'pending',
      requestId: 'req-1',
      pollUrl: 'https://api.bfl.ai/v1/get_result?id=req-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.bfl.ai/v1/flux-2-pro');
    expect((init.headers as Record<string, string>)['x-key']).toBe('test-bfl-key');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.prompt).toBe(request.prompt);
    expect(body.seed).toBe(11);
    expect(body.safety_tolerance).toBe(2);
    expect(body.input_image).toBe(Buffer.from('photo').toString('base64'));
    expect(body.input_image_2).toBe(Buffer.from('scene').toString('base64'));
    expect(body.height).toBe(1600);
    expect(body.width).toBe(1280);
    expect(body.aspect_ratio).toBeUndefined();
    expect(body.webhook_url).toBeUndefined();
  });

  it('uses an aspect ratio and a single image for Kontext, and adds the webhook when a secret is set', async () => {
    process.env.BFL_WEBHOOK_SECRET = 'hook-secret';
    resetConfig();
    const { buildBody } = await import('../src/providers/live/bfl');
    const body = buildBody('flux-kontext-pro', { ...request, settings: { safety_tolerance: 4 } }, context());
    expect(body.aspect_ratio).toBe('4:5');
    expect(body.width).toBeUndefined();
    expect(body.input_image).toBeDefined();
    expect(body.input_image_2).toBeUndefined();
    expect(body.safety_tolerance).toBe(4);
    expect(body.webhook_url).toBe('https://example.test/webhooks/ai/bfl');
    expect(body.webhook_secret).toBe('hook-secret');
  });

  it('downloads the sample once the poll says Ready, and classifies the other statuses', async () => {
    const { bflProvider } = await import('../src/providers/live/bfl');
    const signal = new AbortController().signal;
    const pollUrl = 'https://api.bfl.ai/v1/get_result?id=req-1';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === pollUrl)
          return jsonResponse({
            id: 'req-1',
            status: 'Ready',
            result: { sample: 'https://delivery.bfl.ai/x.png' },
          });
        return new Response(Buffer.from('png-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }),
    );
    const images = await bflProvider.fetchResult?.(pollUrl, signal);
    expect(images?.[0]?.bytes.toString()).toBe('png-bytes');
    expect(images?.[0]?.contentType).toBe('image/png');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'req-1', status: 'Pending' })),
    );
    await expect(bflProvider.fetchResult?.(pollUrl, signal)).rejects.toBeInstanceOf(ProviderTemporaryError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: 'req-1', status: 'Content Moderated' })),
    );
    await expect(bflProvider.fetchResult?.(pollUrl, signal)).rejects.toBeInstanceOf(ProviderPermanentError);
  });

  it('verifies webhooks by comparing the echoed secret, and parses Ready as completed', async () => {
    process.env.BFL_WEBHOOK_SECRET = 'hook-secret';
    resetConfig();
    const { bflProvider } = await import('../src/providers/live/bfl');
    const raw = Buffer.from(JSON.stringify({ id: 'req-1', status: 'Ready' }));
    expect(await bflProvider.verifyWebhook?.(raw, { 'x-webhook-secret': 'hook-secret' })).toBe(true);
    expect(await bflProvider.verifyWebhook?.(raw, { 'x-webhook-secret': 'wrong' })).toBe(false);
    expect(await bflProvider.verifyWebhook?.(raw, {})).toBe(false);
    expect(bflProvider.parseWebhook?.({ id: 'req-1', status: 'Ready' })).toEqual({
      kind: 'completed',
      requestId: 'req-1',
      images: [],
    });
    expect(bflProvider.parseWebhook?.({ id: 'req-1', status: 'Error' }).kind).toBe('failed');
  });
});
