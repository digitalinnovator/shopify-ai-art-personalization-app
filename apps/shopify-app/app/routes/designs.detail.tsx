import {
  ASPECT_RATIOS,
  DESIGN_TYPES,
  type DesignConfig,
  type DesignConfigInput,
  DesignConfigSchema,
  estimateSessionCost,
  formatUsd,
  PRICES_VERIFIED_ON,
  PROVIDERS,
  UPLOAD_FORMATS,
} from '@aiart/contracts';
import type { Design, DesignVersion } from '@aiart/core/db';
import {
  archiveDesign,
  createJob,
  getDesign,
  listJobsForDesign,
  listProviderStatuses,
  listSampleUploads,
  listVersions,
  publishVersion,
  restoreDesign,
  revertToVersion,
  saveDraft,
  updateDesignMeta,
} from '@aiart/core/services';
import { presignDownload, putObject, storageKeys } from '@aiart/core/storage';
import { useState } from 'react';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router';
import { StatusBadge } from '../components/Badge';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card, CardSection } from '../components/Card';
import { Checkbox, CheckboxGroup, NumberField, Select, TextArea, TextField } from '../components/fields';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';
import { ConfirmButton } from '../components/Modal';
import { ActionBar, Page } from '../components/Page';
import { SlotModelPicker, type SlotSelection } from '../components/SlotModelPicker';
import { useActionToast } from '../components/Toast';
import { requireShop } from '../lib/auth.server';
import { formatDate, formatDay, formatRelative } from '../lib/format';
import { designTypeLabel } from '../lib/status';
import { type ToastData, toastData, toastFromSearch } from '../lib/toast';
import { designFieldName, type FieldErrors, fieldErrorsFromIssues } from '../lib/validation';

const SIGNING = { expiresSeconds: 3600, stableForSeconds: 900 };
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const EXT_BY_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function pickEditableVersion(versions: DesignVersion[]): DesignVersion | undefined {
  return (
    versions.find((v) => v.status === 'draft') ??
    versions.find((v) => v.status === 'published') ??
    versions[0]
  );
}

async function signAll(keys: string[]): Promise<{ key: string; url: string | null }[]> {
  return Promise.all(
    keys.map(async (key) => ({ key, url: await presignDownload(key, SIGNING).catch(() => null) })),
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const design = await getDesign(shop.id, params.designId ?? '');
  if (!design) throw new Response('Design not found', { status: 404 });
  const [versions, samples, providers, recentJobs] = await Promise.all([
    listVersions(design.id),
    listSampleUploads(shop.id),
    listProviderStatuses(shop.id),
    listJobsForDesign(shop.id, design.id, 5),
  ]);
  const editable = pickEditableVersion(versions);
  const config = (editable?.config ?? {}) as Partial<DesignConfig>;
  const live = versions.find((v) => v.id === design.liveVersionId);
  const images = {
    scene: config.referenceImages?.scene
      ? ((await signAll([config.referenceImages.scene]))[0] ?? null)
      : null,
    style: await signAll(config.referenceImages?.style ?? []),
    examples: await signAll(config.exampleImages ?? []),
  };
  return {
    design,
    versions,
    editable,
    liveVersion: live?.version ?? null,
    samples: samples.map((s) => ({ id: s.id, label: s.label ?? 'Sample photo' })),
    // Every provider the catalog knows, marked with whether its key is present in .env.
    providers: PROVIDERS.map((p) => {
      const status = providers.find((s) => s.id === p.id);
      return {
        id: p.id,
        label: p.label,
        envKey: p.envKey,
        configured: Boolean(status),
        enabled: status?.enabled ?? false,
      };
    }),
    images,
    recentTests: recentJobs
      .filter((j) => j.source === 'admin_test')
      .map((j) => ({ id: j.id, status: j.status, createdAt: j.createdAt })),
    toast: toastFromSearch(request.url),
  };
}

function csv(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSlotSettings(
  raw: FormDataEntryValue | null,
  field: string,
  errors: FieldErrors,
): Record<string, unknown> {
  const text = String(raw ?? '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    errors[field] = 'Advanced settings must be a JSON object, for example {} or {"simulate":"refusal"}.';
    return {};
  }
}

function buildConfig(form: FormData, errors: FieldErrors): DesignConfigInput {
  const slot = (letter: 'A' | 'B') => ({
    slot: letter,
    provider: String(form.get(`slot${letter}_provider`) ?? 'mock'),
    model: String(form.get(`slot${letter}_model`) ?? ''),
    promptSuffix: String(form.get(`slot${letter}_promptSuffix`) ?? ''),
    seed: form.get(`slot${letter}_seed`) ? Number(form.get(`slot${letter}_seed`)) : undefined,
    settings: parseSlotSettings(form.get(`slot${letter}_settings`), `slot${letter}_settings`, errors),
  });
  return {
    prompt: String(form.get('prompt') ?? ''),
    preserve: csv(form.get('preserve')),
    avoid: csv(form.get('avoid')),
    referenceImages: {
      scene: String(form.get('sceneKey') ?? '').trim() || undefined,
      style: csv(form.get('styleKeys')),
    },
    exampleImages: csv(form.get('exampleKeys')),
    slots: [slot('A'), slot('B')],
    output: {
      aspectRatio: String(form.get('output_aspectRatio') ?? '4:5') as DesignConfig['output']['aspectRatio'],
      finalLongEdge: Number(form.get('output_finalLongEdge') ?? 2048),
      previewLongEdge: Number(form.get('output_previewLongEdge') ?? 768),
      watermarkPreview: form.get('output_watermarkPreview') === 'on',
      format: String(form.get('output_format') ?? 'png') as DesignConfig['output']['format'],
    },
    limits: { regenerationsPerSession: Number(form.get('limits_regenerationsPerSession') ?? 1) },
    uploadRules: {
      maxBytes: Math.round(Number(form.get('uploadRules_maxMb') ?? 15) * 1024 * 1024),
      minShortEdge: Number(form.get('uploadRules_minShortEdge') ?? 512),
      formats: UPLOAD_FORMATS.filter((f) => form.get(`uploadRules_format_${f}`) === 'on'),
      minSharpness: Number(form.get('uploadRules_minSharpness') ?? 4),
      requireSingleFace: form.get('uploadRules_requireSingleFace') === 'on',
    },
  };
}

/** Stores the uploaded reference images and returns their storage keys. Problems land in `errors`. */
async function storeUploads(
  shopId: string,
  designId: string,
  role: 'scene' | 'style' | 'example',
  entries: FormDataEntryValue[],
  field: string,
  errors: FieldErrors,
): Promise<string[]> {
  const keys: string[] = [];
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);
  for (const [i, file] of files.entries()) {
    const ext = EXT_BY_MIME.get(file.type);
    if (!ext) {
      errors[field] = `${file.name} is not a JPEG, PNG or WebP image.`;
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      errors[field] = `${file.name} is larger than 10 MB.`;
      continue;
    }
    const key = storageKeys.designAsset(shopId, designId, `${role}-${Date.now()}-${i + 1}.${ext}`);
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
    keys.push(key);
  }
  return keys;
}

type ActionResult = { errors: FieldErrors; toast: ToastData };

export async function action({ request, params }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const design = await getDesign(shop.id, params.designId ?? '');
  if (!design) throw new Response('Design not found', { status: 404 });
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'save');
  const ok = (message: string): ActionResult => ({ errors: {}, toast: toastData('success', message) });

  if (intent === 'revert') {
    await revertToVersion(design.id, String(form.get('versionId') ?? ''));
    return ok('Copied that version into a new draft.');
  }
  if (intent === 'archive') {
    await archiveDesign(shop.id, design.id);
    return ok('Design archived. It no longer appears on the storefront.');
  }
  if (intent === 'restore') {
    await restoreDesign(shop.id, design.id);
    return ok('Design restored.');
  }

  const errors: FieldErrors = {};

  // Design metadata (not versioned).
  const name = String(form.get('name') ?? design.name).trim();
  if (!name) errors.name = 'Give the design a name.';
  const typeValue = String(form.get('type') ?? design.type);
  const type = (DESIGN_TYPES as readonly string[]).includes(typeValue)
    ? (typeValue as Design['type'])
    : design.type;

  // Reference images: uploaded files are stored first, then appended to the kept keys.
  const sceneUploaded = await storeUploads(
    shop.id,
    design.id,
    'scene',
    form.getAll('sceneFile'),
    'sceneKey',
    errors,
  );
  const styleUploaded = await storeUploads(
    shop.id,
    design.id,
    'style',
    form.getAll('styleFiles'),
    'styleKeys',
    errors,
  );
  const exampleUploaded = await storeUploads(
    shop.id,
    design.id,
    'example',
    form.getAll('exampleFiles'),
    'exampleKeys',
    errors,
  );

  const built = buildConfig(form, errors);
  if (sceneUploaded[0]) built.referenceImages = { ...built.referenceImages, scene: sceneUploaded[0] };
  built.referenceImages = {
    ...built.referenceImages,
    style: [...(built.referenceImages?.style ?? []), ...styleUploaded],
  };
  built.exampleImages = [...(built.exampleImages ?? []), ...exampleUploaded];

  const parsed = DesignConfigSchema.safeParse(built);
  if (!parsed.success) {
    // Field-level errors found earlier (bad JSON, bad upload) win over the schema's message.
    for (const [field, message] of Object.entries(
      fieldErrorsFromIssues(parsed.error.issues, designFieldName),
    )) {
      errors[field] ??= message;
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) {
    return data<ActionResult>(
      { errors, toast: toastData('critical', 'Fix the highlighted fields and try again.') },
      { status: 400 },
    );
  }

  await updateDesignMeta(shop.id, design.id, {
    name,
    type,
    shopifyProductIds: lines(form.get('shopifyProductIds')),
  });
  const note = String(form.get('note') ?? '').trim() || undefined;
  const { versionId, version } = await saveDraft(design.id, built, note);

  if (intent === 'publish') {
    await publishVersion(design.id, versionId);
    return ok(`Published v${version}. The storefront now uses it.`);
  }

  if (intent === 'test') {
    const samples = await listSampleUploads(shop.id);
    const chosen = String(form.get('sampleUploadId') ?? '');
    const sample = samples.find((s) => s.id === chosen) ?? samples[0];
    if (!sample) {
      return data<ActionResult>(
        { errors, toast: toastData('critical', 'No sample photos are available for a test run.') },
        { status: 400 },
      );
    }
    const { jobId } = await createJob({
      shopId: shop.id,
      designId: design.id,
      designVersionId: versionId,
      config: parsed.data,
      uploadId: sample.id,
      sessionId: 'admin-test-run',
      source: 'admin_test',
    });
    return redirect(`/generations/${jobId}?toast=test-started`);
  }

  return ok(`Saved as draft v${version}.`);
}

export default function DesignDetail() {
  const { design, versions, editable, liveVersion, samples, providers, images, recentTests, toast } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors: FieldErrors = actionData?.errors ?? {};
  useActionToast(actionData?.toast ?? toast);
  const navigation = useNavigation();
  const submittingIntent =
    navigation.state !== 'idle' ? String(navigation.formData?.get('intent') ?? '') : '';

  const config = (editable?.config ?? {}) as Partial<DesignConfig>;
  const slotA = config.slots?.find((s) => s.slot === 'A');
  const slotB = config.slots?.find((s) => s.slot === 'B');
  // Live copies of the slot choices and the regeneration limit, only for the cost estimate; the
  // form fields themselves stay uncontrolled and are read by the action as before.
  const [slotChoice, setSlotChoice] = useState<Record<'A' | 'B', SlotSelection>>({
    A: { provider: slotA?.provider ?? 'mock', model: slotA?.model ?? '' },
    B: { provider: slotB?.provider ?? 'mock', model: slotB?.model ?? '' },
  });
  const [regenerations, setRegenerations] = useState(config.limits?.regenerationsPerSession ?? 1);
  const estimate = estimateSessionCost(
    [
      { slot: 'A', ...slotChoice.A },
      { slot: 'B', ...slotChoice.B },
    ],
    regenerations,
  );
  const archived = design.status === 'archived';

  return (
    <Page
      backTo="/designs"
      backLabel="Designs"
      title={design.name}
      titleMeta={<StatusBadge status={design.status} kind="design" />}
      subtitle={
        editable
          ? `Editing v${editable.version} (${editable.status}). ${liveVersion ? `Live on the storefront: v${liveVersion}.` : 'Not published yet.'}`
          : 'No version yet.'
      }
    >
      {archived ? (
        <Banner tone="warning" title="This design is archived" className="stack">
          It is hidden from the storefront. Restore it from the sidebar to use it again.
        </Banner>
      ) : null}

      <div className="layout-2col" style={{ marginTop: archived ? 16 : 0 }}>
        <Form method="post" encType="multipart/form-data" id="design-form" className="stack">
          <Card title="Details" subtitle="Shown in this admin and used to link the design to products.">
            <div className="stack">
              <TextField label="Name" name="name" defaultValue={design.name} required error={errors.name} />
              <Select
                label="Design type"
                name="type"
                defaultValue={design.type}
                options={DESIGN_TYPES.map((t) => ({ value: t, label: designTypeLabel(t) }))}
                help="Face into scene places the customer into a scene image. Style transfer repaints the photo in a style."
              />
              <TextArea
                label="Linked Shopify products"
                name="shopifyProductIds"
                rows={2}
                defaultValue={design.shopifyProductIds.join('\n')}
                help="One product id per line, for example gid://shopify/Product/1001. The theme block is configured with this design's id."
                mono
              />
            </div>
          </Card>

          <Card
            title="Prompt"
            subtitle="Instructions sent to the model on every generation. Customers never see or change this."
          >
            <div className="stack">
              <TextArea
                label="Prompt"
                name="prompt"
                rows={5}
                required
                defaultValue={config.prompt}
                error={errors.prompt}
                help="Describe the scene or style and how the customer should appear. Be specific about what must stay recognizable."
              />
              <div className="grid-2">
                <TextField
                  label="Keep unchanged"
                  name="preserve"
                  defaultValue={(config.preserve ?? []).join(', ')}
                  help="Comma separated. Added to every prompt as a hard rule."
                  error={errors.preserve}
                />
                <TextField
                  label="Never include"
                  name="avoid"
                  defaultValue={(config.avoid ?? []).join(', ')}
                  help="Comma separated, for example text, watermarks, extra people."
                  error={errors.avoid}
                />
              </div>
            </div>
          </Card>

          <Card
            title="Reference images"
            subtitle="Anchor every result to this design. Uploaded files are stored privately with the design."
          >
            <div className="stack">
              <ImageField
                label="Scene image"
                help="For face-into-scene designs: the illustrated scene the customer is placed into."
                hiddenName="sceneKey"
                fileName="sceneFile"
                items={images.scene ? [images.scene] : []}
                max={1}
                error={errors.sceneKey}
              />
              <ImageField
                label="Style images"
                help="Up to 8 examples of the art style the model should match."
                hiddenName="styleKeys"
                fileName="styleFiles"
                items={images.style}
                multiple
                max={8}
                error={errors.styleKeys}
              />
              <ImageField
                label="Example results"
                help="Up to 6 finished examples shown to customers on the product page before they upload."
                hiddenName="exampleKeys"
                fileName="exampleFiles"
                items={images.examples}
                multiple
                max={6}
                error={errors.exampleKeys}
              />
            </div>
          </Card>

          <Card
            title="Preview slots"
            subtitle="Each customer sees two previews. Give each slot its own model, or the same model with a variation."
          >
            {errors.slots ? (
              <Banner tone="critical" className="stack">
                {errors.slots}
              </Banner>
            ) : null}
            <div className="grid-2" style={{ marginTop: errors.slots ? 16 : 0 }}>
              {(['A', 'B'] as const).map((letter) => {
                const s = letter === 'A' ? slotA : slotB;
                const settingsError = errors[`slot${letter}_settings`];
                return (
                  <div key={letter} className="card card--padded stack" style={{ boxShadow: 'none' }}>
                    <h3 className="card__title">Preview {letter}</h3>
                    <SlotModelPicker
                      letter={letter}
                      initial={{ provider: s?.provider ?? 'mock', model: s?.model ?? '' }}
                      providers={providers}
                      errors={{
                        provider: errors[`slot${letter}_provider`],
                        model: errors[`slot${letter}_model`],
                      }}
                      onChange={(selection) => setSlotChoice((prev) => ({ ...prev, [letter]: selection }))}
                    />
                    <TextField
                      label="Prompt suffix"
                      name={`slot${letter}_promptSuffix`}
                      defaultValue={s?.promptSuffix ?? ''}
                      help="Added to the prompt for this slot only."
                      error={errors[`slot${letter}_promptSuffix`]}
                    />
                    <NumberField
                      label="Seed"
                      name={`slot${letter}_seed`}
                      defaultValue={s?.seed ?? ''}
                      help="Optional. Fixes the random seed where the provider supports it."
                      error={errors[`slot${letter}_seed`]}
                    />
                    <details className="disclosure" open={Boolean(settingsError)}>
                      <summary>
                        <Icon name="chevron-right" size={16} className="icon--chevron" />
                        Advanced settings (JSON)
                      </summary>
                      <div className="disclosure__body">
                        <TextArea
                          label="Provider settings"
                          name={`slot${letter}_settings`}
                          rows={3}
                          mono
                          defaultValue={s?.settings ? JSON.stringify(s.settings) : '{}'}
                          help='Mock keys: "mode" (sync or webhook) and "simulate" (success, temporary_failure, permanent_failure, timeout, refusal).'
                          error={settingsError}
                        />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
            <div className="cost-estimate" aria-live="polite">
              <Icon name="tag" size={18} />
              <div>
                {estimate.perRound !== null && estimate.maxPerSession !== null ? (
                  <p>
                    About <strong>{formatUsd(estimate.perRound)}</strong> per customer for two previews, up to{' '}
                    <strong>{formatUsd(estimate.maxPerSession)}</strong> if they use all {regenerations}{' '}
                    {regenerations === 1 ? 'regeneration' : 'regenerations'}.
                  </p>
                ) : (
                  <p>
                    No cost estimate: preview {estimate.unknownSlots.join(' and ')} uses a model that is not
                    in the catalog, so its price is unknown.
                  </p>
                )}
                <p className="text-xs">
                  Indicative prices checked {formatDay(PRICES_VERIFIED_ON)}. The provider's invoice is the
                  source of truth.
                </p>
              </div>
            </div>
          </Card>

          <Card
            title="Output"
            subtitle="Size and format of the final artwork and the watermarked storefront preview."
          >
            <div className="stack">
              <div className="grid-2">
                <Select
                  label="Aspect ratio"
                  name="output_aspectRatio"
                  defaultValue={config.output?.aspectRatio ?? '4:5'}
                  options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
                  error={errors.output_aspectRatio}
                />
                <Select
                  label="File format"
                  name="output_format"
                  defaultValue={config.output?.format ?? 'png'}
                  options={[
                    { value: 'png', label: 'PNG' },
                    { value: 'jpeg', label: 'JPEG' },
                    { value: 'webp', label: 'WebP' },
                  ]}
                  error={errors.output_format}
                />
                <NumberField
                  label="Final artwork long edge (px)"
                  name="output_finalLongEdge"
                  defaultValue={config.output?.finalLongEdge ?? 2048}
                  min={512}
                  max={4096}
                  error={errors.output_finalLongEdge}
                />
                <NumberField
                  label="Storefront preview long edge (px)"
                  name="output_previewLongEdge"
                  defaultValue={config.output?.previewLongEdge ?? 768}
                  min={256}
                  max={1600}
                  error={errors.output_previewLongEdge}
                />
              </div>
              <Checkbox
                name="output_watermarkPreview"
                defaultChecked={config.output?.watermarkPreview ?? true}
                label="Watermark the storefront preview"
                help="Uses the watermark text and opacity from Settings."
              />
            </div>
          </Card>

          <Card
            title="Limits and upload rules"
            subtitle="What customers may upload and how many attempts they get."
          >
            <div className="stack">
              <NumberField
                label="Regenerations per customer session"
                name="limits_regenerationsPerSession"
                defaultValue={config.limits?.regenerationsPerSession ?? 1}
                min={0}
                max={10}
                onChange={(e) => setRegenerations(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                help="0 means the customer gets exactly two previews and no Try again button. Each regeneration creates two more previews and costs two generations on real providers."
                error={errors.limits_regenerationsPerSession}
              />
              <div className="grid-3">
                <NumberField
                  label="Max photo size (MB)"
                  name="uploadRules_maxMb"
                  step={0.5}
                  min={0.5}
                  defaultValue={(config.uploadRules?.maxBytes ?? 15 * 1024 * 1024) / (1024 * 1024)}
                  error={errors.uploadRules_maxMb}
                />
                <NumberField
                  label="Minimum short edge (px)"
                  name="uploadRules_minShortEdge"
                  defaultValue={config.uploadRules?.minShortEdge ?? 512}
                  min={128}
                  error={errors.uploadRules_minShortEdge}
                />
                <NumberField
                  label="Minimum sharpness"
                  name="uploadRules_minSharpness"
                  step={0.5}
                  min={0}
                  defaultValue={config.uploadRules?.minSharpness ?? 4}
                  help="0 disables the blur check."
                  error={errors.uploadRules_minSharpness}
                />
              </div>
              <CheckboxGroup
                legend="Accepted formats"
                options={UPLOAD_FORMATS.map((f) => ({
                  name: `uploadRules_format_${f}`,
                  label: f.toUpperCase(),
                  defaultChecked: (config.uploadRules?.formats ?? ['jpeg', 'png', 'webp']).includes(f),
                }))}
                error={errors.uploadRules_formats}
              />
              <Checkbox
                name="uploadRules_requireSingleFace"
                defaultChecked={config.uploadRules?.requireSingleFace ?? false}
                label="Require exactly one face in the photo"
                help="No face detector is installed locally, so this check always passes until one is configured."
              />
            </div>
          </Card>
        </Form>

        <aside className="stack layout-2col__side">
          <Card title="Status">
            <dl className="kv">
              <dt>Storefront</dt>
              <dd>
                <StatusBadge status={design.status} kind="design" />
              </dd>
              <dt>Live version</dt>
              <dd>{liveVersion ? `v${liveVersion}` : 'None'}</dd>
              <dt>Editing</dt>
              <dd>{editable ? `v${editable.version} (${editable.status})` : 'None'}</dd>
              <dt>Products</dt>
              <dd>{design.shopifyProductIds.length}</dd>
              <dt>Created</dt>
              <dd>{formatDate(design.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{formatRelative(design.updatedAt)}</dd>
            </dl>
            <hr className="divider" />
            {archived ? (
              <ConfirmButton
                title="Restore this design?"
                message="It will be visible on the storefront again if it has a published version."
                confirmLabel="Restore"
                fields={{ intent: 'restore' }}
                icon="rotate-ccw"
              >
                Restore design
              </ConfirmButton>
            ) : (
              <ConfirmButton
                title="Archive this design?"
                message="Customers will no longer see it on the product page. Existing orders and generations are kept, and you can restore it later."
                confirmLabel="Archive"
                confirmVariant="critical"
                fields={{ intent: 'archive' }}
                variant="plain-critical"
                icon="archive"
              >
                Archive design
              </ConfirmButton>
            )}
          </Card>

          <Card title="Version history" padded={false}>
            {versions.map((v) => (
              <CardSection key={v.id}>
                <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="row">
                      <strong>v{v.version}</strong>
                      <StatusBadge status={v.status} kind="version" />
                    </div>
                    <p className="text-xs text-secondary" style={{ marginTop: 4 }}>
                      {v.note ? `${v.note}. ` : ''}
                      {v.publishedAt
                        ? `Published ${formatRelative(v.publishedAt)}`
                        : `Created ${formatRelative(v.createdAt)}`}
                    </p>
                  </div>
                  {v.status !== 'draft' ? (
                    <ConfirmButton
                      title={`Revert to v${v.version}?`}
                      message="Copies that version's settings into a new draft. Nothing is published until you publish the draft."
                      confirmLabel="Create draft from it"
                      fields={{ intent: 'revert', versionId: v.id }}
                      size="sm"
                      variant="plain"
                    >
                      Revert
                    </ConfirmButton>
                  ) : null}
                </div>
              </CardSection>
            ))}
          </Card>

          {recentTests.length > 0 ? (
            <Card title="Recent test runs" padded={false}>
              {recentTests.map((t) => (
                <CardSection key={t.id}>
                  <div className="row row--between">
                    <Link to={`/generations/${t.id}`} className="table__primary">
                      {formatRelative(t.createdAt)}
                    </Link>
                    <StatusBadge status={t.status} kind="job" />
                  </div>
                </CardSection>
              ))}
            </Card>
          ) : null}
        </aside>
      </div>

      <ActionBar
        aside={
          <div className="row">
            <input
              form="design-form"
              className="input input--inline"
              type="text"
              name="note"
              placeholder="Version note (optional)"
              aria-label="Version note"
            />
            {samples.length > 1 ? (
              <select
                form="design-form"
                className="select input--inline"
                name="sampleUploadId"
                aria-label="Sample photo for test runs"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        }
      >
        <Button
          form="design-form"
          type="submit"
          name="intent"
          value="save"
          loading={submittingIntent === 'save'}
          disabled={archived}
        >
          Save draft
        </Button>
        <Button
          form="design-form"
          type="submit"
          name="intent"
          value="test"
          icon="play"
          loading={submittingIntent === 'test'}
          disabled={archived || samples.length === 0}
          title={samples.length === 0 ? 'No sample photos. Run pnpm db:seed to add some.' : undefined}
        >
          Save and run test
        </Button>
        <Button
          form="design-form"
          type="submit"
          name="intent"
          value="publish"
          variant="primary"
          icon="check"
          loading={submittingIntent === 'publish'}
          disabled={archived}
        >
          Publish
        </Button>
      </ActionBar>
    </Page>
  );
}
