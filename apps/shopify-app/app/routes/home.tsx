import {
  getDashboardStats,
  listCurrentPreviewsForJobs,
  listDesigns,
  listJobs,
  listOrders,
  listProviderStatuses,
} from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { LoaderFunctionArgs } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { StatusBadge } from '../components/Badge';
import { ButtonLink } from '../components/Button';
import { Card, CardFooter } from '../components/Card';
import { Checklist } from '../components/Checklist';
import { type Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Page } from '../components/Page';
import { Stat } from '../components/Stat';
import { Thumbnail } from '../components/Thumbnail';
import { requireShop } from '../lib/auth.server';
import { formatRelative } from '../lib/format';
import { useAutoRefresh } from '../lib/hooks';

const THUMB_SIGNING = { expiresSeconds: 3600, stableForSeconds: 900 };

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const [stats, jobs, orders, designs, providers] = await Promise.all([
    getDashboardStats(shop.id),
    listJobs(shop.id, 6),
    listOrders(shop.id, 6),
    listDesigns(shop.id),
    listProviderStatuses(shop.id),
  ]);
  const designNames = new Map(designs.map((d) => [d.id, d.name]));
  const previews = await listCurrentPreviewsForJobs(jobs.map((j) => j.id));

  const recentJobs = await Promise.all(
    jobs.map(async (job) => {
      const ready = previews.find((p) => p.jobId === job.id && p.status === 'ready' && p.previewKey);
      return {
        id: job.id,
        designName: designNames.get(job.designId) ?? 'Deleted design',
        status: job.status,
        source: job.source,
        createdAt: job.createdAt,
        thumbUrl: ready?.previewKey ? await presignDownload(ready.previewKey, THUMB_SIGNING) : null,
      };
    }),
  );

  return {
    stats,
    recentJobs,
    recentOrders: orders.map((o) => ({
      id: o.id,
      name: o.orderName ?? o.shopifyOrderId,
      customerEmail: o.customerEmail,
      status: o.status,
      createdAt: o.createdAt,
    })),
    checklist: {
      hasDesign: designs.length > 0,
      hasLiveDesign: designs.some((d) => d.status === 'live'),
      hasJob: jobs.length > 0,
      hasEnabledProvider: providers.some((p) => p.enabled),
    },
    hasActive: jobs.some((j) => j.status === 'queued' || j.status === 'generating'),
  };
}

type RecentJob = Awaited<ReturnType<typeof loader>>['recentJobs'][number];
type RecentOrder = Awaited<ReturnType<typeof loader>>['recentOrders'][number];

const jobColumns: Column<RecentJob>[] = [
  {
    key: 'design',
    header: 'Design',
    render: (job) => (
      <span className="cell-media">
        <Thumbnail src={job.thumbUrl} alt="" size="sm" />
        <span>
          <Link to={`/generations/${job.id}`} className="table__primary">
            {job.designName}
          </Link>
          <span className="table__sub">{job.source === 'admin_test' ? 'Test run' : 'Storefront'}</span>
        </span>
      </span>
    ),
  },
  { key: 'status', header: 'Status', render: (job) => <StatusBadge status={job.status} kind="job" /> },
  { key: 'created', header: 'Created', render: (job) => formatRelative(job.createdAt), hideBelow: 'sm' },
];

const orderColumns: Column<RecentOrder>[] = [
  {
    key: 'order',
    header: 'Order',
    render: (order) => (
      <span>
        <Link to={`/orders/${order.id}`} className="table__primary">
          {order.name}
        </Link>
        <span className="table__sub">{order.customerEmail ?? 'No email on file'}</span>
      </span>
    ),
  },
  { key: 'status', header: 'Status', render: (order) => <StatusBadge status={order.status} kind="order" /> },
  { key: 'created', header: 'Created', render: (order) => formatRelative(order.createdAt), hideBelow: 'sm' },
];

export default function Dashboard() {
  const { stats, recentJobs, recentOrders, checklist, hasActive } = useLoaderData<typeof loader>();
  useAutoRefresh(hasActive, 5000);
  const showChecklist = !checklist.hasLiveDesign || !checklist.hasJob;

  return (
    <Page
      title="Overview"
      subtitle="What is happening in your AI art store right now."
      actions={
        <ButtonLink to="/designs/new" variant="primary" icon="plus">
          New design
        </ButtonLink>
      }
    >
      <div className="stack">
        {showChecklist ? (
          <Card
            title="Get started"
            subtitle="Four steps from an empty store to your first personalized preview."
          >
            <Checklist
              items={[
                {
                  label: 'Create a design (prompt, reference images, a model per preview)',
                  done: checklist.hasDesign,
                  to: '/designs/new',
                },
                {
                  label: 'Publish the design so the storefront can use it',
                  done: checklist.hasLiveDesign,
                  to: '/designs',
                },
                { label: 'Run a test generation on a sample photo', done: checklist.hasJob, to: '/designs' },
                {
                  label: 'Add the AI Art Preview block to a product page in the theme editor',
                  done: checklist.hasJob,
                  href: 'https://help.shopify.com/en/manual/online-store/themes/theme-structure/extend/apps',
                },
              ]}
            />
          </Card>
        ) : null}

        <div className="grid-4">
          <Stat label="Live designs" value={stats.liveDesigns} icon="image" to="/designs?filter=live" />
          <Stat
            label="Previews today"
            value={stats.previewsToday}
            icon="sparkles"
            hint="Counts every preview slot, including regenerations"
          />
          <Stat
            label="Orders needing attention"
            value={stats.ordersNeedingAttention}
            icon="alert-triangle"
            tone={stats.ordersNeedingAttention > 0 ? 'critical' : undefined}
            to="/orders?filter=attention"
          />
          <Stat
            label="Jobs in progress"
            value={stats.jobsInProgress}
            icon="activity"
            to="/generations?filter=active"
          />
        </div>

        <div className="grid-2">
          <Card title="Recent generations" padded={false}>
            <DataTable
              columns={jobColumns}
              rows={recentJobs}
              rowKey={(job) => job.id}
              emptyState={
                <EmptyState
                  icon="sparkles"
                  title="No generations yet"
                  text="Run a test from a design, or upload a photo on the storefront."
                />
              }
            />
            <CardFooter>
              <span>Showing the latest {recentJobs.length}</span>
              <Link to="/generations">View all generations</Link>
            </CardFooter>
          </Card>
          <Card title="Recent orders" padded={false}>
            <DataTable
              columns={orderColumns}
              rows={recentOrders}
              rowKey={(order) => order.id}
              emptyState={
                <EmptyState
                  icon="package"
                  title="No orders yet"
                  text="Orders appear here as soon as Shopify sends an order webhook."
                />
              }
            />
            <CardFooter>
              <span>Showing the latest {recentOrders.length}</span>
              <Link to="/orders">View all orders</Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </Page>
  );
}
