import { COPY } from '../copy';
import { h } from '../dom';
import { icon } from '../icons';

/**
 * Full-size view of a preview. Appended to <body> (outside any preview card) and removed on
 * close; focus goes back to the button that opened it.
 */
export function openLightbox(url: string, label: string, returnTo: HTMLElement): void {
  const dialog = h('dialog', { class: 'aiart-lightbox', 'aria-label': label }) as HTMLDialogElement;
  const close = () => {
    if (dialog.open) dialog.close();
  };
  dialog.append(
    h(
      'button',
      { class: 'aiart-lightbox__close', type: 'button', 'aria-label': COPY.closeLightbox, onClick: close },
      icon('x', 20),
    ),
    h('img', { src: url, alt: label }),
    h('p', { class: 'aiart-lightbox__caption' }, label),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    returnTo.focus();
  });
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
