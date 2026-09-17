import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

/**
 * Visual review helper, not a regression test: walks the widget through every customer-facing
 * state at desktop and phone widths and saves screenshots. Runs only when AIART_VISUAL is set:
 *
 *   AIART_VISUAL=1 pnpm --filter @aiart/e2e exec playwright test visual.spec.ts
 *
 * Screenshots land in AIART_VISUAL_DIR (default tests/e2e/visual-output).
 */
const FIXTURE_PHOTO = fileURLToPath(new URL('./fixtures/sample-photo.jpg', import.meta.url));
const OUT_DIR = process.env.AIART_VISUAL_DIR ?? fileURLToPath(new URL('./visual-output', import.meta.url));

test.skip(!process.env.AIART_VISUAL, 'Set AIART_VISUAL=1 to capture screenshots');

async function shot(page: Page, name: string, width: number) {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: `${OUT_DIR}/${name}-${width}.png`, fullPage: false });
}

for (const width of [1280, 390]) {
  test(`widget states at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto('/products/storybook-knight');
    const card = page.locator('.product-card', {
      has: page.getByRole('heading', { name: 'Storybook Knight Portrait', exact: true }),
    });
    const widget = card.locator('.aiart-widget');
    await expect(widget).toBeVisible();
    await widget.scrollIntoViewIfNeeded();
    await shot(page, '1-intro', width);

    await card.locator('input[type=file]').setInputFiles(FIXTURE_PHOTO);
    await expect(card.getByRole('button', { name: 'Create previews' })).toBeVisible();
    await shot(page, '2-staged', width);

    await card.getByRole('checkbox').check();
    await card.getByRole('button', { name: 'Create previews' }).click();
    await expect(card.locator('.aiart-skeleton').first()).toBeVisible({ timeout: 15_000 });
    await shot(page, '3-generating', width);

    await expect(card.locator('.aiart-preview-card img')).toHaveCount(2, { timeout: 30_000 });
    await widget.scrollIntoViewIfNeeded();
    await shot(page, '4-compare', width);

    await card.getByRole('button', { name: 'Choose Preview A' }).click();
    await expect(card.getByText('Preview A selected.')).toBeVisible();
    await widget.scrollIntoViewIfNeeded();
    await shot(page, '5-selected', width);

    await card.getByRole('button', { name: 'Add to cart' }).click();
    await expect(card.locator('.aiart-success')).toHaveText('✓ Added to your cart.');
    await widget.scrollIntoViewIfNeeded();
    await shot(page, '6-added', width);
  });
}
