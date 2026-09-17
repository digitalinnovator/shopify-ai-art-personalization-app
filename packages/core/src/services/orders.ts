import type { ShopSettings } from '@aiart/contracts';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  type Order,
  orderEvents,
  orderItems,
  orders,
  previews,
  selections,
  shops,
  webhookEvents,
} from '../db';
import { hashToken } from '../security';
import { copyObject, storageKeys } from '../storage';

export interface ShopifyOrderLineItem {
  id: number | string;
  title?: string;
  /** Copies of this line ordered; Shopify always sends it, the fallback is for older payloads. */
  quantity?: number;
  properties?: { name: string; value: string }[];
}

function lineQuantity(item: ShopifyOrderLineItem): number {
  const n = Math.floor(Number(item.quantity));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
export interface ShopifyOrderPayload {
  id: number | string;
  name?: string;
  financial_status?: string;
  email?: string;
  customer?: { id?: number | string; email?: string };
  line_items?: ShopifyOrderLineItem[];
}

export type OrderTopic = 'orders/create' | 'orders/paid' | 'orders/cancelled' | (string & {});

function findSelectionProperty(item: ShopifyOrderLineItem): string | undefined {
  return item.properties?.find((p) => p.name === '_ai_selection')?.value;
}

export interface RecordOrderEventInput {
  shopId: string;
  webhookId: string;
  topic: OrderTopic;
  triggeredAt?: Date;
  payload: ShopifyOrderPayload;
}

/**
 * Stores one Shopify order webhook delivery. Each topic (create/paid/cancelled) for the same
 * order is recorded and processed as its own event, because they can carry different
 * information (e.g. financial_status only appears once payment settles).
 */
export async function recordOrderEvent(
  input: RecordOrderEventInput,
): Promise<{ orderEventId: string; duplicate: boolean }> {
  const inserted = await db()
    .insert(webhookEvents)
    .values({ source: 'shopify', externalId: input.webhookId, topic: input.topic })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return { orderEventId: '', duplicate: true };

  const shopifyOrderId = String(input.payload.id);
  const orderEventId = await db().transaction(async (tx) => {
    await tx
      .insert(orders)
      .values({
        shopId: input.shopId,
        shopifyOrderId,
        orderName: input.payload.name,
        customerId: input.payload.customer?.id ? String(input.payload.customer.id) : undefined,
        customerEmail: input.payload.customer?.email ?? input.payload.email,
        financialStatus: input.payload.financial_status,
        status: 'received',
      })
      .onConflictDoUpdate({
        target: [orders.shopId, orders.shopifyOrderId],
        set: { financialStatus: input.payload.financial_status, updatedAt: new Date() },
      });
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.shopId, input.shopId), eq(orders.shopifyOrderId, shopifyOrderId)));

    for (const item of input.payload.line_items ?? []) {
      const token = findSelectionProperty(item);
      if (!token) continue;
      await tx
        .insert(orderItems)
        .values({
          orderId: order!.id,
          lineItemId: String(item.id),
          title: item.title,
          quantity: lineQuantity(item),
          tokenHash: hashToken(token),
          status: 'pending',
        })
        .onConflictDoNothing({ target: [orderItems.orderId, orderItems.lineItemId] });
    }

    const [event] = await tx
      .insert(orderEvents)
      .values({
        orderId: order!.id,
        topic: input.topic,
        webhookId: input.webhookId,
        triggeredAt: input.triggeredAt,
        payload: input.payload,
      })
      .returning({ id: orderEvents.id });
    return event!.id;
  });

  return { orderEventId, duplicate: false };
}

function shouldRelease(
  topic: OrderTopic,
  financialStatus: string | undefined,
  trigger: ShopSettings['releaseTrigger'],
): boolean {
  if (topic === trigger) return true;
  return trigger === 'orders/paid' && financialStatus === 'paid';
}

/** Processes one recorded order event: matches selections, releases files, or revokes on cancel. */
export async function processOrderEvent(orderEventId: string): Promise<void> {
  const [event] = await db().select().from(orderEvents).where(eq(orderEvents.id, orderEventId));
  if (!event) return;
  const [order] = await db().select().from(orders).where(eq(orders.id, event.orderId));
  if (!order) return;
  const [shop] = await db()
    .select({ settings: shops.settings })
    .from(shops)
    .where(eq(shops.id, order.shopId));
  const releaseTrigger = shop?.settings.releaseTrigger ?? 'orders/paid';

  await db()
    .update(orders)
    .set({ attempts: order.attempts + 1, status: 'processing' })
    .where(eq(orders.id, order.id));

  if (event.topic === 'orders/cancelled') {
    await cancelOrder(order);
  } else {
    const payload = event.payload as ShopifyOrderPayload;
    await processLineItems(order, releaseTrigger, event.topic, payload.financial_status);
  }

  await db().update(orderEvents).set({ processedAt: new Date() }).where(eq(orderEvents.id, event.id));
  await recomputeOrderStatus(order.id);
}

async function processLineItems(
  order: Order,
  releaseTrigger: ShopSettings['releaseTrigger'],
  topic: OrderTopic,
  financialStatus: string | undefined,
): Promise<void> {
  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  for (const item of items) {
    if (item.status === 'released' || item.status === 'revoked') continue;

    const [selection] = await db().select().from(selections).where(eq(selections.tokenHash, item.tokenHash));
    if (!selection) {
      await db()
        .update(orderItems)
        .set({ status: 'needs_attention', error: 'No matching selection for this order item' })
        .where(eq(orderItems.id, item.id));
      continue;
    }

    if (selection.status === 'selected') {
      await db()
        .update(selections)
        .set({ status: 'ordered', orderedAt: new Date() })
        .where(eq(selections.id, selection.id));
    }
    await db()
      .update(orderItems)
      .set({ selectionId: selection.id, status: 'pending', error: null })
      .where(eq(orderItems.id, item.id));

    if (!shouldRelease(topic, financialStatus, releaseTrigger)) continue;

    const [preview] = await db().select().from(previews).where(eq(previews.id, selection.previewId));
    if (!preview?.originalKey) {
      await db()
        .update(orderItems)
        .set({ status: 'needs_attention', error: 'Selected preview has no stored original file' })
        .where(eq(orderItems.id, item.id));
      continue;
    }

    const ext = preview.originalKey.split('.').pop() ?? 'png';
    const finalKey = storageKeys.final(order.shopId, order.id, item.lineItemId, ext);
    await copyObject(preview.originalKey, finalKey);
    const releasedAt = new Date();
    await db()
      .update(orderItems)
      .set({ status: 'released', finalKey, releasedAt, error: null })
      .where(eq(orderItems.id, item.id));
    await db()
      .update(selections)
      .set({ status: 'released', releasedAt })
      .where(eq(selections.id, selection.id));
  }
}

async function cancelOrder(order: Order): Promise<void> {
  await db()
    .update(orders)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(orders.id, order.id));
  const items = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  for (const item of items) {
    if (item.status === 'released') continue; // a delivered/released file is not clawed back automatically
    await db().update(orderItems).set({ status: 'revoked' }).where(eq(orderItems.id, item.id));
  }
}

async function recomputeOrderStatus(orderId: string): Promise<void> {
  const [order] = await db().select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status === 'cancelled') return;
  const items = await db()
    .select({ status: orderItems.status })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  let next: Order['status'] = 'processing';
  if (items.length > 0) {
    if (items.some((i) => i.status === 'needs_attention')) next = 'needs_attention';
    else if (items.every((i) => i.status === 'released' || i.status === 'revoked')) next = 'released';
  }
  if (next !== order.status) await db().update(orders).set({ status: next }).where(eq(orders.id, orderId));
}

export async function listOrders(shopId: string, limit = 100): Promise<Order[]> {
  return db()
    .select()
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function getOrder(shopId: string, orderId: string): Promise<Order | undefined> {
  const [row] = await db()
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.shopId, shopId)));
  return row;
}

export async function listOrderItems(orderId: string) {
  return db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function retryOrder(orderId: string): Promise<void> {
  await db()
    .update(orderItems)
    .set({ status: 'pending', error: null })
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, 'needs_attention')));
  const [latest] = await db()
    .select({ id: orderEvents.id })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt);
  if (latest) await processOrderEvent(latest.id);
}

export async function markDelivered(orderId: string, lineItemId: string): Promise<void> {
  await db().transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.lineItemId, lineItemId)));
    if (!item?.selectionId) return;
    await tx
      .update(selections)
      .set({ status: 'delivered', deliveredAt: new Date() })
      .where(eq(selections.id, item.selectionId));
  });
}

// ---------------------------------------------------------------- admin list helpers

import { inArray } from 'drizzle-orm';
import type { OrderEvent, OrderItem } from '../db';

export interface OrderSummary extends Order {
  itemCount: number;
  attentionCount: number;
}

export async function listOrdersWithCounts(shopId: string, limit = 100): Promise<OrderSummary[]> {
  const rows = await db()
    .select()
    .from(orders)
    .where(eq(orders.shopId, shopId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const items = await db()
    .select({ orderId: orderItems.orderId, status: orderItems.status })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    );
  const counts = new Map<string, { itemCount: number; attentionCount: number }>();
  for (const item of items) {
    const c = counts.get(item.orderId) ?? { itemCount: 0, attentionCount: 0 };
    c.itemCount += 1;
    if (item.status === 'needs_attention') c.attentionCount += 1;
    counts.set(item.orderId, c);
  }
  return rows.map((order) => ({
    ...order,
    ...(counts.get(order.id) ?? { itemCount: 0, attentionCount: 0 }),
  }));
}

export interface OrderItemWithPreview extends OrderItem {
  previewKey: string | null;
  originalKey: string | null;
  slot: string | null;
  jobId: string | null;
  selectionStatus: string | null;
}

/** Order items joined to the preview the customer chose, for thumbnails on the order screen. */
export async function listOrderItemsWithPreviews(orderId: string): Promise<OrderItemWithPreview[]> {
  const rows = await db()
    .select({
      item: orderItems,
      previewKey: previews.previewKey,
      originalKey: previews.originalKey,
      slot: previews.slot,
      jobId: previews.jobId,
      selectionStatus: selections.status,
    })
    .from(orderItems)
    .leftJoin(selections, eq(selections.id, orderItems.selectionId))
    .leftJoin(previews, eq(previews.id, selections.previewId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.createdAt);
  return rows.map((r) => ({
    ...r.item,
    previewKey: r.previewKey ?? null,
    originalKey: r.originalKey ?? null,
    slot: r.slot ?? null,
    jobId: r.jobId ?? null,
    selectionStatus: r.selectionStatus ?? null,
  }));
}

export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return db()
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt);
}
