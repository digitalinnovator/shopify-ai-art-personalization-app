import { getProvider } from '@aiart/core/providers';
import { enqueueFinalize } from '@aiart/core/queue';
import { findSubmittedPreview } from '@aiart/core/services';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { flattenHeaders } from '../../lib/headers';
import { parseRawJson } from '../../plugins/webhooks-raw-body';

const ParamsSchema = z.object({ provider: z.string().min(1) });

/**
 * One route for every provider. Each adapter verifies and parses its own payload shape; this
 * route only does the plumbing: verify, look up the preview the request id belongs to, and wake
 * up `finalize` — which is the single place that ever fetches image bytes (from the poll URL
 * captured at submit time, never from anything in this request body).
 */
export const aiProviderWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/ai/:provider', { schema: { params: ParamsSchema } }, async (request, reply) => {
    const provider = getProvider(request.params.provider);
    if (!provider?.supportsWebhook || !provider.verifyWebhook || !provider.parseWebhook) {
      return reply
        .status(404)
        .send({ error: { code: 'unknown_provider', message: 'Unknown or unsupported provider' } });
    }

    const raw = request.body as Buffer;
    // `await` unconditionally: most adapters verify synchronously, but fal's needs an async JWKS
    // fetch — awaiting a plain boolean is a no-op, so this is safe for every provider.
    const verified = await provider.verifyWebhook(raw, flattenHeaders(request.headers));
    if (!verified) {
      return reply
        .status(401)
        .send({ error: { code: 'invalid_signature', message: 'Webhook signature verification failed' } });
    }

    const parsed = provider.parseWebhook(parseRawJson(raw));
    const preview = await findSubmittedPreview(provider.id, parsed.requestId);
    if (preview) await enqueueFinalize(preview.id);

    // Always 200: an unknown or stale request id (a very late redelivery, a previous round) is
    // not something the sender should retry over.
    return reply.status(200).send({ ok: true });
  });
};
