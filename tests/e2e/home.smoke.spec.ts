import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// V1 / FR-002: one-liner, 3 featured projects, "Contact me" and "Download CV".
test.describe('Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the one-liner, 3 featured projects and both actions', async ({ page }) => {
    await expect(page.getByTestId('one-liner')).not.toBeEmpty();
    const featured = page.getByRole('region', { name: 'Featured projects' });
    await expect(featured.getByRole('article')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'Contact me' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download CV' })).toBeVisible();
  });

  test('fits the key content in a 1366x768 viewport without scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'V1 is defined for the 1366x768 desktop viewport');
    const full = { ratio: 1 };
    await expect(page.getByTestId('one-liner')).toBeInViewport(full);
    const cards = page.getByRole('region', { name: 'Featured projects' }).getByRole('article');
    for (const card of await cards.all()) {
      await expect(card).toBeInViewport(full);
    }
    await expect(page.getByRole('link', { name: 'Contact me' })).toBeInViewport(full);
    await expect(page.getByRole('link', { name: 'Download CV' })).toBeInViewport(full);
  });

  test('every project card is reachable with the Tab key', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Tab order is checked in Chromium');
    const cardLinks = page.getByRole('region', { name: 'Featured projects' }).getByRole('link');
    const expected = await cardLinks.evaluateAll((links) =>
      links.map((a) => (a as HTMLAnchorElement).getAttribute('href')),
    );
    expect(expected).toHaveLength(3);

    const reached = new Set<string>();
    for (let i = 0; i < 40 && reached.size < 3; i++) {
      await page.keyboard.press('Tab');
      const href = await page.evaluate(() => document.activeElement?.getAttribute('href') ?? null);
      if (href && expected.includes(href)) reached.add(href);
    }
    expect([...reached].sort()).toEqual([...expected].sort());
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
