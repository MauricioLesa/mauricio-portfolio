import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// T039 / V2 / FR-004: each case study has Problem, Architecture, Trade-offs and Results, in order.
const REQUIRED_SECTIONS = ['Problem', 'Architecture', 'Trade-offs', 'Results'];

async function caseStudyLinks(page: Page): Promise<string[]> {
  await page.goto('/projects');
  return page
    .getByRole('main')
    .getByRole('article')
    .getByRole('heading')
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
}

test.describe('Case study', () => {
  test('every case study has a title and the 4 sections in order', async ({ page }) => {
    const hrefs = await caseStudyLinks(page);
    expect(hrefs.length).toBeGreaterThanOrEqual(3);

    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      const h2s = (await page.getByRole('main').getByRole('heading', { level: 2 }).allInnerTexts()).map((t) =>
        t.trim(),
      );
      const found = h2s.filter((t) => REQUIRED_SECTIONS.includes(t));
      expect(found, `${href} sections`).toEqual(REQUIRED_SECTIONS);
    }
  });

  test('returns 404 for an unknown slug', async ({ page }) => {
    const response = await page.goto('/projects/no-such-project');
    expect(response?.status()).toBe(404);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    const [first] = await caseStudyLinks(page);
    expect(first).toBeTruthy();
    await page.goto(first!);
    await expectNoA11yViolations(page);
  });
});
