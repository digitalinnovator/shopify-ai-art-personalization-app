import { h } from '../dom';
import { icon } from '../icons';

export type AlertTone = 'error' | 'warning' | 'info';

/** Inline message with an icon. `role="alert"` for errors so screen readers announce them. */
export function renderAlert(
  tone: AlertTone,
  message: string,
  opts: { focusTarget?: string } = {},
): HTMLElement {
  return h(
    'div',
    {
      class: 'aiart-alert',
      'data-tone': tone,
      role: tone === 'error' ? 'alert' : 'status',
      tabindex: opts.focusTarget ? '-1' : undefined,
      'data-aiart-focus': opts.focusTarget,
    },
    icon(tone === 'info' ? 'check-circle' : 'alert-circle', 18),
    h('p', { class: 'aiart-alert__text' }, message),
  );
}

/** Full-card message for states with nothing else to show (load errors). */
export function renderBlockingAlert(message: string): HTMLElement {
  return h('div', { class: 'aiart-card aiart-card--flat' }, renderAlert('error', message));
}
