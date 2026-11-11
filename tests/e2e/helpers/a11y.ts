import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Fails the test on any serious or critical WCAG 2.1 A/AA violation (SC-007). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const blocking = results.violations
    .filter((v) => v.impact != null && BLOCKING_IMPACTS.has(v.impact))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }));

  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}
