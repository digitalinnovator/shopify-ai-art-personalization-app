import {
  getOrder,
  listOrderEvents,
  listOrderItemsWithPreviews,
  markDelivered,
  retryOrder,
} from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { Badge, StatusBadge } from '../components/Badge';
import { Banner } from '../components/Banner';
import { Button, ButtonAnchor, ButtonLink } from '../components/Button';
import { Card, CardSection } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ConfirmButton } from '../components/Modal';
import { Page } from '../components/Page';
import { Thumbnail } from '../components/Thumbnail';
import { useActionToast } from '../components/Toast';
import { requireShop } from '../lib/auth.server';
import { formatDate, pluralize } from '../lib/format';
import { statusLabel } from '../lib/status';
import { toastData } from '../lib/toast';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const order = await getOrder(shop.id, params.orderId ?? '');
  if (!order) throw new Response('Order not found', { status: 404 });
  const [items, events] = await Promise.all([
    listOrderItemsWithPreviews(order.id),
    listOrderEvents(order.id),
  ]);
  const itemsWithThumbs = await Promise.all(
    items.map(async (item) => {
      const key = item.previewKey ?? item.originalKey;
      return {
        ...item,
        thumbUrl: key ? await presignDownload(key, { expiresSeconds: 3600, stableForSeconds: 900 }) : null,
      };
    }),
  );
  return { order, items: itemsWithThumbs, events };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const order = await getOrder(shop.id, params.orderId ?? '');
  if (!order) throw new Response('Order not found', { status: 404 });
  const form = await request.formData();
  const intent = form.get('intent');
  if (intent === 'retry') {
    await retryOrder(order.id);
    return { toast: toastData('success', 'Retry started. The order is being processed again.') };
  }
  if (intent === 'deliver') {
    await markDelivered(order.id, String(form.get('lineItemId')));
    return { toast: toastData('success', 'Marked as delivered.') };
  }
  return { toast: toastData('critical', 'Unknown action.') };
}

export default function OrderDetail() {
  const { order, items, events } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  useActionToast(actionData?.toast);
  const navigation = useNavigation();
  const retrying = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'retry';

  return (
    <Page
      backTo="/orders"
      backLabel="Orders"
      title={order.orderName ?? order.shopifyOrderId}
      titleMeta={<StatusBadge status={order.status} kind="order" />}
      subtitle={`${order.customerEmail ?? 'No email on file'}. Created ${formatDate(order.createdAt)}. ${pluralize(order.attempts, 'processing attempt')}.`}
    >
      <div className="layout-2col">
        <div className="stack">
          {order.status === 'needs_attention' ? (
            <Banner
              tone="attention"
              title="This order needs attention"
              actions={
                <Form method="post">
                  <input type="hidden" name="intent" value="retry" />
                  <Button type="submit" variant="primary" size="sm" icon="refresh" loading={retrying}>
                    Retry processing
                  </Button>
                </Form>
              }
            >
              {order.error ?? 'One or more items could not be matched to a customer selection or released.'}
            </Banner>
          ) : order.error ? (
            <Banner tone="critical">{order.error}</Banner>
          ) : null}

          <Card title="Personalized items" subtitle={pluralize(items.length, 'item')} padded={false}>
            {items.length === 0 ? (
              <EmptyState
                icon="package"
                title="No personalized items"
                text="This order has no line item with an AI selection token."
              />
            ) : (
              items.map((item) => (
                <CardSection key={item.id}>
                  <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                    <Thumbnail
                      src={item.thumbUrl}
                      alt={item.slot ? `Selected preview ${item.slot}` : 'No preview'}
                      size="md"
                    />
                    <div className="stack stack--sm" style={{ flex: 1, minWidth: 200 }}>
                      <div>
                        <strong>{item.title ?? `Line item ${item.lineItemId}`}</strong>
                        <span className="table__sub">Line item {item.lineItemId}</span>
                      </div>
                      <div className="row">
                        <StatusBadge status={item.status} kind="orderItem" />
                        {item.selectionStatus ? (
                          <StatusBadge status={item.selectionStatus} kind="selection" />
                        ) : (
                          <Badge tone="attention">No selection matched</Badge>
                        )}
                        {item.slot ? <Badge tone="neutral">Preview {item.slot}</Badge> : null}
                        {item.quantity > 1 ? <Badge tone="info">{item.quantity} copies</Badge> : null}
                      </div>
                      {item.releasedAt ? (
                        <p className="text-sm text-secondary">Released {formatDate(item.releasedAt)}</p>
                      ) : null}
                      {item.error ? <p className="text-sm text-critical">{item.error}</p> : null}
                      <div className="row">
                        {item.finalKey ? (
                          <ButtonAnchor
                            href={`/orders/${order.id}/download/${item.lineItemId}`}
                            target="_blank"
                            rel="noreferrer"
                            icon="download"
                            size="sm"
                          >
                            Download final artwork
                          </ButtonAnchor>
                        ) : null}
                        {item.status === 'released' && item.selectionStatus !== 'delivered' ? (
                          <ConfirmButton
                            title="Mark as delivered?"
                            message="Use this once the artwork has been sent to the customer or handed to the print partner."
                            confirmLabel="Mark delivered"
                            fields={{ intent: 'deliver', lineItemId: item.lineItemId }}
                            size="sm"
                            icon="check"
                          >
                            Mark delivered
                          </ConfirmButton>
                        ) : null}
                        {item.jobId ? (
                          <ButtonLink
                            to={`/generations/${item.jobId}`}
                            variant="plain"
                            size="sm"
                            iconRight="arrow-right"
                          >
                            View generation
                          </ButtonLink>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardSection>
              ))
            )}
          </Card>
        </div>

        <aside className="stack layout-2col__side">
          <Card title="Customer">
            <dl className="kv">
              <dt>Email</dt>
              <dd>{order.customerEmail ?? 'Not provided'}</dd>
              <dt>Customer id</dt>
              <dd className="mono">{order.customerId ?? 'Guest'}</dd>
              <dt>Shopify order</dt>
              <dd className="mono">{order.shopifyOrderId}</dd>
              <dt>Payment</dt>
              <dd>{order.financialStatus ? statusLabel(order.financialStatus) : 'Unknown'}</dd>
            </dl>
          </Card>
          <Card title="Timeline" subtitle="Webhooks received from Shopify">
            {events.length === 0 ? (
              <p className="text-sm text-secondary">No events recorded.</p>
            ) : (
              <ol className="timeline">
                {events.map((e) => (
                  <li key={e.id} className="timeline__item">
                    <div className="stack" style={{ gap: 2 }}>
                      <span>
                        <Badge
                          tone={
                            e.topic === 'orders/cancelled'
                              ? 'critical'
                              : e.topic === 'orders/paid'
                                ? 'success'
                                : 'info'
                          }
                        >
                          {e.topic}
                        </Badge>
                      </span>
                      <span className="text-xs text-secondary">
                        Received {formatDate(e.createdAt)}
                        {e.processedAt
                          ? `, processed ${formatDate(e.processedAt)}`
                          : ', waiting to be processed'}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
