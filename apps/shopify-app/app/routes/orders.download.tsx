import { getOrder, listOrderItems } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { requireShop } from '../lib/auth.server';

/** Resource route: signs a short-lived link on demand instead of storing one — see storage/index.ts. */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const order = await getOrder(shop.id, params.orderId!);
  if (!order) throw new Response('Order not found', { status: 404 });
  const items = await listOrderItems(order.id);
  const item = items.find((i) => i.lineItemId === params.lineItemId);
  if (!item?.finalKey) throw new Response('File not available', { status: 404 });
  const url = await presignDownload(item.finalKey, {
    expiresSeconds: 120,
    stableForSeconds: 5,
    downloadName: `${order.orderName ?? order.shopifyOrderId}-${item.lineItemId}.png`,
  });
  return redirect(url);
}
