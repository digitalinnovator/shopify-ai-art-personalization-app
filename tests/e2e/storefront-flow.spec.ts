import { fileURLToPath } from 'node:url';
import { expect, type Locator, test } from '@playwright/test';

const FIXTURE_PHOTO = fileURLToPath(new URL('./fixtures/sample-photo.jpg', import.meta.url));

/** The two seeded designs' product cards each carry the whole widget as descendants. */
function productCard(page: import('@playwright/test').Page, designName: string): Locator {
  return page.locator('.product-card', { has: page.getByRole('heading', { name: designName, exact: true }) });
}

test.describe('storefront preview flow (mock provider)', () => {
  test('upload → two previews → select → add to cart → simulated payment releases the file', async ({
    page,
  }) => {
    await page.goto('/products/storybook-knight');

    const card = productCard(page, 'Storybook Knight Portrait');
    await expect(card).toBeVisible();

    // The theme's own buy buttons are hidden, and a submit of the theme form (Enter in the quantity
    // box, or a theme script) is blocked with a message in the widget: no purchase without a preview.
    await expect(card.locator('form.product-form button[name=add]')).toBeHidden();
    await expect(card.locator('form.product-form .shopify-payment-button')).toBeHidden();
    await card.locator('form.product-form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(card.locator('.aiart-widget [role=alert]').first()).toContainText('choose one first');

    // Consent, then upload — the widget requires consent before it will start an upload.
    await card.getByRole('checkbox').check();
    await card.locator('input[type=file]').setInputFiles(FIXTURE_PHOTO);
    // The widget stages the photo (thumbnail + change option) and starts on an explicit click.
    await card.getByRole('button', { name: 'Create previews' }).click();

    // Mock generation is fast, but this still waits through upload, validation and both slots.
    const previewImages = card.locator('.aiart-preview-card img');
    await expect(previewImages).toHaveCount(2, { timeout: 30_000 });
    await expect(card.getByRole('button', { name: /Try again \(\d+ left\)/ })).toBeVisible();

    await card.getByRole('button', { name: 'Choose Preview A' }).click();
    await expect(card.getByText('Preview A selected.')).toBeVisible();

    // Pick a size and quantity in the theme's own product form (outside the widget).
    const sizeSelect = card.locator('select[name=id]');
    await sizeSelect.selectOption({ label: '18 x 24 in' });
    const largestSize = await sizeSelect.inputValue();
    await card.locator('input[name=quantity]').fill('2');

    await card.getByRole('button', { name: 'Add to cart' }).click();
    // `.getByText` alone also matches the visually-hidden aria-live status region, which carries
    // the same announcement — scope to the visible confirmation panel specifically.
    await expect(card.locator('.aiart-success')).toHaveText('✓ Added to your cart.');
    // The theme's size and quantity travelled with the personalized item.
    await page.locator('#show-cart').click();
    await expect(page.locator('#harness-output')).toContainText('"quantity": 2');
    await expect(page.locator('#harness-output')).toContainText(`"id": ${largestSize}`);

    // Server-to-server order webhooks, exactly as Shopify would send them.
    await page.getByRole('button', { name: 'Simulate order created' }).click();
    await expect(page.locator('#harness-output')).toContainText('orders/create -> HTTP 200');

    await page.getByRole('button', { name: 'Simulate order paid' }).click();
    await expect(page.locator('#harness-output')).toContainText('orders/paid -> HTTP 200');
  });

  test('regenerate produces a fresh pair, then no further attempt is offered', async ({ page }) => {
    await page.goto('/products/watercolor-portrait');
    const card = productCard(page, 'Watercolor Portrait');

    await card.getByRole('checkbox').check();
    await card.locator('input[type=file]').setInputFiles(FIXTURE_PHOTO);
    // The widget stages the photo (thumbnail + change option) and starts on an explicit click.
    await card.getByRole('button', { name: 'Create previews' }).click();
    await expect(card.locator('.aiart-preview-card img')).toHaveCount(2, { timeout: 30_000 });

    // The demo designs allow exactly one retry.
    await card.getByRole('button', { name: 'Try again (1 left)' }).click();
    await expect(card.locator('.aiart-preview-card img')).toHaveCount(2, { timeout: 30_000 });

    // After it is used, the button gives way to a note and no further attempt is offered.
    await expect(
      card.locator('p.aiart-hint', { hasText: 'No more attempts for this session.' }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: /Try again/ })).toHaveCount(0);
  });
});
