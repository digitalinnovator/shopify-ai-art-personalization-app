import {
  type DesignConfig,
  formatUsd,
  type ModelInfo,
  modelsForProvider,
  PRICES_VERIFIED_ON,
  PROVIDERS,
} from '@aiart/contracts';
import { getVersion, listDesigns, listProviderStatuses, setProviderEnabled } from '@aiart/core/services';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { Badge } from '../components/Badge';
import { Banner } from '../components/Banner';
import { Button, ButtonAnchor } from '../components/Button';
import { Card } from '../components/Card';
import { DataTable } from '../components/DataTable';
import { Icon } from '../components/Icon';
import { ConfirmButton } from '../components/Modal';
import { Page } from '../components/Page';
import { useActionToast } from '../components/Toast';
import { requireShop } from '../lib/auth.server';
import { formatDay } from '../lib/format';
import { toastData } from '../lib/toast';

const PROVIDER_LABELS = new Map<string, string>(PROVIDERS.map((p) => [p.id, p.label]));

export async function loader({ request }: LoaderFunctionArgs) {
  const { shop } = await requireShop(request);
  const [statuses, designs] = await Promise.all([listProviderStatuses(shop.id), listDesigns(shop.id)]);

  const usedBy: Record<string, { designId: string; name: string; slot: string; model: string }[]> = {};
  for (const design of designs) {
    if (design.status !== 'live' || !design.liveVersionId) continue;
    const version = await getVersion(design.liveVersionId);
    const config = version?.config as DesignConfig | undefined;
    for (const slot of config?.slots ?? []) {
      usedBy[slot.provider] ??= [];
      usedBy[slot.provider]?.push({
        designId: design.id,
        name: design.name,
        slot: slot.slot,
        model: slot.model,
      });
    }
  }

  return {
    providers: PROVIDERS.map((p) => {
      const status = statuses.find((s) => s.id === p.id);
      return {
        ...p,
        configured: Boolean(status),
        enabled: status?.enabled ?? false,
        usedBy: usedBy[p.id] ?? [],
      };
    }),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await requireShop(request);
  const form = await request.formData();
  const providerId = String(form.get('providerId'));
  const enabled = form.get('enabled') === 'true';
  await setProviderEnabled(shop.id, providerId, enabled);
  return {
    toast: toastData(
      'success',
      `${PROVIDER_LABELS.get(providerId) ?? providerId} ${enabled ? 'enabled' : 'disabled'}.`,
    ),
  };
}

function Price({ model }: { model: ModelInfo }) {
  if (model.priceUsd === null) return <span className="text-secondary">Unknown</span>;
  if (model.priceUsd === 0) return <span className="model-price">Free</span>;
  return (
    <span className="model-price">
      {model.verifiedOn ? '' : 'about '}
      {formatUsd(model.priceUsd)}
    </span>
  );
}

export default function ModelsIndex() {
  const { providers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  useActionToast(actionData?.toast);
  const navigation = useNavigation();

  return (
    <Page
      title="Models"
      subtitle="Every AI provider and model the engine can use. A design picks a provider and model per preview slot, so switching is a dropdown, not a code change."
    >
      <Banner tone="info" className="stack">
        Prices are indicative, per generated image at the sizes this app uses, and were checked on{' '}
        {formatDay(PRICES_VERIFIED_ON)}. Providers bill per token or per megapixel, so the invoice is the
        source of truth. To unlock a provider, add its key to the .env file and restart the API and worker.
      </Banner>
      <div className="stack">
        {providers.map((p) => {
          const busy = navigation.state !== 'idle' && navigation.formData?.get('providerId') === p.id;
          const inUse = p.usedBy.length > 0;
          const models = modelsForProvider(p.id);
          return (
            <Card
              key={p.id}
              padded={false}
              title={
                <span className="provider-card__head">
                  <Icon name="cpu" size={18} />
                  {p.label}
                  <Badge tone={p.configured ? 'success' : 'neutral'}>
                    {p.configured ? 'Configured' : 'Not configured'}
                  </Badge>
                  {p.configured ? (
                    <Badge tone={p.enabled ? 'success' : 'warning'}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  ) : null}
                </span>
              }
              subtitle={p.summary}
              actions={
                p.configured ? (
                  p.enabled && inUse ? (
                    <ConfirmButton
                      title={`Disable ${p.label}?`}
                      message="Live designs use this provider. Their storefront previews will fail until you switch those slots to another provider or enable it again."
                      confirmLabel="Disable"
                      confirmVariant="critical"
                      fields={{ providerId: p.id, enabled: 'false', intent: `toggle-${p.id}` }}
                      variant="secondary"
                      size="sm"
                      loading={busy}
                    >
                      Disable
                    </ConfirmButton>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="providerId" value={p.id} />
                      <input type="hidden" name="enabled" value={String(!p.enabled)} />
                      <Button
                        type="submit"
                        variant={p.enabled ? 'secondary' : 'primary'}
                        size="sm"
                        loading={busy}
                      >
                        {p.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </Form>
                  )
                ) : null
              }
            >
              <div className="card__section stack stack--sm">
                <div className="provider-card__meta">
                  <span className="mono">{p.id}</span>
                  {p.envKey ? (
                    <span>
                      Key: <span className="mono">{p.envKey}</span>
                      {p.configured ? '' : ' (not set)'}
                    </span>
                  ) : (
                    <span>No key needed</span>
                  )}
                  {p.pricingUrl ? (
                    <ButtonAnchor
                      href={p.pricingUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="plain"
                      size="sm"
                      icon="link"
                    >
                      Official pricing
                    </ButtonAnchor>
                  ) : null}
                </div>
                {inUse ? (
                  <div className="row">
                    <span className="text-xs text-secondary">Used by live designs:</span>
                    {p.usedBy.map((u) => (
                      <Link key={`${u.designId}-${u.slot}`} to={`/designs/${u.designId}`} className="chip">
                        {u.name} ({u.slot})
                      </Link>
                    ))}
                  </div>
                ) : null}
                {inUse && p.configured && !p.enabled ? (
                  <Banner tone="warning">
                    Disabled but used by a live design. Storefront generations for those slots will fail until
                    it is enabled.
                  </Banner>
                ) : null}
                {inUse && !p.configured ? (
                  <Banner tone="critical">
                    A live design uses this provider but {p.envKey ?? 'its key'} is not set. Those generations
                    will fail.
                  </Banner>
                ) : null}
              </div>
              <DataTable
                rows={models}
                rowKey={(m) => m.id}
                caption={`${p.label} models`}
                emptyState={<p className="card__section text-sm text-secondary">No catalog entries.</p>}
                columns={[
                  {
                    key: 'model',
                    header: 'Model',
                    render: (m) => (
                      <div>
                        <span className="table__primary">{m.label}</span>
                        <span className="table__sub mono">{m.id}</span>
                      </div>
                    ),
                  },
                  { key: 'summary', header: 'Good for', render: (m) => m.summary, hideBelow: 'md' },
                  {
                    key: 'refs',
                    header: 'Reference images',
                    render: (m) => `Up to ${m.maxReferenceImages}`,
                    hideBelow: 'sm',
                  },
                  { key: 'price', header: 'Per image', align: 'right', render: (m) => <Price model={m} /> },
                  {
                    key: 'verified',
                    header: 'Checked',
                    render: (m) =>
                      m.verifiedOn ? (
                        <Badge tone="success">{formatDay(m.verifiedOn)}</Badge>
                      ) : (
                        <Badge tone="attention">Approximate</Badge>
                      ),
                    hideBelow: 'sm',
                  },
                ]}
              />
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
