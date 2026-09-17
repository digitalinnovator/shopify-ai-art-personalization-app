import { randomUUID } from 'node:crypto';
import {
  CONSENT_VERSION,
  type DesignConfigInput,
  DesignConfigSchema,
  type DesignType,
} from '@aiart/contracts';
import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db, designs, designVersions, providerSettings, uploads } from '../db';
import { syntheticPortrait, syntheticScene, syntheticStyle } from '../images/synthetic';
import { ensureShop } from '../services/shops';
import { putObject, storageKeys } from '../storage';

interface DesignAssets {
  scene?: string;
  style: string[];
  examples: string[];
}

interface DesignSeed {
  slug: string;
  name: string;
  type: DesignType;
  productIds: string[];
  /** Reference images the prompt points at (scene, style). */
  references: (shopId: string, designId: string) => Promise<Omit<DesignAssets, 'examples'>>;
  /** One portrait seed per example image shown in the storefront gallery. */
  exampleSeeds: number[];
  /** Renders one example result for a portrait seed. */
  example: (portraitSeed: number) => Promise<Buffer>;
  published: (a: DesignAssets) => DesignConfigInput;
  draft: (a: DesignAssets) => DesignConfigInput;
}

async function store(key: string, body: Buffer, contentType: string): Promise<string> {
  await putObject(key, body, contentType);
  return key;
}

/** Deterministic synthetic inputs, rendered once per process and shared between examples. */
const memo = new Map<string, Promise<Buffer>>();
function once(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  let pending = memo.get(key);
  if (!pending) {
    pending = render();
    memo.set(key, pending);
  }
  return pending;
}
const knightScene = () => once('knight-scene', () => syntheticScene({ seed: 11 }));
const watercolorStyleA = () =>
  once('watercolor-style-a', () => syntheticStyle({ seed: 21, hues: [190, 210, 330] }));
const watercolorStyleB = () =>
  once('watercolor-style-b', () => syntheticStyle({ seed: 22, hues: [20, 90, 280] }));

/** Example result shown in the storefront block: the portrait placed into the scene. */
async function exampleComposite(scene: Buffer, portraitSeed: number): Promise<Buffer> {
  const portrait = await syntheticPortrait({ seed: portraitSeed, width: 480, height: 600, format: 'png' });
  return sharp(scene)
    .resize(768, 960, { fit: 'cover' })
    .composite([{ input: portrait, gravity: 'south', blend: 'over' }])
    .modulate({ saturation: 1.15 })
    .jpeg({ quality: 85 })
    .toBuffer();
}

const DESIGNS: DesignSeed[] = [
  {
    slug: 'storybook-knight',
    name: 'Storybook Knight Portrait',
    type: 'face_into_scene',
    // Linked to real Shopify products from the design editor; the seed does not invent product ids.
    productIds: [],
    references: async (shopId, designId) => ({
      scene: await store(
        storageKeys.designAsset(shopId, designId, 'scene.png'),
        await knightScene(),
        'image/png',
      ),
      style: [
        await store(
          storageKeys.designAsset(shopId, designId, 'style-1.png'),
          await syntheticStyle({ seed: 12, hues: [25, 45, 210] }),
          'image/png',
        ),
      ],
    }),
    exampleSeeds: [101, 103, 104],
    example: async (portraitSeed) => exampleComposite(await knightScene(), portraitSeed),
    published: (a) => ({
      prompt:
        'Place the person from the customer photo as the knight in the scene image. Match the storybook illustration style of the style image: soft ink outlines and warm watercolor washes. Show the knight from the chest up, facing the viewer, holding a small banner.',
      referenceImages: { scene: a.scene, style: a.style },
      exampleImages: a.examples,
      slots: [
        { slot: 'A', provider: 'mock', model: 'mock-illustrate', seed: 1001 },
        {
          slot: 'B',
          provider: 'mock',
          model: 'mock-painterly',
          seed: 2002,
          promptSuffix: 'Offer a painterly variation with a slightly different pose.',
        },
      ],
      output: { aspectRatio: '4:5', finalLongEdge: 1600, previewLongEdge: 768 },
      limits: { regenerationsPerSession: 1 },
    }),
    draft: (a) => ({
      prompt:
        'Place the person from the customer photo as the knight in the scene image. Match the storybook illustration style of the style image: soft ink outlines and warm watercolor washes. Set the scene at golden hour. Show the knight from the chest up, facing the viewer.',
      referenceImages: { scene: a.scene, style: a.style },
      exampleImages: a.examples,
      slots: [
        { slot: 'A', provider: 'mock', model: 'mock-illustrate', seed: 1001 },
        { slot: 'B', provider: 'mock', model: 'mock-painterly', seed: 2003 },
      ],
      output: { aspectRatio: '4:5', finalLongEdge: 1600, previewLongEdge: 768 },
      limits: { regenerationsPerSession: 1 },
    }),
  },
  {
    slug: 'watercolor-portrait',
    name: 'Watercolor Portrait',
    type: 'style_transfer',
    // Linked to real Shopify products from the design editor; the seed does not invent product ids.
    productIds: [],
    references: async (shopId, designId) => ({
      style: [
        await store(
          storageKeys.designAsset(shopId, designId, 'style-1.png'),
          await watercolorStyleA(),
          'image/png',
        ),
        await store(
          storageKeys.designAsset(shopId, designId, 'style-2.png'),
          await watercolorStyleB(),
          'image/png',
        ),
      ],
    }),
    exampleSeeds: [102, 105, 106],
    example: async (portraitSeed) =>
      sharp(await syntheticPortrait({ seed: portraitSeed, width: 768, height: 768 }))
        .composite([
          {
            input: await sharp(await watercolorStyleA())
              .resize(768, 768)
              .toBuffer(),
            blend: 'soft-light',
          },
        ])
        .jpeg({ quality: 85 })
        .toBuffer(),
    published: (a) => ({
      prompt:
        'Repaint the customer photo as a loose watercolor portrait in the style of the style images. Keep the composition of the photo. Use a white paper background with soft, bleeding edges.',
      referenceImages: { style: a.style },
      exampleImages: a.examples,
      slots: [
        { slot: 'A', provider: 'mock', model: 'mock-watercolor', seed: 3001 },
        {
          slot: 'B',
          provider: 'mock',
          model: 'mock-watercolor',
          seed: 3002,
          promptSuffix: 'Use a cooler palette.',
        },
      ],
      output: { aspectRatio: '1:1', finalLongEdge: 1600, previewLongEdge: 768 },
      limits: { regenerationsPerSession: 1 },
    }),
    draft: (a) => ({
      prompt:
        'Repaint the customer photo as a loose watercolor portrait in the style of the style images. Keep the composition of the photo. Use visible paper texture and a single accent color.',
      referenceImages: { style: a.style },
      exampleImages: a.examples,
      slots: [
        { slot: 'A', provider: 'mock', model: 'mock-watercolor', seed: 3001 },
        { slot: 'B', provider: 'mock', model: 'mock-painterly', seed: 3003 },
      ],
      output: { aspectRatio: '1:1', finalLongEdge: 1600, previewLongEdge: 768 },
      limits: { regenerationsPerSession: 1 },
    }),
  },
];

/** Renders and stores the example images from index `from` onwards; keys are fixed per index. */
async function storeExamples(
  spec: DesignSeed,
  shopId: string,
  designId: string,
  from = 0,
): Promise<string[]> {
  const keys: string[] = [];
  for (const [i, portraitSeed] of spec.exampleSeeds.entries()) {
    if (i < from) continue;
    keys.push(
      await store(
        storageKeys.designAsset(shopId, designId, `example-${i + 1}.jpg`),
        await spec.example(portraitSeed),
        'image/jpeg',
      ),
    );
  }
  return keys;
}

/**
 * Earlier seeds shipped a single example image. Give an already seeded design the full gallery
 * without touching anything else in its versions (prompts, slots and reference images stay).
 */
async function ensureExampleImages(spec: DesignSeed, shopId: string, designId: string): Promise<number> {
  const versions = await db()
    .select({ id: designVersions.id, config: designVersions.config })
    .from(designVersions)
    .where(eq(designVersions.designId, designId));
  const short = versions.filter((v) => v.config.exampleImages.length < spec.exampleSeeds.length);
  if (short.length === 0) return 0;

  const have = Math.min(...short.map((v) => v.config.exampleImages.length));
  const added = await storeExamples(spec, shopId, designId, have);
  for (const v of short) {
    const exampleImages = [...v.config.exampleImages, ...added.slice(v.config.exampleImages.length - have)];
    await db()
      .update(designVersions)
      .set({ config: { ...v.config, exampleImages } })
      .where(eq(designVersions.id, v.id));
  }
  return added.length;
}

export interface SeedResult {
  shopId: string;
  designs: { slug: string; id: string; created: boolean }[];
  samplesCreated: number;
  /** Example images added to designs that already existed. */
  examplesAdded: number;
}

/** Idempotent: existing designs and samples are left alone (apart from filling in example images). */
export async function seed(domain: string): Promise<SeedResult> {
  const shopId = (await ensureShop(domain)).id;
  await db()
    .insert(providerSettings)
    .values({ shopId, providerId: 'mock', enabled: true })
    .onConflictDoNothing();

  const seeded: SeedResult['designs'] = [];
  let examplesAdded = 0;
  for (const spec of DESIGNS) {
    const [existing] = await db()
      .select({ id: designs.id })
      .from(designs)
      .where(and(eq(designs.shopId, shopId), eq(designs.slug, spec.slug)));
    if (existing) {
      examplesAdded += await ensureExampleImages(spec, shopId, existing.id);
      seeded.push({ slug: spec.slug, id: existing.id, created: false });
      continue;
    }
    const designId = randomUUID();
    const assets: DesignAssets = {
      ...(await spec.references(shopId, designId)),
      examples: await storeExamples(spec, shopId, designId),
    };
    await db().transaction(async (tx) => {
      await tx.insert(designs).values({
        id: designId,
        shopId,
        slug: spec.slug,
        name: spec.name,
        type: spec.type,
        status: 'live',
        shopifyProductIds: spec.productIds,
      });
      const [published] = await tx
        .insert(designVersions)
        .values({
          designId,
          version: 1,
          status: 'published',
          config: DesignConfigSchema.parse(spec.published(assets)),
          note: 'Seeded launch version',
          publishedAt: new Date(),
        })
        .returning({ id: designVersions.id });
      await tx.insert(designVersions).values({
        designId,
        version: 2,
        status: 'draft',
        config: DesignConfigSchema.parse(spec.draft(assets)),
        note: 'Seeded draft, try it with a test run',
      });
      await tx.update(designs).set({ liveVersionId: published?.id }).where(eq(designs.id, designId));
    });
    seeded.push({ slug: spec.slug, id: designId, created: true });
  }

  const [{ count } = { count: 0 }] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(uploads)
    .where(and(eq(uploads.shopId, shopId), eq(uploads.isSample, true)));
  let samplesCreated = 0;
  if (count === 0) {
    for (const [i, portraitSeed] of [201, 202, 203].entries()) {
      const id = randomUUID();
      const photo = await syntheticPortrait({ seed: portraitSeed });
      const meta = await sharp(photo).metadata();
      const key = storageKeys.uploadPhoto(shopId, id);
      await putObject(key, photo, 'image/jpeg');
      await db()
        .insert(uploads)
        .values({
          id,
          shopId,
          sessionId: 'admin-samples',
          source: 'admin_test',
          isSample: true,
          label: `Sample portrait ${i + 1}`,
          storageKey: key,
          status: 'validated',
          mime: 'image/jpeg',
          bytes: photo.length,
          width: meta.width,
          height: meta.height,
          consentAt: new Date(),
          consentVersion: CONSENT_VERSION,
        });
      samplesCreated++;
    }
  }

  return { shopId, designs: seeded, samplesCreated, examplesAdded };
}
