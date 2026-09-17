import { listOrdersWithCounts } from '@aiart/core/services';
import type { LoaderFunctionArgs } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { Badge, StatusBadge } from '../components/Badge';
import { Card } from '../components/Card';
import { type Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Page } from '../components/Page';
import { Tabs } from '../components/Tabs';
import { requireShop } from '../lib/auth.server';
import { formatDate, formatRelative, pluralize } from '../lib/format';

const FILTERS = ['all', 'attention', 'released', 'cancelled'] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const filter = (FILTERS as readonly string[]).includes(url.searchParams.get('filter') ?? '')
    ? (url.searchParams.get('filter') as Filter)
    : 'all';
  const all = await listOrdersWithCounts(shop.id);
  const orders = all.filter((o) => {
    if (filter === 'attention') return o.status === 'needs_attention';
    if (filter === 'released') return o.status === 'released';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  });
  return {
    orders,
    filter,
    counts: {
      all: all.length,
      attention: all.filter((o) => o.status === 'needs_attention').length,
      released: all.filter((o) => o.status === 'released').length,
      cancelled: all.filter((o) => o.status === 'cancelled').length,
    },
  };
}

type Row = Awaited<ReturnType<typeof loader>>['orders'][number];

const columns: Column<Row>[] = [
  {
    key: 'order',
    header: 'Order',
    render: (o) => (
      <span>
        <Link to={`/orders/${o.id}`} className="table__primary">
          {o.orderName ?? o.shopifyOrderId}
        </Link>
        {o.orderName ? <span className="table__sub">Shopify id {o.shopifyOrderId}</span> : null}
      </span>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    render: (o) => o.customerEmail ?? <span className="text-secondary">No email on file</span>,
    hideBelow: 'sm',
  },
  { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} kind="order" /> },
  {
    key: 'items',
    header: 'Items',
    render: (o) => (
      <span className="row" style={{ gap: 6 }}>
        {pluralize(o.itemCount, 'item')}
        {o.attentionCount > 0 ? <Badge tone="attention">{o.attentionCount} need attention</Badge> : null}
      </span>
    ),
  },
  { key: 'attempts', header: 'Attempts', align: 'right', render: (o) => o.attempts, hideBelow: 'md' },
  {
    key: 'created',
    header: 'Created',
    render: (o) => <span title={formatDate(o.createdAt)}>{formatRelative(o.createdAt)}</span>,
    hideBelow: 'sm',
  },
];

export default function OrdersIndex() {
  const { orders, filter, counts } = useLoaderData<typeof loader>();
  const tab = (f: Filter, label: string) => ({
    to: `/orders?filter=${f}`,
    label,
    active: filter === f,
    count: counts[f],
  });
  return (
    <Page
      title="Orders"
      subtitle="Orders that contain a personalized item, and the final artwork released for each."
    >
      <Card padded={false}>
        {counts.all > 0 ? (
          <Tabs
            label="Filter orders"
            items={[
              tab('all', 'All'),
              tab('attention', 'Needs attention'),
              tab('released', 'Released'),
              tab('cancelled', 'Cancelled'),
            ]}
          />
        ) : null}
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(o) => o.id}
          caption="Orders"
          emptyState={
            counts.all === 0 ? (
              <EmptyState
                icon="package"
                title="No orders yet"
                text="Orders appear here when Shopify sends an order webhook. Locally, use the developer tools on the storefront test page to simulate one."
              />
            ) : (
              <EmptyState icon="filter" title="Nothing in this view" text="Try another filter." />
            )
          }
        />
      </Card>
    </Page>
  );
}
