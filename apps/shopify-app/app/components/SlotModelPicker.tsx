import { findModel, formatUsd, type ModelInfo, modelsForProvider } from '@aiart/contracts';
import { useState } from 'react';
import { formatDay } from '../lib/format';
import { Select, TextField } from './fields';

export interface ProviderOption {
  id: string;
  label: string;
  envKey: string | null;
  configured: boolean;
  enabled: boolean;
}

export interface SlotSelection {
  provider: string;
  model: string;
}

interface SlotModelPickerProps {
  letter: 'A' | 'B';
  /** The slot as saved; the picker keeps its own state from here on. */
  initial: SlotSelection;
  providers: ProviderOption[];
  errors: { provider?: string; model?: string };
  onChange: (selection: SlotSelection) => void;
}

const CUSTOM = '__custom__';

function priceLabel(m: ModelInfo): string {
  if (m.priceUsd === null) return '';
  if (m.priceUsd === 0) return ' (free)';
  return ` (about ${formatUsd(m.priceUsd)} per image)`;
}

/**
 * Provider and model dropdowns for one preview slot, fed by the catalog in @aiart/contracts.
 * Submits the same two fields the action has always read (`slotX_provider`, `slotX_model`), so a
 * model outside the catalog is still just a text id ("Custom model id").
 */
export function SlotModelPicker({ letter, initial, providers, errors, onChange }: SlotModelPickerProps) {
  const [provider, setProvider] = useState(initial.provider);
  const initialInCatalog = Boolean(findModel(initial.provider, initial.model));
  const [choice, setChoice] = useState(
    initialInCatalog
      ? initial.model
      : initial.model
        ? CUSTOM
        : (modelsForProvider(initial.provider)[0]?.id ?? CUSTOM),
  );
  const [custom, setCustom] = useState(initialInCatalog ? '' : initial.model);

  const models = modelsForProvider(provider);
  const info = choice === CUSTOM ? undefined : findModel(provider, choice);

  const providerOptions = providers.map((p) => ({
    value: p.id,
    label: !p.configured
      ? `${p.label} (add ${p.envKey ?? 'a key'} to .env)`
      : p.enabled
        ? p.label
        : `${p.label} (disabled on Models)`,
    // A provider without a key cannot be chosen, unless the design already uses it.
    disabled: !p.configured && p.id !== provider,
  }));

  const modelOptions = [
    ...models.map((m) => ({ value: m.id, label: `${m.label}${priceLabel(m)}` })),
    { value: CUSTOM, label: 'Custom model id' },
  ];

  function changeProvider(next: string) {
    const first = modelsForProvider(next)[0];
    const nextChoice = first ? first.id : CUSTOM;
    setProvider(next);
    setChoice(nextChoice);
    onChange({ provider: next, model: nextChoice === CUSTOM ? custom : nextChoice });
  }

  function changeChoice(next: string) {
    setChoice(next);
    onChange({ provider, model: next === CUSTOM ? custom : next });
  }

  function changeCustom(next: string) {
    setCustom(next);
    onChange({ provider, model: next });
  }

  return (
    <>
      <Select
        label="Provider"
        name={`slot${letter}_provider`}
        value={provider}
        onChange={(e) => changeProvider(e.target.value)}
        options={providerOptions}
        error={errors.provider}
      />
      <Select
        label="Model"
        value={choice}
        onChange={(e) => changeChoice(e.target.value)}
        options={modelOptions}
        error={choice === CUSTOM ? undefined : errors.model}
      />
      {choice === CUSTOM ? (
        <TextField
          label="Model id"
          name={`slot${letter}_model`}
          value={custom}
          onChange={(e) => changeCustom(e.target.value)}
          required
          help="Exactly as the provider names it. Its price is unknown, so the cost estimate leaves this slot out."
          error={errors.model}
        />
      ) : (
        <input type="hidden" name={`slot${letter}_model`} value={choice} />
      )}
      {info ? (
        <div className="model-note">
          <p className="text-sm">{info.summary}</p>
          <p className="text-xs text-secondary">
            {info.priceUsd === 0 ? 'Free.' : info.priceNote} Up to {info.maxReferenceImages} reference images.{' '}
            {info.verifiedOn
              ? `Price checked ${formatDay(info.verifiedOn)}.`
              : 'Price approximate, not re-checked against the provider.'}
          </p>
          <p className="text-xs mono text-secondary">{info.id}</p>
        </div>
      ) : null}
    </>
  );
}
