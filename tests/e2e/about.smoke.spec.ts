import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// V3 / FR-003: background, the 8 stack technologies and a non-empty "Learning now" list.
const REQUIRED_STACK = ['Node.js', 'TypeScript', 'React', 'Next.js', 'Docker', 'Redis', 'RabbitMQ', 'AWS'];

test.describe('About', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
  });

  test('has a page heading and a background section', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Background' })).not.toBeEmpty();
  });

  test('lists all 8 stack technologies', async ({ page }) => {
    const items = page.getByRole('list', { name: 'Stack' }).getByRole('listitem');
    const texts = (await items.allInnerTexts()).map((t) => t.trim());
    for (const tech of REQUIRED_STACK) {
      expect(texts, `stack includes ${tech}`).toContain(tech);
    }
  });

  test('has a non-empty "Learning now" list', async ({ page }) => {
    const items = page.getByRole('list', { name: 'Learning now' }).getByRole('listitem');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
