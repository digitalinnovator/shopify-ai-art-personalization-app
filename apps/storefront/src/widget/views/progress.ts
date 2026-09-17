import { COPY } from '../copy';
import { h } from '../dom';
import { renderStepper } from './stepper';
import type { StagedPhoto } from './types';

function progressBar(fraction: number | null): HTMLElement {
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return h(
    'div',
    {
      class: 'aiart-progress',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': percent === null ? undefined : String(percent),
      'aria-valuetext': percent === null ? 'Working' : `${percent}%`,
      'data-indeterminate': percent === null ? 'true' : undefined,
    },
    h('div', { class: 'aiart-progress__bar', style: percent === null ? undefined : `width:${percent}%` }),
  );
}

/** Steps 1 to 2: uploading (determinate) and checking (indeterminate). */
export function renderUploading(
  staged: StagedPhoto | undefined,
  fraction: number | null,
  title: string,
): HTMLElement {
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return h(
    'div',
    { class: 'aiart-card', 'aria-busy': 'true' },
    renderStepper(2),
    h(
      'div',
      { class: 'aiart-working' },
      staged ? h('img', { class: 'aiart-photo aiart-photo--sm', src: staged.url, alt: '' }) : null,
      h(
        'div',
        { class: 'aiart-working__text' },
        h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, title),
        h('p', { class: 'aiart-hint' }, percent === null ? COPY.generatingHint : `${percent}% uploaded`),
      ),
    ),
    progressBar(fraction),
  );
}

/** Step 2 while the models work: skeleton cards where the previews will appear. */
export function renderGenerating(): HTMLElement {
  return h(
    'div',
    { class: 'aiart-card', 'aria-busy': 'true' },
    renderStepper(2),
    h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.generatingTitle),
    h('p', { class: 'aiart-hint' }, COPY.generatingHint),
    progressBar(null),
    h(
      'div',
      { class: 'aiart-compare' },
      h('div', { class: 'aiart-preview-card aiart-skeleton', 'aria-hidden': 'true' }),
      h('div', { class: 'aiart-preview-card aiart-skeleton', 'aria-hidden': 'true' }),
    ),
  );
}
