import { describe, expect, it } from 'vitest';
import { createContent } from '@/server/content';
import { contentWith, REPO_CONTENT } from './helpers';

// T036: the project content functions.
describe('project content functions', () => {
  const content = createContent(REPO_CONTENT);

  it('returns exactly 3 featured projects ordered by featuredRank', async () => {
    const featured = await content.getFeaturedProjects();
    expect(featured.map((p) => p.featuredRank)).toEqual([1, 2, 3]);
  });

  it('returns all projects newest first, without their bodies', async () => {
    const projects = await content.getProjects();
    const dates = projects.map((p) => p.publishedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(projects[0]).not.toHaveProperty('body');
  });

  it('returns a project with its body, and null for an unknown slug', async () => {
    const [first] = await content.getProjectSlugs();
    expect(first).toBeDefined();
    const project = await content.getProject(first!);
    expect(project?.body).toContain('## Problem');
    expect(await content.getProject('unknown')).toBeNull();
  });

  it('keeps publishedAt as a yyyy-mm-dd string even when YAML parses it as a date', async () => {
    const [project] = await content.getProjects();
    expect(project?.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('project validation errors', () => {
  it('rejects a slug that does not match the file name', async () => {
    const root = contentWith({ 'projects/code-migration.mdx': (t) => t.replace('slug: code-migration', 'slug: other') });
    await expect(createContent(root).getProjects()).rejects.toThrow(/must match the file name/);
  });

  it('rejects a featured project without a rank', async () => {
    const root = contentWith({ 'projects/project-two.mdx': (t) => t.replace(/featuredRank: \d\n/, '') });
    await expect(createContent(root).getProjects()).rejects.toThrow(/featuredRank/);
  });

  it('fails getFeaturedProjects when there are not exactly 3 featured projects', async () => {
    const root = contentWith({ 'projects/project-three.mdx': () => null });
    await expect(createContent(root).getFeaturedProjects()).rejects.toThrow(/exactly 3/);
  });
});
