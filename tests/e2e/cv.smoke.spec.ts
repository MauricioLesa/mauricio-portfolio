import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// T050 / FR-007: the HTML CV. The download flow (V5–V7) needs the US2 grant routes and S3,
// so those cases are marked fixme until T051–T054 and T120 land.
test.describe('CV', () => {
  test('renders the experience, skills and education sections', async ({ page }) => {
    await page.goto('/cv');
    await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();

    const experience = page.getByRole('region', { name: 'Experience' });
    expect(await experience.getByRole('article').count()).toBeGreaterThan(0);

    const skills = page.getByRole('region', { name: 'Skills' });
    expect(await skills.getByRole('listitem').count()).toBeGreaterThan(0);

    const education = page.getByRole('region', { name: 'Education' });
    expect(await education.getByRole('listitem').count()).toBeGreaterThan(0);
  });

  test('has a "Download CV" link to the download route', async ({ page }) => {
    await page.goto('/cv');
    const link = page.getByRole('main').getByRole('link', { name: 'Download CV' });
    await expect(link).toHaveAttribute('href', '/api/cv/link');
    await expect(link).toHaveAttribute('rel', 'nofollow');
  });

  test('ignores query strings: /cv?link=<script> renders exactly like /cv', async ({ page }) => {
    await page.goto('/cv');
    const plain = await page.getByRole('main').innerHTML();
    await page.goto('/cv?link=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(await page.getByRole('main').innerHTML()).toBe(plain);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/cv');
    await expectNoA11yViolations(page);
  });

  test.fixme('following "Download CV" ends in a PDF response (V5, needs T051–T054)', async () => {});
  test.fixme('an expired grant ends on /cv/link-expired with a "request a new link" action (V6, needs T054, T120)', async () => {});
  test.fixme('11 requests in an hour end on /cv/too-many-requests (FR-032, needs T053, T120)', async () => {});
});
