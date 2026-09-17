import { generateKeyPairSync, sign as signEd25519 } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '../src/config';
import { sha256Hex } from '../src/security';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };

function signMessage(requestId: string, userId: string, timestamp: string, body: string): string {
  const message = Buffer.from([requestId, userId, timestamp, sha256Hex(body)].join('\n'));
  return signEd25519(null, message, privateKey).toString('hex');
}

beforeEach(() => {
  process.env.FAL_KEY = 'test-fal-key';
  resetConfig();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === 'https://rest.fal.ai/.well-known/jwks.json') {
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      }
      throw new Error(`unexpected fetch to ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FAL_KEY;
  resetConfig();
});

describe('fal adapter', () => {
  it('is only registered when FAL_KEY is configured', async () => {
    const { falConfigured } = await import('../src/providers/live/fal');
    expect(falConfigured()).toBe(true);
    delete process.env.FAL_KEY;
    resetConfig();
    expect(falConfigured()).toBe(false);
  });

  it('builds image_urls from publicUrl when available, falling back to a data URI', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    const submitMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ request_id: 'r1', response_url: 'https://queue.fal.run/x/requests/r1' }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', submitMock);

    await falProvider.submit(
      'fal-ai/flux-2-pro/edit',
      { prompt: 'p', images: [], output: { aspectRatio: '1:1', longEdge: 512 }, settings: {} },
      {
        images: [
          {
            role: 'subject',
            bytes: Buffer.from('abc'),
            contentType: 'image/jpeg',
            publicUrl: 'https://example.com/photo.jpg',
          },
          { role: 'scene', bytes: Buffer.from('xyz'), contentType: 'image/png' },
        ],
        webhookUrl: 'https://api.example.com/webhooks/ai/fal',
        signal: new AbortController().signal,
      },
    );

    const [url, init] = submitMock.mock.calls[0]!;
    expect(url).toContain('fal-ai/flux-2-pro/edit');
    expect(url).toContain(encodeURIComponent('https://api.example.com/webhooks/ai/fal'));
    const body = JSON.parse(init!.body as string);
    expect(body.image_urls[0]).toBe('https://example.com/photo.jpg');
    expect(body.image_urls[1]).toBe(`data:image/png;base64,${Buffer.from('xyz').toString('base64')}`);
  });

  it('returns pending with the response_url as the poll URL', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              request_id: 'req-123',
              response_url: 'https://queue.fal.run/m/requests/req-123',
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await falProvider.submit(
      'm',
      { prompt: 'p', images: [], output: { aspectRatio: '1:1', longEdge: 512 }, settings: {} },
      {
        images: [],
        webhookUrl: 'https://api.example.com/webhooks/ai/fal',
        signal: new AbortController().signal,
      },
    );
    expect(result).toEqual({
      kind: 'pending',
      requestId: 'req-123',
      pollUrl: 'https://queue.fal.run/m/requests/req-123',
    });
  });

  it('verifies a validly signed webhook against the fetched JWKS', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    const body = '{"request_id":"r1","status":"OK"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signMessage('r1', 'user-1', timestamp, body);

    const ok = await falProvider.verifyWebhook!(Buffer.from(body), {
      'x-fal-webhook-request-id': 'r1',
      'x-fal-webhook-user-id': 'user-1',
      'x-fal-webhook-timestamp': timestamp,
      'x-fal-webhook-signature': signature,
    });
    expect(ok).toBe(true);
  });

  it('rejects a tampered body, a wrong signature and a stale timestamp', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    const body = '{"request_id":"r1","status":"OK"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signMessage('r1', 'user-1', timestamp, body);
    const headers = {
      'x-fal-webhook-request-id': 'r1',
      'x-fal-webhook-user-id': 'user-1',
      'x-fal-webhook-timestamp': timestamp,
      'x-fal-webhook-signature': signature,
    };

    expect(await falProvider.verifyWebhook!(Buffer.from(`${body} `), headers)).toBe(false);
    expect(
      await falProvider.verifyWebhook!(Buffer.from(body), {
        ...headers,
        'x-fal-webhook-signature': 'ff'.repeat(64),
      }),
    ).toBe(false);

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const staleSignature = signMessage('r1', 'user-1', staleTimestamp, body);
    expect(
      await falProvider.verifyWebhook!(Buffer.from(body), {
        ...headers,
        'x-fal-webhook-timestamp': staleTimestamp,
        'x-fal-webhook-signature': staleSignature,
      }),
    ).toBe(false);
  });

  it('parses a completed and a failed webhook body', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    expect(falProvider.parseWebhook!({ request_id: 'r1', status: 'OK' })).toEqual({
      kind: 'completed',
      requestId: 'r1',
      images: [],
    });
    expect(falProvider.parseWebhook!({ request_id: 'r1', status: 'ERROR', error: 'boom' })).toEqual({
      kind: 'failed',
      requestId: 'r1',
      message: 'boom',
      temporary: false,
    });
  });

  it('fetchResult downloads every image from the result payload', async () => {
    const { falProvider } = await import('../src/providers/live/fal');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith('/requests/r1')) {
          return new Response(
            JSON.stringify({ images: [{ url: 'https://cdn.fal.ai/a.png', content_type: 'image/png' }] }),
            { status: 200 },
          );
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }),
    );
    const images = await falProvider.fetchResult!(
      'https://queue.fal.run/m/requests/r1',
      new AbortController().signal,
    );
    expect(images).toHaveLength(1);
    expect(images[0]!.bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(calls).toEqual(['https://queue.fal.run/m/requests/r1', 'https://cdn.fal.ai/a.png']);
  });
});
