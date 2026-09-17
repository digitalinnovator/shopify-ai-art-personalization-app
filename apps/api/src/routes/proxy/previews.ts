import { JOB_STATUSES, PREVIEW_SLOTS, PREVIEW_STATUSES } from '@aiart/contracts';
import type { Job } from '@aiart/core/db';
import {
  createJob,
  getJob,
  getShop,
  getUpload,
  regenerateJob,
  selectPreview,
  tryConsumeDailyPreviewQuota,
} from '@aiart/core/services';
import { presignDownload } from '@aiart/core/storage';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireLiveDesign } from '../../lib/design';
import { conflict, notFound, tooManyRequests } from '../../lib/errors';
import { type ProxyContext, requireProxyCtx } from '../../plugins/proxy-auth';

const CreateBodySchema = z.object({ designId: z.uuid(), uploadId: z.uuid() });
const JobParamsSchema = z.object({ jobId: z.uuid() });
const SelectBodySchema = z.object({ previewId: z.uuid() });

const PreviewViewSchema = z.object({
  id: z.uuid(),
  slot: z.enum(PREVIEW_SLOTS),
  status: z.enum(PREVIEW_STATUSES),
  url: z.url().optional(),
  error: z.string().nullable().optional(),
  errorKind: z.string().nullable().optional(),
});

const JobViewSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(JOB_STATUSES),
  round: z.number(),
  regenerationsLeft: z.number(),
  previews: z.array(PreviewViewSchema),
});

/** Every /previews/* route works on a job the caller's own session created — never another shopper's. */
async function loadOwnedJob(jobId: string, ctx: ProxyContext) {
  const view = await getJob(jobId);
  if (!view || view.job.shopId !== ctx.shopId || view.job.sessionId !== ctx.sessionId) {
    throw notFound('job_not_found', 'Job not found');
  }
  return view;
}

async function toJobView(job: Job, previews: NonNullable<Awaited<ReturnType<typeof getJob>>>['previews']) {
  const withUrls = await Promise.all(
    previews.map(async (p) => ({
      id: p.id,
      slot: p.slot,
      status: p.status,
      url:
        p.status === 'ready' && p.previewKey
          ? await presignDownload(p.previewKey, { expiresSeconds: 600, stableForSeconds: 300 })
          : undefined,
      error: p.status === 'failed' ? p.error : undefined,
      errorKind: p.status === 'failed' ? p.errorKind : undefined,
    })),
  );
  return {
    jobId: job.id,
    status: job.status,
    round: job.round,
    regenerationsLeft: Math.max(0, job.regenerationLimit - job.regenerationsUsed),
    previews: withUrls,
  };
}

export const previewsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/previews',
    { schema: { body: CreateBodySchema, response: { 200: z.object({ jobId: z.uuid() }) } } },
    async (request) => {
      const ctx = requireProxyCtx(request);
      const { design, version, config } = await requireLiveDesign(ctx.shopId, request.body.designId);
      const upload = await getUpload(ctx.shopId, request.body.uploadId);
      if (!upload || upload.sessionId !== ctx.sessionId)
        throw notFound('upload_not_found', 'Upload not found');
      if (upload.status !== 'validated')
        throw conflict('upload_not_ready', `Upload status is "${upload.status}", expected "validated"`);

      const shop = await getShop(ctx.shopId);
      const quota = await tryConsumeDailyPreviewQuota(
        ctx.shopId,
        config.slots.length,
        shop?.settings.dailyPreviewCap ?? 0,
      );
      if (!quota.allowed)
        throw tooManyRequests(
          'daily_cap_reached',
          'This store has reached its daily preview limit. Please try again tomorrow.',
        );

      const { jobId } = await createJob({
        shopId: ctx.shopId,
        designId: design.id,
        designVersionId: version.id,
        config,
        uploadId: upload.id,
        sessionId: ctx.sessionId,
        customerId: ctx.customerId,
        source: 'storefront',
      });
      return { jobId };
    },
  );

  app.get(
    '/previews/:jobId',
    { schema: { params: JobParamsSchema, response: { 200: JobViewSchema } } },
    async (request) => {
      const ctx = requireProxyCtx(request);
      const { job, previews } = await loadOwnedJob(request.params.jobId, ctx);
      return toJobView(job, previews);
    },
  );

  app.post(
    '/previews/:jobId/regenerate',
    { schema: { params: JobParamsSchema, response: { 200: JobViewSchema } } },
    async (request) => {
      const ctx = requireProxyCtx(request);
      const { job } = await loadOwnedJob(request.params.jobId, ctx);
      const { config } = await requireLiveDesign(ctx.shopId, job.designId);

      const shop = await getShop(ctx.shopId);
      const quota = await tryConsumeDailyPreviewQuota(
        ctx.shopId,
        config.slots.length,
        shop?.settings.dailyPreviewCap ?? 0,
      );
      if (!quota.allowed)
        throw tooManyRequests(
          'daily_cap_reached',
          'This store has reached its daily preview limit. Please try again tomorrow.',
        );

      const result = await regenerateJob(job.id);
      if (!result.ok) {
        const message =
          result.reason === 'limit_reached'
            ? 'No regenerations left for this design.'
            : result.reason === 'not_settled'
              ? 'This job is still generating.'
              : 'Job not found.';
        throw result.reason === 'not_found'
          ? notFound('job_not_found', message)
          : conflict(result.reason, message);
      }
      const updated = await loadOwnedJob(job.id, ctx);
      return toJobView(updated.job, updated.previews);
    },
  );

  app.post(
    '/previews/:jobId/select',
    {
      schema: {
        params: JobParamsSchema,
        body: SelectBodySchema,
        response: { 200: z.object({ selectionToken: z.string() }) },
      },
    },
    async (request) => {
      const ctx = requireProxyCtx(request);
      const { job } = await loadOwnedJob(request.params.jobId, ctx);
      const result = await selectPreview(job.id, request.body.previewId);
      if ('error' in result) {
        const message =
          result.error === 'not_ready' ? 'That preview is not ready yet.' : 'Preview not found.';
        throw result.error === 'not_found'
          ? notFound('preview_not_found', message)
          : conflict('preview_not_ready', message);
      }
      return { selectionToken: result.token };
    },
  );
};
