import { type DesignConfig, PROXY_PREFIX } from '@aiart/contracts';
import { config, loadEnv } from '@aiart/core/config';
import { buildSignedProxyQuery, signShopifyWebhook } from '@aiart/core/security';
import { getLiveVersion, getShopByDomain, listDesigns } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { Connect, Plugin } from 'vite';

/** Print sizes offered by the demo products; on Shopify these are the product's variants. */
const SIZES = ['8 x 10 in', '12 x 16 in', '18 x 24 in'];

const DESCRIPTIONS: Record<string, string> = {
  face_into_scene:
    'Upload a photo and we place you in this illustrated scene, keeping your likeness. Printed on museum grade matte paper with archival inks.',
  style_transfer:
    'Your photo, repainted in this signature style. Printed on museum grade matte paper with archival inks.',
};

/** One in-memory "cart" per dev server process — enough to demo add-to-cart and simulated orders. */
interface CartItem {
  id: number;
  quantity: number;
  properties: Record<string, string>;
}
const cart: CartItem[] = [];

async function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Everything a real Shopify storefront would do around our app that we can't run locally:
 *  - the app proxy (signs and forwards `/apps/ai-art/*` to the API's `/proxy/*`, strips cookies)
 *  - `/cart/add.js` and `/cart.js`
 *  - "Simulate order / paid / cancelled" buttons that send a real, HMAC-signed webhook
 *  - `/harness/designs`, so the test page can find real design ids without hardcoding them
 */
export function storefrontHarnessPlugin(): Plugin {
  return {
    name: 'aiart-storefront-harness',
    configureServer(server) {
      loadEnv();

      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        if (req.url === '/harness/designs' && req.method === 'GET') {
          const shop = await getShopByDomain(config('shopify').DEV_SHOP_DOMAIN);
          if (!shop) return sendJson(res, 200, []);
          const designs = (await listDesigns(shop.id)).filter((d) => d.status === 'live');
          const products = await Promise.all(
            designs.map(async (d, i) => {
              const version = await getLiveVersion(shop.id, d.id);
              const designConfig = version?.config as DesignConfig | undefined;
              const exampleKeys = designConfig?.exampleImages.slice(0, 4) ?? [];
              const exampleImageUrls = await Promise.all(
                exampleKeys.map((key) =>
                  presignDownload(key, { expiresSeconds: 3600, stableForSeconds: 900 }),
                ),
              );
              const variants = SIZES.map((title, n) => ({ id: (1001 + i) * 10 + n + 1, title }));
              return {
                id: d.id,
                name: d.name,
                slug: d.slug,
                type: d.type,
                variantId: variants[0]?.id,
                variants,
                price: '49.00',
                description: DESCRIPTIONS[d.type] ?? '',
                exampleImageUrl: exampleImageUrls[0] ?? null,
                exampleImageUrls,
              };
            }),
          );
          return sendJson(res, 200, products);
        }

        if (req.url === '/cart/add.js' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          const items: CartItem[] = body.items ?? [];
          cart.push(...items);
          return sendJson(res, 200, { items });
        }

        if (req.url === '/cart.js' && req.method === 'GET') {
          const itemCount = cart.reduce((n, item) => n + (Number(item.quantity) || 1), 0);
          return sendJson(res, 200, { items: cart, item_count: itemCount });
        }

        if (req.url === '/harness/simulate-order' && req.method === 'POST') {
          const { topic } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          const shopify = config('shopify');
          const api = config('api');
          const lineItems = cart.map((item, i) => ({
            id: `sim-line-${i}`,
            title: 'Personalized Art',
            variant_id: item.id,
            quantity: Number(item.quantity) || 1,
            properties: Object.entries(item.properties ?? {}).map(([name, value]) => ({ name, value })),
          }));
          const payload = {
            id: `sim-order-${Date.now()}`,
            name: '#SIM1001',
            financial_status: topic === 'orders/paid' ? 'paid' : 'pending',
            customer: { id: 'sim-customer-1', email: 'shopper@example.com' },
            line_items: lineItems,
          };
          const raw = JSON.stringify(payload);
          const upstream = await fetch(`${api.API_PUBLIC_URL}/webhooks/shopify/orders`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-shopify-hmac-sha256': signShopifyWebhook(raw, shopify.SHOPIFY_API_SECRET),
              'x-shopify-topic': topic,
              'x-shopify-shop-domain': shopify.DEV_SHOP_DOMAIN,
              'x-shopify-webhook-id': `sim-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
              'x-shopify-triggered-at': new Date().toISOString(),
            },
            body: raw,
          });
          res.statusCode = upstream.status;
          res.setHeader('content-type', 'application/json');
          return res.end(await upstream.text());
        }

        if (!req.url.startsWith(PROXY_PREFIX)) return next();

        // --- The app proxy itself ---
        const shopify = config('shopify');
        const api = config('api');
        const [pathPart, queryPart] = req.url.split('?');
        const subpath = pathPart!.slice(PROXY_PREFIX.length);
        const signedQuery = buildSignedProxyQuery(new URLSearchParams(queryPart ?? ''), {
          shop: shopify.DEV_SHOP_DOMAIN,
          secret: shopify.SHOPIFY_API_SECRET,
          pathPrefix: PROXY_PREFIX,
          loggedInCustomerId: '',
        });
        const targetUrl = `${api.API_PUBLIC_URL}/proxy${subpath}?${signedQuery.toString()}`;

        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
        const headers = new Headers();
        const contentType = req.headers['content-type'];
        if (contentType) headers.set('content-type', contentType);
        // Real Shopify forwards the shopper's IP this way; cookies never leave the storefront's
        // own domain through the real app proxy, so none are forwarded here either.
        headers.set(api.CLIENT_IP_HEADER, '203.0.113.42');

        try {
          const bodyBytes = body && body.length > 0 ? new Uint8Array(body) : undefined;
          const upstream = await fetch(targetUrl, { method: req.method, headers, body: bodyBytes });
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key === 'content-encoding' || key === 'transfer-encoding' || key === 'content-length') return;
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch {
          sendJson(res, 502, {
            error: {
              code: 'proxy_unreachable',
              message: 'Could not reach the API. Run `pnpm --filter @aiart/api dev` in another terminal.',
            },
          });
        }
      });
    },
  };
}
