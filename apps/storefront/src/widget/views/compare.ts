import type { JobView, PreviewView } from '../api';
import { COPY } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';
import { renderAlert } from './alerts';
import { renderStepper } from './stepper';
import type { Handlers, JobModel } from './types';

function previewCard(preview: PreviewView, handlers: Handlers): HTMLElement {
  if (preview.status === 'ready' && preview.url) {
    const zoom = h(
      'button',
      {
        class: 'aiart-zoom',
        type: 'button',
        'aria-label': COPY.zoom(preview.slot),
        onClick: (e: Event) =>
          handlers.openLightbox(
            preview.url ?? '',
            COPY.previewLabel(preview.slot),
            e.currentTarget as HTMLElement,
          ),
      },
      icon('zoom-in', 18),
    );
    return h(
      'div',
      { class: 'aiart-preview-card' },
      h(
        'div',
        { class: 'aiart-preview-card__media' },
        h('img', { src: preview.url, alt: COPY.previewLabel(preview.slot) }),
        zoom,
      ),
      h('span', { class: 'aiart-preview-card__label' }, COPY.previewLabel(preview.slot)),
      h(
        'button',
        {
          class: 'aiart-btn aiart-btn-primary aiart-btn--block',
          type: 'button',
          onClick: () => handlers.select(preview.id),
        },
        COPY.choose(preview.slot),
      ),
    );
  }
  const refused = preview.errorKind === 'refused';
  return h(
    'div',
    { class: 'aiart-preview-card aiart-preview-card--failed' },
    icon('image-off', 26),
    h('p', {}, refused ? COPY.previewRefused(preview.slot) : COPY.previewFailed(preview.slot)),
  );
}

/** Step 3: the A/B choice, plus regenerate and failure handling. */
export function renderCompare(model: JobModel, handlers: Handlers): HTMLElement {
  const { job } = model;
  const failed = job.status === 'failed';
  const canRegenerate = job.regenerationsLeft > 0;
  const anyRefused = job.previews.some((p) => p.errorKind === 'refused');

  const regenerateButton = canRegenerate
    ? h(
        'button',
        { class: 'aiart-btn aiart-btn--secondary', type: 'button', onClick: () => handlers.regenerate() },
        icon('refresh-cw', 16),
        COPY.tryAgain(job.regenerationsLeft),
      )
    : h('p', { class: 'aiart-hint' }, COPY.noAttemptsLeft);

  if (failed) {
    return h(
      'div',
      { class: 'aiart-card' },
      renderStepper(3),
      h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.allFailed),
      renderAlert('error', anyRefused ? COPY.allRefused : COPY.allFailed, { focusTarget: 'alert' }),
      model.error ? renderAlert('error', model.error) : null,
      h(
        'div',
        { class: 'aiart-actions aiart-actions--row' },
        regenerateButton,
        h(
          'button',
          { class: 'aiart-btn aiart-btn--plain', type: 'button', onClick: () => handlers.backToIntro() },
          icon('arrow-left', 16),
          COPY.useDifferentPhoto,
        ),
      ),
    );
  }

  return h(
    'div',
    { class: 'aiart-card' },
    renderStepper(3),
    h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.chooseHeading),
    h('p', { class: 'aiart-hint' }, job.status === 'partial' ? COPY.partialNote : COPY.chooseHint),
    model.error ? renderAlert('error', model.error, { focusTarget: 'alert' }) : null,
    h('div', { class: 'aiart-compare' }, ...job.previews.map((p) => previewCard(p, handlers))),
    h('div', { class: 'aiart-actions aiart-actions--row' }, regenerateButton),
  );
}

export function isWaiting(job: JobView): boolean {
  return job.status === 'queued' || job.status === 'generating';
}
