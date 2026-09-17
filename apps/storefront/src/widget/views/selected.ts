import { COPY } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';
import { renderAlert } from './alerts';
import { renderStepper } from './stepper';
import type { Handlers, SelectedModel } from './types';

/** Step 3, after a choice: confirm and add to cart. */
export function renderSelected(model: SelectedModel, handlers: Handlers): HTMLElement {
  const preview = model.job.previews.find((p) => p.id === model.previewId);
  const label = preview ? COPY.previewLabel(preview.slot) : 'Preview';
  return h(
    'div',
    { class: 'aiart-card' },
    renderStepper(3),
    h(
      'h3',
      { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' },
      COPY.selectedNote(label),
    ),
    h('p', { class: 'aiart-hint' }, 'This exact image becomes your final artwork after checkout.'),
    preview?.url
      ? h(
          'div',
          { class: 'aiart-selected' },
          h('img', { class: 'aiart-selected-image', src: preview.url, alt: 'Your selected preview' }),
        )
      : null,
    model.error ? renderAlert('error', model.error, { focusTarget: 'alert' }) : null,
    h(
      'div',
      { class: 'aiart-actions' },
      h(
        'button',
        {
          class: 'aiart-btn aiart-btn-primary aiart-btn--block',
          type: 'button',
          disabled: model.adding,
          'aria-busy': model.adding ? 'true' : undefined,
          'data-aiart-focus': 'primary',
          onClick: () => handlers.addToCart(),
        },
        icon('shopping-bag', 18),
        model.adding ? COPY.adding : COPY.addToCart,
      ),
      h(
        'button',
        {
          class: 'aiart-btn aiart-btn--plain',
          type: 'button',
          disabled: model.adding,
          onClick: () => handlers.chooseOther(),
        },
        icon('arrow-left', 16),
        COPY.chooseOther,
      ),
    ),
  );
}
