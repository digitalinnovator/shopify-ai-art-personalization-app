import { listPrivacyRequests } from '@aiart/core/services';
import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { StatusBadge } from '../components/Badge';
import { Banner } from '../components/Banner';
import { Card } from '../components/Card';
import { type Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Page } from '../components/Page';
import { requireShop } from '../lib/auth.server';
import { formatDate } from '../lib/format';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const requests = await listPrivacyRequests(shop.id);
  return { requests };
}

type Row = Awaited<ReturnType<typeof loader>>['requests'][number];

const columns: Column<Row>[] = [
  { key: 'topic', header: 'Request', render: (r) => <StatusBadge status={r.topic} kind="topic" /> },
  {
    key: 'customer',
    header: 'Customer',
    render: (r) =>
      r.customerId ? (
        <span className="mono">{r.customerId}</span>
      ) : (
        <span className="text-secondary">Shop-wide</span>
      ),
  },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} kind="privacy" /> },
  {
    key: 'summary',
    header: 'Result',
    render: (r) => (
      <span>
        {r.summary ?? <span className="text-secondary">Waiting for a manual reply</span>}
        <details>
          <summary className="text-xs" style={{ cursor: 'pointer', marginTop: 4 }}>
            Show payload
          </summary>
          <pre className="code-block" style={{ marginTop: 6 }}>
            {JSON.stringify(r.payload, null, 2)}
          </pre>
        </details>
      </span>
    ),
  },
  { key: 'received', header: 'Received', render: (r) => formatDate(r.createdAt), hideBelow: 'sm' },
  { key: 'completed', header: 'Completed', render: (r) => formatDate(r.completedAt), hideBelow: 'md' },
];

export default function PrivacyIndex() {
  const { requests } = useLoaderData<typeof loader>();
  return (
    <Page
      title="Privacy requests"
      subtitle="Shopify's mandatory compliance webhooks, recorded as they arrive."
    >
      <div className="stack">
        <Banner tone="info" title="How these are handled">
          Customer redact and shop redact requests are carried out automatically: the customer's photos,
          previews and selections (or the whole shop's data) are deleted and the result is noted here. A
          customer data request is only recorded; reply to the customer with the data you hold.
        </Banner>
        <Card padded={false}>
          <DataTable
            columns={columns}
            rows={requests}
            rowKey={(r) => r.id}
            caption="Privacy requests"
            emptyState={
              <EmptyState
                icon="shield"
                title="No privacy requests"
                text="Requests from Shopify will be listed here with what was done."
              />
            }
          />
        </Card>
      </div>
    </Page>
  );
}
