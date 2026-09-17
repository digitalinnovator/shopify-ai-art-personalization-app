import { eq } from 'drizzle-orm';
import { db, providerSettings } from '../db';
import { listProviders, registerLiveProviders } from '../providers';

export interface ProviderStatus {
  id: string;
  /** True once an adapter has registered itself (Section B adapters only do this when their API key is set). */
  configured: boolean;
  enabled: boolean;
}

export async function listProviderStatuses(shopId: string): Promise<ProviderStatus[]> {
  // The API and worker register live adapters at startup; the admin panel does not, so make
  // sure the registry reflects the keys in .env before reporting what is configured.
  registerLiveProviders();
  const rows = await db().select().from(providerSettings).where(eq(providerSettings.shopId, shopId));
  const enabledById = new Map(rows.map((r) => [r.providerId, r.enabled]));
  return listProviders().map((p) => ({ id: p.id, configured: true, enabled: enabledById.get(p.id) ?? true }));
}

export async function isProviderEnabled(shopId: string, providerId: string): Promise<boolean> {
  registerLiveProviders();
  if (!listProviders().some((p) => p.id === providerId)) return false;
  const [row] = await db()
    .select({ enabled: providerSettings.enabled })
    .from(providerSettings)
    .where(eq(providerSettings.shopId, shopId));
  return row?.enabled ?? true;
}

export async function setProviderEnabled(
  shopId: string,
  providerId: string,
  enabled: boolean,
): Promise<void> {
  await db()
    .insert(providerSettings)
    .values({ shopId, providerId, enabled })
    .onConflictDoUpdate({
      target: [providerSettings.shopId, providerSettings.providerId],
      set: { enabled, updatedAt: new Date() },
    });
}
