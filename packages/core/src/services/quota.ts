import { redisConnection } from '../queue';

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Atomically increments a shop's daily preview counter and reports whether it is still under
 * `limit`. Counts both round-1 previews and regenerations, so cost is bounded regardless of how
 * customers reach it. Keys expire after 2 days so nothing needs a separate cleanup job.
 */
export async function tryConsumeDailyPreviewQuota(
  shopId: string,
  cost: number,
  limit: number,
): Promise<{ allowed: boolean; used: number }> {
  if (limit <= 0) return { allowed: true, used: 0 };
  const key = `quota:previews:${shopId}:${dayKey()}`;
  const redis = redisConnection();
  const used = await redis.incrby(key, cost);
  if (used === cost) await redis.expire(key, 2 * 24 * 3600);
  if (used > limit) {
    await redis.decrby(key, cost);
    return { allowed: false, used: used - cost };
  }
  return { allowed: true, used };
}
