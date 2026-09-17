import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfig } from '../src/config';
import type { ProviderContext } from '../src/providers/types';
import { ProviderPermanentError, ProviderTemporaryError } from '../src/providers/types';
import type { GenerationRequest } from '../src/templates';

const request: GenerationRequest = {
  prompt: 'Repaint the first image as a watercolor portrait.',
  images: [],
  output: { aspectRatio: '4:5', longEdge: 1600 },
  seed: 7,
  settings: {},
};

function context(): ProviderContext {
  return {
    images: [
      { role: 'subject', bytes: Buffer.from('photo'), contentType: 'image/jpeg' },
      { role: 'style', bytes: Buffer.from('style'), contentType: 'image/png' },
    ],
    webhookUrl: 'https://example.test/webhooks/ai/openai',
    signal: new AbortController().signal,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  resetConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  resetConfig();
});

describe('openai adapter', () => {
  it('is only registered when OPENAI_API_KEY is configured', async () => {
    const { openaiConfigured } = await import('../src/providers/live/openai');
    expect(openaiConfigured()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    resetConfig();
    expect(openaiConfigured()).toBe(false);
  });

  it('sends a multipart edit with the customer photo first and returns the decoded image', async () => {
    const { openaiProvider } = await import('../src/providers/live/openai');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await openaiProvider.submit('gpt-image-2', request, context());
    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') throw new Error('expected completed');
    expect(result.images[0]?.bytes.toString()).toBe('png-bytes');
    expect(result.images[0]?.contentType).toBe('image/png');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-openai-key');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-image-2');
    expect(form.get('prompt')).toBe(request.prompt);
    expect(form.get('size')).toBe('1024x1536');
    expect(form.get('quality')).toBe('medium');
    expect(form.get('input_fidelity')).toBeNull();
    const files = form.getAll('image[]') as File[];
    expect(files).toHaveLength(2);
    expect(files[0]?.name).toBe('subject.jpg');
    expect(files[1]?.name).toBe('style.png');
  });

  it('passes quality from the slot settings and input_fidelity for the 1.x models', async () => {
    const { buildForm } = await import('../src/providers/live/openai');
    const form = buildForm('gpt-image-1.5', { ...request, settings: { quality: 'high' } }, context());
    expect(form.get('quality')).toBe('high');
    expect(form.get('input_fidelity')).toBe('high');
  });

  it('turns a content filter block into a refusal, not an error', async () => {
    const { openaiProvider } = await import('../src/providers/live/openai');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.' },
          },
          400,
        ),
      ),
    );
    const result = await openaiProvider.submit('gpt-image-2', request, context());
    expect(result.kind).toBe('refused');
  });

  it('maps authentication failures to permanent errors and rate limits to temporary ones', async () => {
    const { openaiProvider } = await import('../src/providers/live/openai');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401)),
    );
    await expect(openaiProvider.submit('gpt-image-2', request, context())).rejects.toBeInstanceOf(
      ProviderPermanentError,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'slow down' } }, 429)),
    );
    await expect(openaiProvider.submit('gpt-image-2', request, context())).rejects.toBeInstanceOf(
      ProviderTemporaryError,
    );
  });
});
