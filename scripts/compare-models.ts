#!/usr/bin/env -S node --import tsx
/**
 * Runs every configured provider's models against the seeded sample photos for each live design,
 * and writes a side-by-side HTML report to `reports/`.
 *
 *   pnpm compare-models
 *
 * With no real provider keys set, this still runs against the `mock` provider — useful for
 * sanity-checking the report format and the template/prompt assembly before spending real money.
 * Once `FAL_KEY` (or another provider's key) is set, add its models to `CANDIDATES` below and
 * re-run; each design's own slots are unaffected — this script generates *extra* previews for
 * comparison, it does not change what a design serves live.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesignConfig } from '@aiart/contracts';
import { config } from '@aiart/core/config';
import { closeDb, db, shops } from '@aiart/core/db';
import type { GeneratedImage, ResolvedImage } from '@aiart/core/providers';
import { getProvider, registerLiveProviders } from '@aiart/core/providers';
import { closeRedisConnection } from '@aiart/core/queue';
import { listDesigns, listSampleUploads, listVersions } from '@aiart/core/services';
import { getObject } from '@aiart/core/storage';
import { buildGenerationRequest } from '@aiart/core/templates';
import { eq } from 'drizzle-orm';

/** Add a { provider, model } pair here once you have that provider's key set in `.env`. */
const CANDIDATES: { provider: string; model: string }[] = [
  { provider: 'mock', model: 'mock-illustrate' },
  { provider: 'mock', model: 'mock-painterly' },
  // { provider: 'fal', model: 'fal-ai/flux-2-pro/edit' },
  // { provider: 'fal', model: 'fal-ai/nano-banana-2/edit' },
];

interface Result {
  designName: string;
  photoLabel: string;
  provider: string;
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
  imageDataUri?: string;
}

function mimeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function resolveImages(designConfig: DesignConfig, subjectKey: string): Promise<ResolvedImage[]> {
  const images: ResolvedImage[] = [];
  const subject = await getObject(subjectKey);
  if (subject) images.push({ role: 'subject', bytes: subject, contentType: mimeFromKey(subjectKey) });
  if (designConfig.referenceImages.scene) {
    const bytes = await getObject(designConfig.referenceImages.scene);
    if (bytes)
      images.push({ role: 'scene', bytes, contentType: mimeFromKey(designConfig.referenceImages.scene) });
  }
  for (const key of designConfig.referenceImages.style) {
    const bytes = await getObject(key);
    if (bytes) images.push({ role: 'style', bytes, contentType: mimeFromKey(key) });
  }
  return images;
}

async function runOne(
  designName: string,
  photoLabel: string,
  designConfig: DesignConfig,
  subjectKey: string,
  candidate: { provider: string; model: string },
): Promise<Result> {
  const base = { designName, photoLabel, provider: candidate.provider, model: candidate.model };
  const provider = getProvider(candidate.provider);
  if (!provider)
    return { ...base, ok: false, ms: 0, error: `provider "${candidate.provider}" is not configured` };

  const images = await resolveImages(designConfig, subjectKey);
  const request = buildGenerationRequest(
    designConfig,
    { ...designConfig.slots[0]!, provider: candidate.provider, model: candidate.model },
    subjectKey,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const started = Date.now();
  try {
    const result = await provider.submit(candidate.model, request, {
      images,
      webhookUrl: `${config('api').WEBHOOK_PUBLIC_URL ?? config('api').API_PUBLIC_URL}/webhooks/ai/${candidate.provider}`,
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    if (result.kind === 'completed') {
      const image = result.images[0] as GeneratedImage | undefined;
      return {
        ...base,
        ok: true,
        ms,
        imageDataUri: image
          ? `data:${image.contentType};base64,${image.bytes.toString('base64')}`
          : undefined,
      };
    }
    if (result.kind === 'refused') return { ...base, ok: false, ms, error: `refused: ${result.message}` };
    return {
      ...base,
      ok: false,
      ms,
      error: `provider returned "pending" — this script only compares synchronous results (poll ${result.pollUrl} manually)`,
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function renderReport(results: Result[]): string {
  const byPhoto = new Map<string, Result[]>();
  for (const r of results) {
    const key = `${r.designName} — ${r.photoLabel}`;
    (byPhoto.get(key) ?? byPhoto.set(key, []).get(key)!).push(r);
  }
  const rows = [...byPhoto.entries()]
    .map(
      ([label, rs]) => `
      <tr>
        <th style="text-align:left;padding:8px">${label}</th>
        ${rs
          .map(
            (r) => `<td style="padding:8px;vertical-align:top">
              <div style="font-size:12px;color:#555">${r.provider}/${r.model} — ${r.ok ? `${r.ms}ms` : 'failed'}</div>
              ${r.imageDataUri ? `<img src="${r.imageDataUri}" style="width:180px;border-radius:8px" />` : `<div style="width:180px;padding:12px;background:#f8e1e6;color:#b3364f;border-radius:8px;font-size:12px">${r.error}</div>`}
            </td>`,
          )
          .join('')}
      </tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Model comparison</title></head>
    <body style="font-family:system-ui;margin:24px">
      <h1>Model comparison</h1>
      <p>${new Date().toISOString()}</p>
      <table style="border-collapse:collapse">${rows}</table>
    </body></html>`;
}

async function main(): Promise<void> {
  registerLiveProviders();
  const shopDomain = config('shopify').DEV_SHOP_DOMAIN;
  const [shop] = await db().select().from(shops).where(eq(shops.domain, shopDomain));
  if (!shop) {
    console.error(`No shop found for ${shopDomain}. Run \`pnpm bootstrap\` first.`);
    process.exit(1);
  }

  const designs = (await listDesigns(shop.id)).filter((d) => d.status === 'live');
  const samples = await listSampleUploads(shop.id);
  if (designs.length === 0 || samples.length === 0) {
    console.error('Need at least one live design and one sample photo — run `pnpm db:seed`.');
    process.exit(1);
  }

  const results: Result[] = [];
  for (const design of designs) {
    const versions = await listVersions(design.id);
    const version = versions.find((v) => v.id === design.liveVersionId) ?? versions[0];
    if (!version) continue;
    const designConfig = version.config as DesignConfig;
    for (const sample of samples) {
      for (const candidate of CANDIDATES) {
        console.log(
          `  ${design.name} × ${sample.label ?? sample.id} × ${candidate.provider}/${candidate.model}…`,
        );
        results.push(
          await runOne(design.name, sample.label ?? sample.id, designConfig, sample.storageKey, candidate),
        );
      }
    }
  }

  mkdirSync('reports', { recursive: true });
  const outPath = join('reports', `model-comparison-${Date.now()}.html`);
  writeFileSync(outPath, renderReport(results));
  console.log(`\nWrote ${outPath} (${results.filter((r) => r.ok).length}/${results.length} succeeded)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedisConnection();
    await closeDb();
  });
