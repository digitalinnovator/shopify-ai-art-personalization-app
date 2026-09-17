import { STEPS } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';

export type Step = 1 | 2 | 3 | 4;

/** Four dots with labels: Upload, Generating, Choose, Added. Done steps show a check mark. */
export function renderStepper(active: Step): HTMLElement {
  return h(
    'ol',
    { class: 'aiart-stepper', 'aria-label': 'Progress' },
    ...STEPS.map((label, i) => {
      const step = (i + 1) as Step;
      const state = step < active ? 'done' : step === active ? 'active' : 'todo';
      return h(
        'li',
        { class: 'aiart-step', 'data-state': state, 'aria-current': state === 'active' ? 'step' : undefined },
        h('span', { class: 'aiart-step__dot' }, state === 'done' ? icon('check', 14) : String(step)),
        h('span', { class: 'aiart-step__label' }, label),
      );
    }),
  );
}
