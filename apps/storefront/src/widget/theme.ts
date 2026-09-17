/**
 * Everything the widget does with the merchant's theme around it. The theme owns the size
 * (variant) picker, the quantity box and its own buy buttons; the widget only reads the first two
 * and, by default, hides the last so a personalized product cannot be bought without a chosen
 * preview.
 *
 * Written against Shopify's form conventions rather than one theme: product forms post to
 * `/cart/add`, carry the variant in `id`, and Dawn style themes keep the quantity input outside
 * the form, linked with the `form` attribute (which `form.elements` still includes).
 */
export interface ThemeSelection {
  /** Variant id from the theme's form, if it has one; the block's own variant id is the fallback. */
  variantId?: string;
  quantity: number;
}

/** Theme buy buttons: the add button and Shopify's dynamic checkout ("Buy it now") button. */
const THEME_BUY_BUTTONS = [
  'button[name="add"]',
  'input[type="submit"][name="add"]',
  '.shopify-payment-button',
  '[data-shopify="payment-button"]',
  'shopify-accelerated-checkout',
].join(', ');

function fieldValue(form: HTMLFormElement, name: string): string | undefined {
  // `namedItem` returns a RadioNodeList when several inputs share the name (variant radios);
  // its `value` is the checked one's value, same as a single input's.
  const field = form.elements.namedItem(name) as { value?: unknown } | null;
  const value = field?.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The part of the page that belongs to this product: the theme section the block sits in. */
function productScope(root: HTMLElement): ParentNode {
  return root.closest('.shopify-section, section, main') ?? document;
}

function cartForms(scope: ParentNode): HTMLFormElement[] {
  return Array.from(scope.querySelectorAll<HTMLFormElement>('form[action*="/cart/add"]'));
}

/**
 * The theme's real product form. Dawn based themes also render a small "installment" form that
 * posts to `/cart/add` with only a hidden variant id, so a form with a buy button or a quantity
 * field wins over one that merely carries an id.
 */
export function findThemeProductForm(root: HTMLElement): HTMLFormElement | undefined {
  const score = (form: HTMLFormElement): number =>
    (form.querySelector(THEME_BUY_BUTTONS) ? 4 : 0) +
    (fieldValue(form, 'quantity') !== undefined ? 2 : 0) +
    (fieldValue(form, 'id') !== undefined ? 1 : 0);
  const pick = (forms: HTMLFormElement[]) =>
    forms.filter((f) => score(f) > 0).sort((a, b) => score(b) - score(a))[0];
  return pick(cartForms(productScope(root))) ?? pick(cartForms(document));
}

export function readThemeProductForm(root: HTMLElement): ThemeSelection {
  const form = findThemeProductForm(root);
  if (!form) return { quantity: 1 };
  const variantId = fieldValue(form, 'id');
  const quantity = Math.floor(Number(fieldValue(form, 'quantity') ?? '1'));
  return {
    variantId: variantId && /^\d+$/.test(variantId) ? variantId : undefined,
    quantity: Number.isFinite(quantity) && quantity >= 1 ? quantity : 1,
  };
}

/**
 * Hides the theme's own buy buttons for this product and blocks the theme form from adding to
 * the cart, so the only way to buy is the widget's "Add to cart" after choosing a preview (an
 * order line without a chosen preview would have no artwork to release). Themes re-render these
 * buttons when the variant changes, so the rule is re-applied on every change in the section.
 * Returns a function that undoes everything.
 */
export function guardThemeBuyButtons(root: HTMLElement, onBlocked: () => void): () => void {
  const scope = productScope(root);
  const scopeNode = scope instanceof Document ? document.body : (scope as HTMLElement);

  const hide = () => {
    for (const form of cartForms(scope)) {
      if (root.contains(form)) continue;
      for (const el of form.querySelectorAll<HTMLElement>(THEME_BUY_BUTTONS)) {
        if (el.dataset.aiartHidden === 'true') continue;
        el.dataset.aiartHidden = 'true';
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
      }
    }
  };

  // Capture phase on the document runs before the theme's own submit handler on the form, so the
  // theme never sends its add to cart request (for example after Enter in the quantity box).
  const onSubmit = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!/\/cart\/add/.test(form.getAttribute('action') ?? '')) return;
    if (root.contains(form) || !scopeNode.contains(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked();
  };

  hide();
  const observer = new MutationObserver(hide);
  observer.observe(scopeNode, { childList: true, subtree: true });
  document.addEventListener('submit', onSubmit, true);

  return () => {
    observer.disconnect();
    document.removeEventListener('submit', onSubmit, true);
    for (const el of scopeNode.querySelectorAll<HTMLElement>('[data-aiart-hidden="true"]')) {
      delete el.dataset.aiartHidden;
      el.style.removeProperty('display');
      el.removeAttribute('aria-hidden');
    }
  };
}
