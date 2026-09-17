import { listDesignSummaries } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { LoaderFunctionArgs } from 'react-router';
import { Form, Link, useLoaderData } from 'react-router';
import { StatusBadge } from '../components/Badge';
import { Button, ButtonLink } from '../components/Button';
import { Card } from '../components/Card';
import { type Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Page } from '../components/Page';
import { Tabs } from '../components/Tabs';
import { Thumbnail } from '../components/Thumbnail';
import { requireShop } from '../lib/auth.server';
import { formatRelative, pluralize } from '../lib/format';
import { designTypeLabel } from '../lib/status';

const FILTERS = ['all', 'live', 'draft', 'archived'] as const;
type Filter = (typeof FILTERS)[number];

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const filter = (FILTERS as readonly string[]).includes(url.searchParams.get('filter') ?? '')
    ? (url.searchParams.get('filter') as Filter)
    : 'all';

  const all = await listDesignSummaries(shop.id);
  const counts = {
    all: all.length,
    live: all.filter((d) => d.status === 'live').length,
    draft: all.filter((d) => d.status === 'draft').length,
    archived: all.filter((d) => d.status === 'archived').length,
  };
  const filtered = all.filter((d) => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.slug.includes(q) ||
      d.shopifyProductIds.some((id) => id.toLowerCase().includes(q))
    );
  });
  const designs = await Promise.all(
    filtered.map(async (d) => ({
      ...d,
      thumbUrl: d.thumbnailKey
        ? await presignDownload(d.thumbnailKey, { expiresSeconds: 3600, stableForSeconds: 900 })
        : null,
    })),
  );
  return { designs, counts, q, filter, total: all.length };
}

type Row = Awaited<ReturnType<typeof loader>>['designs'][number];

const columns: Column<Row>[] = [
  {
    key: 'design',
    header: 'Design',
    render: (d) => (
      <span className="cell-media">
        <Thumbnail src={d.thumbUrl} alt="" size="sm" />
        <span>
          <Link to={`/designs/${d.id}`} className="table__primary">
            {d.name}
          </Link>
          <span className="table__sub">{d.slug}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    render: (d) => (
      <span className="row" style={{ gap: 6 }}>
        <Icon name={d.type === 'face_into_scene' ? 'scan-face' : 'wand'} size={16} />
        {designTypeLabel(d.type)}
      </span>
    ),
    hideBelow: 'sm',
  },
  { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} kind="design" /> },
  {
    key: 'versions',
    header: 'Versions',
    render: (d) => (
      <span>
        {d.liveVersion ? `v${d.liveVersion} live` : 'Not published'}
        <span className="table__sub">{pluralize(d.versionCount, 'version')}</span>
      </span>
    ),
    hideBelow: 'md',
  },
  {
    key: 'products',
    header: 'Linked products',
    align: 'right',
    render: (d) => <span title={d.shopifyProductIds.join('\n')}>{d.shopifyProductIds.length}</span>,
    hideBelow: 'md',
  },
  { key: 'updated', header: 'Updated', render: (d) => formatRelative(d.updatedAt), hideBelow: 'sm' },
];

export default function DesignsIndex() {
  const { designs, counts, q, filter, total } = useLoaderData<typeof loader>();
  const tab = (f: Filter, label: string) => ({
    to: `/designs?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    label,
    active: filter === f,
    count: counts[f],
  });

  return (
    <Page
      title="Designs"
      subtitle="Each design is a saved template: a prompt, reference images and one model per preview slot."
      actions={
        <ButtonLink to="/designs/new" variant="primary" icon="plus">
          New design
        </ButtonLink>
      }
    >
      <Card padded={false}>
        {total > 0 ? (
          <>
            <Tabs
              label="Filter designs"
              items={[
                tab('all', 'All'),
                tab('live', 'Live'),
                tab('draft', 'Draft'),
                tab('archived', 'Archived'),
              ]}
            />
            <Form method="get" className="toolbar" role="search">
              <input type="hidden" name="filter" value={filter} />
              <div className="input-group">
                <Icon name="search" size={16} />
                <input
                  className="input input--inline"
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search by name, slug or product id"
                  aria-label="Search designs"
                />
              </div>
              <Button type="submit" size="sm">
                Search
              </Button>
              {q ? (
                <ButtonLink to={`/designs?filter=${filter}`} variant="plain" size="sm">
                  Clear
                </ButtonLink>
              ) : null}
            </Form>
          </>
        ) : null}
        <DataTable
          columns={columns}
          rows={designs}
          rowKey={(d) => d.id}
          caption="Designs"
          emptyState={
            total === 0 ? (
              <EmptyState
                icon="image"
                title="No designs yet"
                text="A design is a reusable template. Create one, test it on sample photos, then publish it to your product page."
                action={
                  <ButtonLink to="/designs/new" variant="primary" icon="plus">
                    Create a design
                  </ButtonLink>
                }
              />
            ) : (
              <EmptyState icon="search" title="No designs match" text="Try a different search or filter." />
            )
          }
        />
      </Card>
    </Page>
  );
}
