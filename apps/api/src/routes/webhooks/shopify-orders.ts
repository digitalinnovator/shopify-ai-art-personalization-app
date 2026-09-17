import { config } from '@aiart/core/config';
import { enqueueOrder } from '@aiart/core/queue';
import { SHOPIFY_WEBHOOK_HEADERS, verifyShopifyWebhook } from '@aiart/core/security';
import {
  getShopByDomain,
  type OrderTopic,
  recordOrderEvent,
  type ShopifyOrderPayload,
} from '@aiart/core/services';
import type { FastifyInstance } from 'fastify';
import { parseRawJson } from '../../plugins/webhooks-raw-body';

export async function shopifyOrdersRoutes(app: FastifyInstance): Promise<void> {
  app.post('/shopify/orders', async (request, reply) => {
    const raw = request.body as Buffer;
    const hmac = request.headers[SHOPIFY_WEBHOOK_HEADERS.hmac] as string | undefined;
    if (!verifyShopifyWebhook(raw, hmac, config('shopify').SHOPIFY_API_SECRET)) {
      return reply
        .status(401)
        .send({ error: { code: 'invalid_hmac', message: 'Webhook signature verification failed' } });
    }

    const shopDomain = request.headers[SHOPIFY_WEBHOOK_HEADERS.shopDomain] as string | undefined;
    const topic = request.headers[SHOPIFY_WEBHOOK_HEADERS.topic] as OrderTopic | undefined;
    const webhookId = request.headers[SHOPIFY_WEBHOOK_HEADERS.webhookId] as string | undefined;
    const triggeredAtHeader = request.headers[SHOPIFY_WEBHOOK_HEADERS.triggeredAt] as string | undefined;
    if (!shopDomain || !topic || !webhookId) {
      return reply
        .status(400)
        .send({ error: { code: 'missing_headers', message: 'Missing required Shopify webhook headers' } });
    }

    const shop = await getShopByDomain(shopDomain);
    if (!shop) {
      // Not our concern to retry — nothing to process for a shop we don't know.
      request.log.warn({ shopDomain }, 'order webhook for unknown shop');
      return reply.status(200).send({ ok: true });
    }

    const payload = parseRawJson(raw) as ShopifyOrderPayload;
    const { orderEventId, duplicate } = await recordOrderEvent({
      shopId: shop.id,
      webhookId,
      topic,
      triggeredAt: triggeredAtHeader ? new Date(triggeredAtHeader) : undefined,
      payload,
    });
    if (!duplicate) await enqueueOrder(orderEventId);

    return reply.status(200).send({ ok: true });
  });
}
