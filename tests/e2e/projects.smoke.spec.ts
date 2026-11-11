import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// T039 / FR-001: the Projects list shows every project, each linking to its case study.
test.describe('Projects list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('lists every project as a card linking to its case study', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    const cards = page.getByRole('main').getByRole('article');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    for (const card of await cards.all()) {
      const link = card.getByRole('heading').getByRole('link');
      await expect(link).toHaveAttribute('href', /^\/projects\/[a-z0-9-]+$/);
      await expect(link).not.toBeEmpty();
    }
  });

  test('marks Projects as the current page in the menu', async ({ page }) => {
    // The menu renders a desktop list and a mobile list (only one is displayed), so check every match.
    const current = page.getByRole('navigation', { name: 'Main' }).locator('[aria-current="page"]');
    const labels = (await current.allTextContents()).map((t) => t.trim());
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set(['Projects']));
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
