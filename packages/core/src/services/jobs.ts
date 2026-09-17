import {
  type DesignConfig,
  JOB_SETTLED_STATUSES,
  JOB_TERMINAL_STATUSES,
  type JobSource,
  type JobStatus,
  type PreviewSlot,
} from '@aiart/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, designVersions, type Job, jobs, type Preview, previews, selections } from '../db';
import { enqueueGenerate } from '../queue';
import { hashToken, randomToken } from '../security';

const PG_UNIQUE_VIOLATION = '23505';

export interface CreateJobInput {
  shopId: string;
  designId: string;
  designVersionId: string;
  config: DesignConfig;
  uploadId: string;
  sessionId: string;
  customerId?: string;
  source: JobSource;
}

async function insertPreviewRound(
  tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0] | ReturnType<typeof db>,
  jobId: string,
  round: number,
  config: DesignConfig,
): Promise<string[]> {
  const rows = await tx
    .insert(previews)
    .values(
      config.slots.map((slot) => ({
        jobId,
        round,
        slot: slot.slot,
        provider: slot.provider,
        model: slot.model,
        status: 'pending' as const,
      })),
    )
    .returning({ id: previews.id });
  return rows.map((r) => r.id);
}

/**
 * Creates a job and its round-1 previews, then enqueues generation. Idempotent for the
 * storefront: a second call for the same photo and design returns the still-active job instead
 * of erroring, because of the partial unique index on (upload_id, design_id).
 */
export async function createJob(input: CreateJobInput): Promise<{ jobId: string; created: boolean }> {
  try {
    const jobId = await db().transaction(async (tx) => {
      const [job] = await tx
        .insert(jobs)
        .values({
          shopId: input.shopId,
          designId: input.designId,
          designVersionId: input.designVersionId,
          uploadId: input.uploadId,
          sessionId: input.sessionId,
          customerId: input.customerId,
          source: input.source,
          status: 'queued',
          round: 1,
          regenerationLimit: input.config.limits.regenerationsPerSession,
        })
        .returning({ id: jobs.id });
      await insertPreviewRound(tx, job!.id, 1, input.config);
      return job!.id;
    });
    await enqueueRound(jobId, 1);
    return { jobId, created: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await findActiveJob(input.shopId, input.uploadId, input.designId);
      if (existing) return { jobId: existing.id, created: false };
    }
    throw err;
  }
}

/** drizzle-orm wraps driver errors in a `DrizzleQueryError` whose `.cause` is the real `postgres` error. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  if (code === PG_UNIQUE_VIOLATION) return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' && cause !== null && (cause as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

async function findActiveJob(shopId: string, uploadId: string, designId: string): Promise<Job | undefined> {
  const [row] = await db()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.shopId, shopId),
        eq(jobs.uploadId, uploadId),
        eq(jobs.designId, designId),
        eq(jobs.source, 'storefront'),
        sql`${jobs.status} NOT IN ('failed', 'expired')`,
      ),
    );
  return row;
}

async function enqueueRound(jobId: string, round: number): Promise<void> {
  const rows = await db()
    .select({ id: previews.id })
    .from(previews)
    .where(and(eq(previews.jobId, jobId), eq(previews.round, round)));
  for (const p of rows) await enqueueGenerate(p.id);
}

export type RegenerateFailure = 'not_found' | 'limit_reached' | 'not_settled';

/**
 * Atomically checks and consumes one regeneration, so two near-simultaneous clicks cannot both
 * succeed. The new round's previews are only created after that single UPDATE commits.
 */
export async function regenerateJob(
  jobId: string,
): Promise<{ ok: true; round: number } | { ok: false; reason: RegenerateFailure }> {
  const [updated] = await db()
    .update(jobs)
    .set({
      round: sql`${jobs.round} + 1`,
      regenerationsUsed: sql`${jobs.regenerationsUsed} + 1`,
      status: 'queued',
      error: null,
    })
    .where(
      and(
        eq(jobs.id, jobId),
        sql`${jobs.regenerationsUsed} < ${jobs.regenerationLimit}`,
        inArray(jobs.status, [...JOB_SETTLED_STATUSES]),
      ),
    )
    .returning({ round: jobs.round, designVersionId: jobs.designVersionId });

  if (!updated) {
    const [existing] = await db()
      .select({
        status: jobs.status,
        regenerationsUsed: jobs.regenerationsUsed,
        regenerationLimit: jobs.regenerationLimit,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    if (!existing) return { ok: false, reason: 'not_found' };
    if (existing.regenerationsUsed >= existing.regenerationLimit)
      return { ok: false, reason: 'limit_reached' };
    return { ok: false, reason: 'not_settled' };
  }

  const [version] = await db()
    .select({ config: designVersions.config })
    .from(designVersions)
    .where(eq(designVersions.id, updated.designVersionId));
  if (!version) throw new Error(`Design version ${updated.designVersionId} not found`);
  await insertPreviewRound(db(), jobId, updated.round, version.config as DesignConfig);
  await enqueueRound(jobId, updated.round);
  return { ok: true, round: updated.round };
}

/** Most recent jobs for a shop's Generations list — newest first. */
export async function listJobs(shopId: string, limit = 50): Promise<Job[]> {
  return db()
    .select()
    .from(jobs)
    .where(eq(jobs.shopId, shopId))
    .orderBy(sql`${jobs.createdAt} DESC`)
    .limit(limit);
}

export async function getJobById(jobId: string): Promise<Job | undefined> {
  const [row] = await db().select().from(jobs).where(eq(jobs.id, jobId));
  return row;
}

export async function getPreview(previewId: string): Promise<Preview | undefined> {
  const [row] = await db().select().from(previews).where(eq(previews.id, previewId));
  return row;
}

export interface JobView {
  job: Job;
  previews: Preview[];
}

export async function getJob(jobId: string): Promise<JobView | undefined> {
  const [job] = await db().select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return undefined;
  const rows = await db()
    .select()
    .from(previews)
    .where(and(eq(previews.jobId, jobId), eq(previews.round, job.round)))
    .orderBy(previews.slot);
  return { job, previews: rows };
}

function statusFromPreviews(statuses: Preview['status'][]): JobStatus {
  if (statuses.some((s) => s === 'pending' || s === 'submitted')) return 'generating';
  if (statuses.every((s) => s === 'ready')) return 'ready';
  if (statuses.some((s) => s === 'ready')) return 'partial';
  return 'failed';
}

/**
 * Recomputes a job's status from its *current round's* previews, under a row lock so two
 * preview completions (A and B) racing each other can't both see a stale status. Never
 * overwrites a terminal status (selected/ordered/delivered/expired) — a late callback from a
 * previous round must not resurrect an already-progressed job.
 */
export async function aggregateJobStatus(jobId: string): Promise<void> {
  await db().transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    if (!job) return;
    if ((JOB_TERMINAL_STATUSES as readonly JobStatus[]).includes(job.status)) return;
    const rows = await tx
      .select({ status: previews.status })
      .from(previews)
      .where(and(eq(previews.jobId, jobId), eq(previews.round, job.round)));
    const next = statusFromPreviews(rows.map((r) => r.status));
    if (next !== job.status) await tx.update(jobs).set({ status: next }).where(eq(jobs.id, jobId));
  });
}

export type SelectFailure = 'not_found' | 'not_ready';

export async function selectPreview(
  jobId: string,
  previewId: string,
): Promise<{ token: string } | { error: SelectFailure }> {
  const [preview] = await db()
    .select()
    .from(previews)
    .where(and(eq(previews.id, previewId), eq(previews.jobId, jobId)));
  if (!preview) return { error: 'not_found' };
  if (preview.status !== 'ready') return { error: 'not_ready' };

  const token = randomToken();
  await db().transaction(async (tx) => {
    await tx.insert(selections).values({ jobId, previewId, tokenHash: hashToken(token) });
    await tx.update(jobs).set({ status: 'selected' }).where(eq(jobs.id, jobId));
  });
  return { token };
}

export async function markPreviewSubmitted(
  previewId: string,
  info: { providerRequestId: string; pollUrl: string },
): Promise<void> {
  await db()
    .update(previews)
    .set({
      status: 'submitted',
      providerRequestId: info.providerRequestId,
      pollUrl: info.pollUrl,
      submittedAt: new Date(),
    })
    .where(eq(previews.id, previewId));
}

export type PreviewErrorKind = 'temporary' | 'permanent' | 'refused' | 'timeout';

export async function markPreviewFailed(
  previewId: string,
  info: { error: string; errorKind: PreviewErrorKind },
): Promise<void> {
  await db()
    .update(previews)
    .set({ status: 'failed', error: info.error, errorKind: info.errorKind })
    .where(eq(previews.id, previewId));
}

export async function markPreviewReady(
  previewId: string,
  info: { originalKey: string; previewKey: string; width: number; height: number; durationMs?: number },
): Promise<void> {
  await db()
    .update(previews)
    .set({
      status: 'ready',
      originalKey: info.originalKey,
      previewKey: info.previewKey,
      width: info.width,
      height: info.height,
      completedAt: new Date(),
      durationMs: info.durationMs,
      error: null,
      errorKind: null,
    })
    .where(eq(previews.id, previewId));
}

export async function incrementPreviewAttempts(previewId: string): Promise<number> {
  const [row] = await db()
    .update(previews)
    .set({ attempts: sql`${previews.attempts} + 1` })
    .where(eq(previews.id, previewId))
    .returning({ attempts: previews.attempts });
  return row?.attempts ?? 0;
}

/**
 * Looks up the preview a provider webhook is reporting on. Only returns it while the preview is
 * still `submitted`, so a stale or redelivered callback (a previous round, an already-finalized
 * preview) is silently ignored rather than reprocessed.
 */
export async function findSubmittedPreview(
  provider: string,
  providerRequestId: string,
): Promise<Preview | undefined> {
  const [row] = await db()
    .select()
    .from(previews)
    .where(
      and(
        eq(previews.provider, provider),
        eq(previews.providerRequestId, providerRequestId),
        eq(previews.status, 'submitted'),
      ),
    );
  return row;
}

/** Every preview slot that has ever belonged to this job, most recent round first — for the admin Generations detail view. */
export async function listAllPreviews(jobId: string): Promise<Preview[]> {
  return db()
    .select()
    .from(previews)
    .where(eq(previews.jobId, jobId))
    .orderBy(sql`${previews.round} DESC`, previews.slot);
}

export const jobSlots = (config: DesignConfig): PreviewSlot[] => config.slots.map((s) => s.slot);

// ---------------------------------------------------------------- admin list helpers

/** The current round's previews for many jobs at once (one query), for list thumbnails. */
export async function listCurrentPreviewsForJobs(jobIds: string[]): Promise<Preview[]> {
  if (jobIds.length === 0) return [];
  const rounds = await db()
    .select({ id: jobs.id, round: jobs.round })
    .from(jobs)
    .where(inArray(jobs.id, jobIds));
  const roundById = new Map(rounds.map((r) => [r.id, r.round]));
  const rows = await db()
    .select()
    .from(previews)
    .where(inArray(previews.jobId, jobIds))
    .orderBy(previews.slot);
  return rows.filter((p) => roundById.get(p.jobId) === p.round);
}

export async function listJobsForDesign(shopId: string, designId: string, limit = 5): Promise<Job[]> {
  return db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.shopId, shopId), eq(jobs.designId, designId)))
    .orderBy(sql`${jobs.createdAt} DESC`)
    .limit(limit);
}
