import { COPY } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';
import { renderAlert } from './alerts';
import { renderStepper } from './stepper';
import type { Handlers, IntroModel } from './types';

function formatMb(bytes: number): number {
  return Math.round(bytes / 1_000_000);
}

function formatSize(bytes: number): string {
  return bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Step 1: examples, drop zone (or the staged photo), consent, optional email, primary action. */
export function renderIntro(model: IntroModel, handlers: Handlers): HTMLElement {
  const { design, staged } = model;
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp',
    class: 'aiart-file-input',
    id: `aiart-file-${design.id}`,
    'aria-label': COPY.choosePhoto,
    onChange: (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handlers.stageFile(file);
    },
  });

  const dropzone = h(
    'div',
    {
      class: 'aiart-dropzone',
      'data-has-photo': staged ? 'true' : undefined,
      onDragover: (e: Event) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).dataset.dragging = 'true';
      },
      onDragleave: (e: Event) => {
        delete (e.currentTarget as HTMLElement).dataset.dragging;
      },
      onDrop: (e: Event) => {
        e.preventDefault();
        delete (e.currentTarget as HTMLElement).dataset.dragging;
        const file = (e as DragEvent).dataTransfer?.files?.[0];
        if (file) handlers.stageFile(file);
      },
    },
    staged
      ? h(
          'div',
          { class: 'aiart-dropzone__photo' },
          h('img', { class: 'aiart-photo', src: staged.url, alt: 'Your photo' }),
          h(
            'div',
            { class: 'aiart-dropzone__meta' },
            h('span', { class: 'aiart-dropzone__name' }, staged.file.name),
            h('span', { class: 'aiart-dropzone__size' }, formatSize(staged.file.size)),
            h(
              'label',
              { class: 'aiart-btn aiart-btn--secondary aiart-btn--sm', for: `aiart-file-${design.id}` },
              icon('image', 16),
              COPY.changePhoto,
            ),
          ),
        )
      : h(
          'div',
          { class: 'aiart-dropzone__empty' },
          h('span', { class: 'aiart-dropzone__icon' }, icon('upload-cloud', 26)),
          h('p', { class: 'aiart-dropzone__title' }, COPY.dropzoneTitle),
          h(
            'label',
            {
              class: 'aiart-btn aiart-btn--secondary',
              for: `aiart-file-${design.id}`,
              'data-aiart-focus': 'dropzone',
            },
            COPY.choosePhoto,
          ),
          h('p', { class: 'aiart-dropzone__hint' }, COPY.formatsHint(formatMb(design.uploadRules.maxBytes))),
        ),
    fileInput,
  );

  const consentBox = h('input', {
    type: 'checkbox',
    id: `aiart-consent-${design.id}`,
    checked: model.consent,
    onChange: (e: Event) => handlers.setConsent((e.target as HTMLInputElement).checked),
  });

  const emailField = design.requireEmail
    ? h(
        'label',
        { class: 'aiart-field' },
        h('span', {}, COPY.emailLabel),
        h('input', {
          type: 'email',
          class: 'aiart-text-input',
          placeholder: COPY.emailPlaceholder,
          autocomplete: 'email',
          required: true,
          value: model.email,
          onInput: (e: Event) => handlers.setEmail((e.target as HTMLInputElement).value),
        }),
      )
    : null;

  return h(
    'div',
    { class: 'aiart-card' },
    renderStepper(1),
    design.exampleImages.length > 0
      ? h(
          'div',
          { class: 'aiart-examples', 'aria-label': `${design.name} examples` },
          ...design.exampleImages.map((src) =>
            h('img', { src, alt: `${design.name} example`, loading: 'lazy' }),
          ),
        )
      : null,
    h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.introHeading),
    h('p', { class: 'aiart-hint' }, COPY.introHint),
    dropzone,
    h(
      'label',
      { class: 'aiart-consent', for: `aiart-consent-${design.id}` },
      consentBox,
      h('span', {}, COPY.consent),
    ),
    emailField,
    model.error ? renderAlert('error', model.error, { focusTarget: 'alert' }) : null,
    staged
      ? h(
          'div',
          { class: 'aiart-actions' },
          h(
            'button',
            {
              class: 'aiart-btn aiart-btn-primary aiart-btn--block',
              type: 'button',
              'data-aiart-focus': 'primary',
              onClick: () => handlers.createPreviews(),
            },
            icon('sparkles', 18),
            COPY.createPreviews,
          ),
        )
      : null,
  );
}
