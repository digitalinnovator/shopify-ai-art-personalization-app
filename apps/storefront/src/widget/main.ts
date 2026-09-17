import './styles.css';
import { Widget } from './widget';

function mountAll(): void {
  for (const root of document.querySelectorAll<HTMLElement>(
    '[data-ai-art-block]:not([data-aiart-mounted])',
  )) {
    root.dataset.aiartMounted = 'true';
    new Widget(root);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}

// Blocks in a real theme are server-rendered in the initial HTML, so this is mostly a safety net —
// but sections can also be swapped in dynamically (AJAX cart drawers, quick view, infinite scroll),
// and the local test page builds its product cards after an async fetch.
new MutationObserver(mountAll).observe(document.documentElement, { childList: true, subtree: true });
