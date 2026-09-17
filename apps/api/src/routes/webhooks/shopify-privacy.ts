import { config } from '@aiart/core/config';
import { SHOPIFY_WEBHOOK_HEADERS, verifyShopifyWebhook } from '@aiart/core/security';
import {
  getShopByDomain,
  handleCustomerRedact,
  handleShopRedact,
  type PrivacyTopic,
  recordPrivacyRequest,
} from '@aiart/core/services';
import type { FastifyInstance } from 'fastify';
import { parseRawJson } from '../../plugins/webhooks-raw-body';

interface PrivacyPayload {
  shop_id?: number | string;
  shop_domain?: string;
  customer?: { id?: number | string; email?: string };
}

export async function shopifyPrivacyRoutes(app: FastifyInstance): Promise<void> {
  app.post('/shopify/privacy', async (request, reply) => {
    const raw = request.body as Buffer;
    const hmac = request.headers[SHOPIFY_WEBHOOK_HEADERS.hmac] as string | undefined;
    if (!verifyShopifyWebhook(raw, hmac, config('shopify').SHOPIFY_API_SECRET)) {
      return reply
        .status(401)
        .send({ error: { code: 'invalid_hmac', message: 'Webhook signature verification failed' } });
    }

    const shopDomain = (request.headers[SHOPIFY_WEBHOOK_HEADERS.shopDomain] as string | undefined) ?? '';
    const topic = request.headers[SHOPIFY_WEBHOOK_HEADERS.topic] as PrivacyTopic | undefined;
    if (!topic) {
      return reply
        .status(400)
        .send({ error: { code: 'missing_headers', message: 'Missing X-Shopify-Topic' } });
    }

    const payload = parseRawJson(raw) as PrivacyPayload;
    const domain = shopDomain || payload.shop_domain || '';
    const shop = await getShopByDomain(domain);
    const customerId = payload.customer?.id ? String(payload.customer.id) : undefined;

    const requestId = await recordPrivacyRequest({
      shopDomain: domain,
      shopId: shop?.id,
      topic,
      customerId,
      payload,
    });

    // These complete within Shopify's 30-day requirement, but there is no reason to make the
    // customer or the merchant wait — a single shop's or customer's data is small.
    if (topic === 'customers/redact' && shop && customerId) {
      await handleCustomerRedact(requestId, shop.id, customerId);
    } else if (topic === 'shop/redact') {
      await handleShopRedact(requestId, domain);
    }
    // customers/data_request: recorded above for the admin's Privacy requests screen; Shopify's
    // webhook does not carry anywhere to send compiled data back to.

    return reply.status(200).send({ ok: true });
  });
}
