import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { db, designs, jobs, orders, previews } from '../db';

export interface DashboardStats {
  liveDesigns: number;
  /** Preview slots created since local midnight (round 1 and regenerations alike). */
  previewsToday: number;
  ordersNeedingAttention: number;
  jobsInProgress: number;
}

/** Four cheap counts for the admin dashboard tiles. */
export async function getDashboardStats(shopId: string): Promise<DashboardStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [[live], [today], [attention], [inProgress]] = await Promise.all([
    db()
      .select({ n: count() })
      .from(designs)
      .where(and(eq(designs.shopId, shopId), eq(designs.status, 'live'))),
    db()
      .select({ n: count() })
      .from(previews)
      .innerJoin(jobs, eq(jobs.id, previews.jobId))
      .where(and(eq(jobs.shopId, shopId), gte(previews.createdAt, startOfDay))),
    db()
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.shopId, shopId), eq(orders.status, 'needs_attention'))),
    db()
      .select({ n: count() })
      .from(jobs)
      .where(and(eq(jobs.shopId, shopId), inArray(jobs.status, ['queued', 'generating']))),
  ]);

  return {
    liveDesigns: live?.n ?? 0,
    previewsToday: today?.n ?? 0,
    ordersNeedingAttention: attention?.n ?? 0,
    jobsInProgress: inProgress?.n ?? 0,
  };
}
