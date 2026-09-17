import { listCurrentPreviewsForJobs, listDesigns, listJobs } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { LoaderFunctionArgs } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { StatusBadge } from '../components/Badge';
import { Card } from '../components/Card';
import { type Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Tabs } from '../components/Tabs';
import { Thumbnail } from '../components/Thumbnail';
import { requireShop } from '../lib/auth.server';
import { formatDate, formatRelative } from '../lib/format';
import { useAutoRefresh } from '../lib/hooks';

const FILTERS = ['all', 'active', 'failed', 'test'] as const;
type Filter = (typeof FILTERS)[number];
const ACTIVE = new Set(['queued', 'generating']);

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const filter = (FILTERS as readonly string[]).includes(url.searchParams.get('filter') ?? '')
    ? (url.searchParams.get('filter') as Filter)
    : 'all';

  const [jobs, designs] = await Promise.all([listJobs(shop.id, 100), listDesigns(shop.id)]);
  const designNames = new Map(designs.map((d) => [d.id, d.name]));
  const previews = await listCurrentPreviewsForJobs(jobs.map((j) => j.id));

  const filtered = jobs.filter((job) => {
    if (filter === 'active') return ACTIVE.has(job.status);
    if (filter === 'failed') return job.status === 'failed' || job.status === 'partial';
    if (filter === 'test') return job.source === 'admin_test';
    return true;
  });

  const rows = await Promise.all(
    filtered.map(async (job) => ({
      id: job.id,
      designId: job.designId,
      designName: designNames.get(job.designId) ?? 'Deleted design',
      source: job.source,
      status: job.status,
      round: job.round,
      regenerationsUsed: job.regenerationsUsed,
      regenerationLimit: job.regenerationLimit,
      createdAt: job.createdAt,
      previews: await Promise.all(
        previews
          .filter((p) => p.jobId === job.id)
          .map(async (p) => ({
            slot: p.slot,
            status: p.status,
            url:
              p.status === 'ready' && p.previewKey
                ? await presignDownload(p.previewKey, { expiresSeconds: 3600, stableForSeconds: 900 })
                : null,
          })),
      ),
    })),
  );

  return {
    rows,
    filter,
    counts: {
      all: jobs.length,
      active: jobs.filter((j) => ACTIVE.has(j.status)).length,
      failed: jobs.filter((j) => j.status === 'failed' || j.status === 'partial').length,
      test: jobs.filter((j) => j.source === 'admin_test').length,
    },
    hasActive: jobs.some((j) => ACTIVE.has(j.status)),
  };
}

type Row = Awaited<ReturnType<typeof loader>>['rows'][number];

function PreviewThumb({ preview }: { preview: Row['previews'][number] }) {
  if (preview.status === 'ready')
    return <Thumbnail src={preview.url} alt={`Preview ${preview.slot}`} size="sm" />;
  if (preview.status === 'failed')
    return <Thumbnail alt={`Preview ${preview.slot} failed`} size="sm" icon="alert-circle" tone="critical" />;
  return <Skeleton width={40} height={50} />;
}

const columns: Column<Row>[] = [
  {
    key: 'previews',
    header: 'Previews',
    width: '110px',
    render: (job) => (
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        {job.previews.map((p) => (
          <PreviewThumb key={p.slot} preview={p} />
        ))}
      </span>
    ),
  },
  {
    key: 'design',
    header: 'Design',
    render: (job) => (
      <span>
        <Link to={`/generations/${job.id}`} className="table__primary">
          {job.designName}
        </Link>
        <span className="table__sub">
          Round {job.round}. {job.regenerationsUsed} of {job.regenerationLimit} regenerations used
        </span>
      </span>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    render: (job) => <StatusBadge status={job.source} kind="source" />,
    hideBelow: 'sm',
  },
  { key: 'status', header: 'Status', render: (job) => <StatusBadge status={job.status} kind="job" /> },
  {
    key: 'created',
    header: 'Created',
    render: (job) => <span title={formatDate(job.createdAt)}>{formatRelative(job.createdAt)}</span>,
    hideBelow: 'sm',
  },
];

export default function GenerationsIndex() {
  const { rows, filter, counts, hasActive } = useLoaderData<typeof loader>();
  useAutoRefresh(hasActive, 4000);
  const tab = (f: Filter, label: string) => ({
    to: `/generations?filter=${f}`,
    label,
    active: filter === f,
    count: counts[f],
  });

  return (
    <Page
      title="Generations"
      subtitle="Every preview job: the customer photo, both previews, which model produced them and how long it took."
      actions={
        hasActive ? (
          <span className="live-indicator">
            <Icon name="refresh" size={16} spin />
            Updating every 4 seconds while jobs are running
          </span>
        ) : undefined
      }
    >
      <Card padded={false}>
        {counts.all > 0 ? (
          <Tabs
            label="Filter generations"
            items={[
              tab('all', 'All'),
              tab('active', 'In progress'),
              tab('failed', 'Failed or partial'),
              tab('test', 'Test runs'),
            ]}
          />
        ) : null}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(job) => job.id}
          caption="Generations"
          emptyState={
            counts.all === 0 ? (
              <EmptyState
                icon="sparkles"
                title="No generations yet"
                text="Open a design and use Save and run test, or upload a photo on the storefront test page."
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
