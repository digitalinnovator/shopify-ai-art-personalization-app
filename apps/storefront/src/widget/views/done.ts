import { COPY } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';
import { renderStepper } from './stepper';
import type { Handlers } from './types';

/** Step 4: added to cart. `.aiart-success` carries the exact confirmation text. */
export function renderDone(handlers: Handlers): HTMLElement {
  return h(
    'div',
    { class: 'aiart-card' },
    renderStepper(4),
    h(
      'div',
      { class: 'aiart-done' },
      h('span', { class: 'aiart-done__icon' }, icon('check-circle', 28)),
      h('p', { class: 'aiart-success', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.addedTitle),
      h('p', { class: 'aiart-hint' }, COPY.addedHint),
    ),
    h(
      'div',
      { class: 'aiart-actions aiart-actions--row' },
      h(
        'a',
        { class: 'aiart-btn aiart-btn--secondary', href: '/cart' },
        icon('shopping-bag', 16),
        COPY.viewCart,
      ),
      h(
        'button',
        { class: 'aiart-btn aiart-btn--plain', type: 'button', onClick: () => handlers.backToIntro() },
        COPY.startOver,
      ),
    ),
  );
}
