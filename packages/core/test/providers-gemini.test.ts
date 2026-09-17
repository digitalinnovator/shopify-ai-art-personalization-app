import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '../src/config';
import type { ProviderContext } from '../src/providers/types';
import { ProviderPermanentError, ProviderTemporaryError } from '../src/providers/types';
import type { GenerationRequest } from '../src/templates';

const request: GenerationRequest = {
  prompt: 'Place the person from the first image into the scene.',
  images: [],
  output: { aspectRatio: '4:5', longEdge: 1600 },
  settings: {},
};

function context(): ProviderContext {
  return {
    images: [
      { role: 'subject', bytes: Buffer.from('photo'), contentType: 'image/jpeg' },
      { role: 'scene', bytes: Buffer.from('scene'), contentType: 'image/png' },
    ],
    webhookUrl: 'https://example.test/webhooks/ai/gemini',
    signal: new AbortController().signal,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  resetConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  resetConfig();
});

describe('gemini adapter', () => {
  it('is only registered when GEMINI_API_KEY is configured', async () => {
    const { geminiConfigured } = await import('../src/providers/live/gemini');
    expect(geminiConfigured()).toBe(true);
    delete process.env.GEMINI_API_KEY;
    resetConfig();
    expect(geminiConfigured()).toBe(false);
  });

  it('posts the prompt and inline images to generateContent and returns the image part', async () => {
    const { geminiProvider } = await import('../src/providers/live/gemini');
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                { text: 'Here is your image.' },
                { inlineData: { mimeType: 'image/png', data: Buffer.from('png-bytes').toString('base64') } },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await geminiProvider.submit('gemini-3.1-flash-image', request, context());
    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') throw new Error('expected completed');
    expect(result.images[0]?.bytes.toString()).toBe('png-bytes');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent',
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key');
    const body = JSON.parse(String(init.body)) as {
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: {
        responseModalities: string[];
        imageConfig: { aspectRatio: string; imageSize: string };
      };
    };
    expect(body.contents[0]?.parts[0]).toEqual({ text: request.prompt });
    expect(body.contents[0]?.parts[1]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: Buffer.from('photo').toString('base64') },
    });
    expect(body.contents[0]?.parts).toHaveLength(3);
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '4:5', imageSize: '2K' });
  });

  it('lets the slot settings override the image size', async () => {
    const { imageSizeFor } = await import('../src/providers/live/gemini');
    expect(imageSizeFor({ ...request, settings: { imageSize: '4K' } })).toBe('4K');
    expect(imageSizeFor({ ...request, output: { aspectRatio: '1:1', longEdge: 768 } })).toBe('1K');
  });

  it('turns a blocked prompt or a safety finish into a refusal', async () => {
    const { geminiProvider } = await import('../src/providers/live/gemini');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } })),
    );
    expect((await geminiProvider.submit('gemini-3-pro-image', request, context())).kind).toBe('refused');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }),
      ),
    );
    expect((await geminiProvider.submit('gemini-3-pro-image', request, context())).kind).toBe('refused');
  });

  it('maps bad requests to permanent errors and server errors to temporary ones', async () => {
    const { geminiProvider } = await import('../src/providers/live/gemini');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'unknown model' } }, 404)),
    );
    await expect(geminiProvider.submit('nope', request, context())).rejects.toBeInstanceOf(
      ProviderPermanentError,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'overloaded' } }, 503)),
    );
    await expect(geminiProvider.submit('gemini-3-pro-image', request, context())).rejects.toBeInstanceOf(
      ProviderTemporaryError,
    );
  });
});
