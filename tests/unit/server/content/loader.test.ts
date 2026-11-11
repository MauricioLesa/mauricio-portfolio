import { describe, expect, it } from 'vitest';
import { ContentError, createContent } from '@/server/content';
import { contentWith, REPO_CONTENT } from './helpers';

// Pages, the CV and general loader validation. T027 later adds the fixture sets and the
// check-content tests.
describe('page and CV content functions', () => {
  const content = createContent(REPO_CONTENT);

  it('loads the home and about pages, and the public email from the CV', async () => {
    expect((await content.getPage('home')).oneLiner.length).toBeLessThanOrEqual(160);
    const about = await content.getPage('about');
    expect(about.learningNow.length).toBeGreaterThan(0);
    expect(about.body.trim()).not.toBe('');
    expect(await content.getPublicEmail()).toMatch(/@/);
  });

  it('validates every page file and the CV', async () => {
    for (const name of ['home', 'about', 'how-i-work-with-ai', 'architecture', 'guardrails'] as const) {
      await expect(content.getPage(name)).resolves.toBeDefined();
    }
    await expect(content.getCv()).resolves.toBeDefined();
  });
});

describe('content validation errors', () => {
  it('rejects a home one-liner over 160 characters', async () => {
    const root = contentWith({
      'pages/home.mdx': (t) => t.replace(/oneLiner: .*/, `oneLiner: ${'x'.repeat(161)}`),
    });
    await expect(createContent(root).getPage('home')).rejects.toThrow(ContentError);
  });

  it('rejects an about stack missing a required technology', async () => {
    const root = contentWith({ 'pages/about.mdx': (t) => t.replace('  - RabbitMQ\n', '') });
    await expect(createContent(root).getPage('about')).rejects.toThrow(/RabbitMQ/);
  });

  it('rejects an empty "Learning now" list', async () => {
    const root = contentWith({
      'pages/about.mdx': (t) => t.replace(/learningNow:\n(?: {2}- .*\n)+/, 'learningNow: []\n'),
    });
    await expect(createContent(root).getPage('about')).rejects.toThrow(/learningNow/);
  });

  it('rejects unknown frontmatter fields', async () => {
    const root = contentWith({ 'pages/home.mdx': (t) => t.replace('---\n', '---\nonliner: typo\n') });
    await expect(createContent(root).getPage('home')).rejects.toThrow(/onliner|Unrecognized/);
  });

  it('rejects an invalid public email', async () => {
    const root = contentWith({ 'cv.mdx': (t) => t.replace(/publicEmail: .*/, 'publicEmail: not-an-email') });
    await expect(createContent(root).getPublicEmail()).rejects.toThrow(/publicEmail/);
  });

  it('names the file in the error when a page is missing', async () => {
    const root = contentWith({ 'pages/about.mdx': () => null });
    await expect(createContent(root).getPage('about')).rejects.toThrow(/about\.mdx: File not found/);
  });
});
