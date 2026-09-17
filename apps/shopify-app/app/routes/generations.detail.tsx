import { getDesign, getJobById, getUpload, getVersion, listAllPreviews } from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { Badge, StatusBadge } from '../components/Badge';
import { Banner } from '../components/Banner';
import { ButtonLink } from '../components/Button';
import { Card, CardSection } from '../components/Card';
import { Page } from '../components/Page';
import { Thumbnail } from '../components/Thumbnail';
import { useActionToast } from '../components/Toast';
import { requireShop } from '../lib/auth.server';
import { formatBytes, formatDate, formatDuration, shortId } from '../lib/format';
import { useAutoRefresh } from '../lib/hooks';
import { toastFromSearch } from '../lib/toast';

const SIGNING = { expiresSeconds: 3600, stableForSeconds: 900 };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const job = await getJobById(params.jobId ?? '');
  if (!job || job.shopId !== shop.id) throw new Response('Generation not found', { status: 404 });
  const [design, version, upload, previews] = await Promise.all([
    getDesign(shop.id, job.designId),
    getVersion(job.designVersionId),
    getUpload(shop.id, job.uploadId),
    listAllPreviews(job.id),
  ]);
  const photoUrl =
    upload && upload.status !== 'deleted' ? await presignDownload(upload.storageKey, SIGNING) : null;
  const previewsWithUrls = await Promise.all(
    previews.map(async (p) => ({
      ...p,
      originalUrl: p.originalKey ? await presignDownload(p.originalKey, SIGNING) : null,
      previewUrl: p.previewKey ? await presignDownload(p.previewKey, SIGNING) : null,
    })),
  );
  return {
    job,
    design,
    version,
    upload: upload
      ? {
          width: upload.width,
          height: upload.height,
          bytes: upload.bytes,
          status: upload.status,
          mime: upload.mime,
          rejectionReason: upload.rejectionReason,
        }
      : null,
    photoUrl,
    previews: previewsWithUrls,
    toast: toastFromSearch(request.url),
  };
}

export default function GenerationDetail() {
  const { job, design, version, upload, photoUrl, previews, toast } = useLoaderData<typeof loader>();
  useActionToast(toast);
  const active = job.status === 'queued' || job.status === 'generating';
  useAutoRefresh(active, 3000);
  const rounds = [...new Set(previews.map((p) => p.round))].sort((a, b) => b - a);

  return (
    <Page
      backTo="/generations"
      backLabel="Generations"
      title={design?.name ?? 'Deleted design'}
      titleMeta={<StatusBadge status={job.status} kind="job" />}
      subtitle={`${job.source === 'admin_test' ? 'Test run' : 'Storefront'}. Template v${version?.version ?? '?'}. Created ${formatDate(job.createdAt)}.`}
      actions={
        design ? (
          <ButtonLink to={`/designs/${design.id}`} icon="image">
            Open design
          </ButtonLink>
        ) : undefined
      }
    >
      <div className="layout-2col">
        <div className="stack">
          {job.error ? (
            <Banner tone="critical" title="This job failed">
              {job.error}
            </Banner>
          ) : null}
          {rounds.map((round) => (
            <Card
              key={round}
              title={`Round ${round}`}
              subtitle={round === job.round ? 'Current round' : 'Earlier attempt'}
            >
              <div className="compare">
                {previews
                  .filter((p) => p.round === round)
                  .map((p) => (
                    <div key={p.id} className="compare__panel">
                      <div className="compare__head">
                        <strong>Preview {p.slot}</strong>
                        <StatusBadge status={p.status} kind="preview" />
                      </div>
                      {p.previewUrl || p.originalUrl ? (
                        <a
                          href={p.originalUrl ?? p.previewUrl ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          title="Open full size"
                        >
                          <Thumbnail
                            src={p.previewUrl ?? p.originalUrl}
                            alt={`Preview ${p.slot}`}
                            size="lg"
                          />
                        </a>
                      ) : (
                        <Thumbnail
                          alt={`Preview ${p.slot} not available`}
                          size="lg"
                          icon={p.status === 'failed' ? 'alert-circle' : 'loader'}
                          tone={p.status === 'failed' ? 'critical' : undefined}
                        />
                      )}
                      <div className="compare__meta">
                        <span className="mono">
                          {p.provider}/{p.model}
                        </span>
                        {p.durationMs ? <span>{formatDuration(p.durationMs)}</span> : null}
                        <span>
                          {p.attempts} attempt{p.attempts === 1 ? '' : 's'}
                        </span>
                      </div>
                      {p.status === 'failed' ? (
                        <Banner tone="critical" title={p.errorKind ? undefined : 'Generation failed'}>
                          <span className="row">
                            {p.errorKind ? <StatusBadge status={p.errorKind} kind="errorKind" /> : null}
                            <span>{p.error ?? 'No details recorded.'}</span>
                          </span>
                        </Banner>
                      ) : null}
                    </div>
                  ))}
              </div>
            </Card>
          ))}
          {rounds.length === 0 ? <Card>No previews were created for this job.</Card> : null}
        </div>

        <aside className="stack layout-2col__side">
          <Card title="Customer photo" padded={false}>
            <CardSection>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {photoUrl ? (
                  <a href={photoUrl} target="_blank" rel="noreferrer" title="Open full size">
                    <Thumbnail src={photoUrl} alt="Customer photo" size="md" />
                  </a>
                ) : (
                  <Thumbnail alt="Photo deleted" size="md" icon="image" />
                )}
                <dl className="kv" style={{ flex: 1 }}>
                  <dt>Status</dt>
                  <dd>{upload ? <StatusBadge status={upload.status} kind="upload" /> : 'Unknown'}</dd>
                  {upload?.width && upload.height ? (
                    <>
                      <dt>Size</dt>
                      <dd>
                        {upload.width} x {upload.height} px
                        {upload.bytes ? `, ${formatBytes(upload.bytes)}` : ''}
                      </dd>
                    </>
                  ) : null}
                  {upload?.rejectionReason ? (
                    <>
                      <dt>Rejected</dt>
                      <dd>{upload.rejectionReason}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </CardSection>
          </Card>

          <Card title="Details">
            <dl className="kv">
              <dt>Source</dt>
              <dd>
                <StatusBadge status={job.source} kind="source" />
              </dd>
              <dt>Job</dt>
              <dd className="mono" title={job.id}>
                {shortId(job.id)}
              </dd>
              <dt>Session</dt>
              <dd className="mono" title={job.sessionId}>
                {shortId(job.sessionId, 10)}
              </dd>
              <dt>Regenerations</dt>
              <dd>
                {job.regenerationsUsed} of {job.regenerationLimit} used
              </dd>
              <dt>Created</dt>
              <dd>{formatDate(job.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{formatDate(job.updatedAt)}</dd>
            </dl>
          </Card>

          <Card title="Timings">
            {previews.length === 0 ? (
              <p className="text-sm text-secondary">Nothing to show yet.</p>
            ) : (
              <dl className="kv">
                {previews.map((p) => (
                  <div key={p.id} style={{ display: 'contents' }}>
                    <dt>
                      R{p.round} {p.slot}
                    </dt>
                    <dd>
                      {p.durationMs ? (
                        formatDuration(p.durationMs)
                      ) : (
                        <Badge tone={p.status === 'failed' ? 'critical' : 'info'}>{p.status}</Badge>
                      )}
                      {p.submittedAt ? (
                        <span className="table__sub">Submitted {formatDate(p.submittedAt)}</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
