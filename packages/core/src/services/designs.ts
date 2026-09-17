import { randomUUID } from 'node:crypto';
import { type DesignConfig, type DesignConfigInput, DesignConfigSchema } from '@aiart/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { type Design, type DesignVersion, db, designs, designVersions } from '../db';

export async function listDesigns(shopId: string): Promise<Design[]> {
  return db().select().from(designs).where(eq(designs.shopId, shopId)).orderBy(desc(designs.createdAt));
}

export async function getDesign(shopId: string, designId: string): Promise<Design | undefined> {
  const [row] = await db()
    .select()
    .from(designs)
    .where(and(eq(designs.id, designId), eq(designs.shopId, shopId)));
  return row;
}

export async function listVersions(designId: string): Promise<DesignVersion[]> {
  return db()
    .select()
    .from(designVersions)
    .where(eq(designVersions.designId, designId))
    .orderBy(desc(designVersions.version));
}

export async function getVersion(versionId: string): Promise<DesignVersion | undefined> {
  const [row] = await db().select().from(designVersions).where(eq(designVersions.id, versionId));
  return row;
}

/** The version the storefront should use right now, or undefined if nothing is published. */
export async function getLiveVersion(shopId: string, designId: string): Promise<DesignVersion | undefined> {
  const design = await getDesign(shopId, designId);
  if (!design?.liveVersionId) return undefined;
  return getVersion(design.liveVersionId);
}

export interface CreateDesignInput {
  shopId: string;
  slug: string;
  name: string;
  type: Design['type'];
  shopifyProductIds: string[];
  config: DesignConfigInput;
}

export async function createDesign(
  input: CreateDesignInput,
): Promise<{ designId: string; versionId: string }> {
  const config = DesignConfigSchema.parse(input.config);
  const designId = randomUUID();
  const versionId = await db().transaction(async (tx) => {
    await tx.insert(designs).values({
      id: designId,
      shopId: input.shopId,
      slug: input.slug,
      name: input.name,
      type: input.type,
      status: 'draft',
      shopifyProductIds: input.shopifyProductIds,
    });
    const [version] = await tx
      .insert(designVersions)
      .values({ designId, version: 1, status: 'draft', config })
      .returning({ id: designVersions.id });
    return version!.id;
  });
  return { designId, versionId };
}

/** Saves a new draft. If the design has a current draft it is superseded, not overwritten, so history is kept. */
export async function saveDraft(
  designId: string,
  config: DesignConfigInput,
  note?: string,
): Promise<{ versionId: string; version: number }> {
  const parsed = DesignConfigSchema.parse(config);
  return db().transaction(async (tx) => {
    const [latest] = await tx
      .select({ version: designVersions.version })
      .from(designVersions)
      .where(eq(designVersions.designId, designId))
      .orderBy(desc(designVersions.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;
    await tx
      .update(designVersions)
      .set({ status: 'superseded' })
      .where(and(eq(designVersions.designId, designId), eq(designVersions.status, 'draft')));
    const [created] = await tx
      .insert(designVersions)
      .values({ designId, version: nextVersion, status: 'draft', config: parsed, note })
      .returning({ id: designVersions.id });
    return { versionId: created!.id, version: nextVersion };
  });
}

export async function publishVersion(designId: string, versionId: string): Promise<void> {
  await db().transaction(async (tx) => {
    await tx
      .update(designVersions)
      .set({ status: 'superseded' })
      .where(and(eq(designVersions.designId, designId), eq(designVersions.status, 'published')));
    await tx
      .update(designVersions)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(designVersions.id, versionId));
    await tx
      .update(designs)
      .set({ status: 'live', liveVersionId: versionId })
      .where(eq(designs.id, designId));
  });
}

/** "Revert" is just: copy an old version's config into a fresh draft. */
export async function revertToVersion(designId: string, versionId: string): Promise<{ versionId: string }> {
  const source = await getVersion(versionId);
  if (!source) throw new Error(`Version ${versionId} not found`);
  const config = source.config as DesignConfig;
  const created = await saveDraft(designId, config, `Reverted from version ${source.version}`);
  return { versionId: created.versionId };
}

// ---------------------------------------------------------------- admin: metadata, archive, summaries

import { DESIGN_TYPES } from '@aiart/contracts';
import { inArray } from 'drizzle-orm';

export interface DesignMetaPatch {
  name?: string;
  type?: Design['type'];
  shopifyProductIds?: string[];
}

/** Edits the design's own fields (not its versioned config). Unchanged keys are left alone. */
export async function updateDesignMeta(
  shopId: string,
  designId: string,
  patch: DesignMetaPatch,
): Promise<void> {
  const set: Partial<typeof designs.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Name is required');
    set.name = name;
  }
  if (patch.type !== undefined) {
    if (!(DESIGN_TYPES as readonly string[]).includes(patch.type)) throw new Error('Invalid design type');
    set.type = patch.type;
  }
  if (patch.shopifyProductIds !== undefined) {
    set.shopifyProductIds = patch.shopifyProductIds.map((id) => id.trim()).filter(Boolean);
  }
  if (Object.keys(set).length === 0) return;
  await db()
    .update(designs)
    .set(set)
    .where(and(eq(designs.id, designId), eq(designs.shopId, shopId)));
}

/** An archived design keeps its versions but disappears from the storefront (the proxy 404s it). */
export async function archiveDesign(shopId: string, designId: string): Promise<void> {
  await db()
    .update(designs)
    .set({ status: 'archived' })
    .where(and(eq(designs.id, designId), eq(designs.shopId, shopId)));
}

export async function restoreDesign(shopId: string, designId: string): Promise<void> {
  const design = await getDesign(shopId, designId);
  if (!design) throw new Error(`Design ${designId} not found`);
  await db()
    .update(designs)
    .set({ status: design.liveVersionId ? 'live' : 'draft' })
    .where(eq(designs.id, designId));
}

export interface DesignSummary extends Design {
  /** First example image of the live version (or the latest version), for list thumbnails. */
  thumbnailKey: string | null;
  versionCount: number;
  liveVersion: number | null;
  latestVersion: number | null;
}

/** Designs with the per-version facts the list screen shows, in two queries regardless of count. */
export async function listDesignSummaries(shopId: string): Promise<DesignSummary[]> {
  const rows = await listDesigns(shopId);
  if (rows.length === 0) return [];
  const versions = await db()
    .select({
      id: designVersions.id,
      designId: designVersions.designId,
      version: designVersions.version,
      config: designVersions.config,
    })
    .from(designVersions)
    .where(
      inArray(
        designVersions.designId,
        rows.map((r) => r.id),
      ),
    );

  const byDesign = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = byDesign.get(v.designId) ?? [];
    list.push(v);
    byDesign.set(v.designId, list);
  }

  return rows.map((design) => {
    const list = (byDesign.get(design.id) ?? []).sort((a, b) => b.version - a.version);
    const live = list.find((v) => v.id === design.liveVersionId);
    const latest = list[0];
    const source = (live ?? latest)?.config as DesignConfig | undefined;
    const thumbnailKey = source?.exampleImages[0] ?? source?.referenceImages.scene ?? null;
    return {
      ...design,
      thumbnailKey,
      versionCount: list.length,
      liveVersion: live?.version ?? null,
      latestVersion: latest?.version ?? null,
    };
  });
}
