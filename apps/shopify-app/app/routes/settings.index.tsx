import { RELEASE_TRIGGERS, ShopSettingsSchema } from '@aiart/contracts';
import { updateShopSettings } from '@aiart/core/services';
import { useState } from 'react';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { data, Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { AnnotatedSection } from '../components/Card';
import { Checkbox, NumberField, Select, TextField } from '../components/fields';
import { ActionBar, Page } from '../components/Page';
import { useActionToast } from '../components/Toast';
import { requireShop } from '../lib/auth.server';
import { toastData } from '../lib/toast';
import { fieldErrorsFromIssues, settingsFieldName } from '../lib/validation';

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  return { settings: shop.settings };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const patch = {
    retentionDays: Number(form.get('retentionDays')),
    selectedRetentionDays: Number(form.get('selectedRetentionDays')),
    watermark: {
      text: String(form.get('watermarkText') ?? 'PREVIEW'),
      opacity: Number(form.get('watermarkOpacity')),
    },
    releaseTrigger: String(form.get('releaseTrigger')) as (typeof RELEASE_TRIGGERS)[number],
    dailyPreviewCap: Number(form.get('dailyPreviewCap')),
    requireEmail: form.get('requireEmail') === 'on',
    rateLimitPerMinute: Number(form.get('rateLimitPerMinute')),
  };

  const parsed = ShopSettingsSchema.safeParse({ ...shop.settings, ...patch });
  if (!parsed.success) {
    return data(
      {
        errors: fieldErrorsFromIssues(parsed.error.issues, settingsFieldName),
        toast: toastData('critical', 'Some settings are not valid. Check the highlighted fields.'),
      },
      { status: 400 },
    );
  }
  const settings = await updateShopSettings(shop.id, parsed.data);
  return { settings, errors: {} as Record<string, string>, toast: toastData('success', 'Settings saved.') };
}

/** Enough tiles to cover the preview box at any watermark length. */
const WM_TILES = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'];

const RELEASE_LABELS: Record<(typeof RELEASE_TRIGGERS)[number], string> = {
  'orders/create': 'When the order is created',
  'orders/paid': 'When the order is paid',
};

export default function SettingsIndex() {
  const { settings: loaded } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const settings =
    actionData && 'settings' in actionData && actionData.settings ? actionData.settings : loaded;
  const errors = actionData?.errors ?? {};
  useActionToast(actionData?.toast);
  const navigation = useNavigation();

  const [wmText, setWmText] = useState(settings.watermark.text);
  const [wmOpacity, setWmOpacity] = useState(settings.watermark.opacity);

  return (
    <Page
      title="Settings"
      subtitle="Store-wide rules for photo retention, watermarks, order release and cost control."
    >
      <Form method="post">
        {Object.keys(errors).length > 0 ? (
          <Banner tone="critical" title="Some settings are not valid" className="stack">
            Check the highlighted fields below.
          </Banner>
        ) : null}

        <AnnotatedSection
          title="Photo retention"
          description="Customer photos are personal data. They are deleted automatically after these windows; buyers' final artwork is kept separately."
        >
          <div className="stack">
            <NumberField
              label="Delete photos of non-buyers after (days)"
              name="retentionDays"
              min={1}
              max={365}
              defaultValue={settings.retentionDays}
              help="Applies to shoppers who uploaded a photo but never chose a preview."
              error={errors.retentionDays}
            />
            <NumberField
              label="Delete photos of selected but unordered previews after (days)"
              name="selectedRetentionDays"
              min={1}
              max={730}
              defaultValue={settings.selectedRetentionDays}
              help="A longer window for abandoned carts, so a late order can still be fulfilled."
              error={errors.selectedRetentionDays}
            />
          </div>
        </AnnotatedSection>

        <AnnotatedSection
          title="Preview watermark"
          description="Storefront previews are shown reduced and watermarked. The original is released only after an order."
        >
          <div className="stack">
            <TextField
              label="Watermark text"
              name="watermarkText"
              maxLength={24}
              value={wmText}
              onChange={(e) => setWmText(e.target.value)}
              help="Letters, numbers, spaces, dots and dashes. Up to 24 characters."
              error={errors.watermarkText}
            />
            <NumberField
              label="Opacity"
              name="watermarkOpacity"
              min={0.05}
              max={0.9}
              step={0.05}
              value={wmOpacity}
              onChange={(e) => setWmOpacity(Number(e.target.value))}
              help="Between 0.05 (faint) and 0.9 (strong)."
              error={errors.watermarkOpacity}
            />
            <div>
              <p className="field__label">Preview</p>
              <div className="wm-preview" aria-hidden="true">
                <div
                  className="wm-preview__text"
                  style={{ opacity: Math.min(0.9, Math.max(0.05, wmOpacity || 0.35)) }}
                >
                  {WM_TILES.map((id) => (
                    <span key={id}>{wmText || 'PREVIEW'}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </AnnotatedSection>

        <AnnotatedSection
          title="Order release"
          description="When the final, un-watermarked artwork becomes available for delivery."
        >
          <Select
            label="Release the final artwork"
            name="releaseTrigger"
            defaultValue={settings.releaseTrigger}
            options={RELEASE_TRIGGERS.map((t) => ({ value: t, label: RELEASE_LABELS[t] }))}
            help="Shopify sends a webhook for each event. Releasing on payment avoids delivering art for unpaid orders."
            error={errors.releaseTrigger}
          />
        </AnnotatedSection>

        <AnnotatedSection
          title="Cost control"
          description="Every generation costs money on real AI providers. These limits keep abuse in check."
        >
          <div className="stack">
            <NumberField
              label="Daily preview cap for the whole store"
              name="dailyPreviewCap"
              min={0}
              defaultValue={settings.dailyPreviewCap}
              help="Counts every preview slot, including regenerations. 0 removes the cap."
              error={errors.dailyPreviewCap}
            />
            <NumberField
              label="Requests per minute per shopper"
              name="rateLimitPerMinute"
              min={1}
              max={600}
              defaultValue={settings.rateLimitPerMinute}
              error={errors.rateLimitPerMinute}
            />
            <Checkbox
              name="requireEmail"
              defaultChecked={settings.requireEmail}
              label="Ask for an email before generating"
              help="Adds a required email field to the storefront block. Useful for follow-ups and to discourage casual abuse."
            />
          </div>
        </AnnotatedSection>

        <ActionBar>
          <Button type="submit" variant="primary" loading={navigation.state !== 'idle'}>
            Save settings
          </Button>
        </ActionBar>
      </Form>
    </Page>
  );
}
