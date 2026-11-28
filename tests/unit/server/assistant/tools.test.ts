import { describe, expect, it } from 'vitest';
import { createContent } from '@/server/content';
import { createTools, MAX_SECTION_CHARS, PROFILE_SECTIONS, sectionOf, TOOL_DEFS } from '@/server/assistant/tools';
import { REPO_CONTENT } from '../content/helpers';

// T058: the assistant's read-only tools, over the seeded content in content/.
const content = createContent(REPO_CONTENT);
const { runTool } = createTools(content);

async function call(name: string, input: unknown) {
  const result = await runTool(name, input);
  return { ...result, data: result.isError ? undefined : (JSON.parse(result.content) as unknown) };
}

describe('list_projects', () => {
  it('returns every project as { slug, title, summary, stack } when there is no filter', async () => {
    const { isError, data } = await call('list_projects', {});
    const all = await content.getProjects();
    expect(isError).toBe(false);
    expect(data).toEqual(all.map(({ slug, title, summary, stack }) => ({ slug, title, summary, stack })));
  });

  it('filters by tech, case-insensitively, matching part of a stack item', async () => {
    // "react" matches "React" and "React Query" in code-migration, and nothing in the portfolio project.
    const { data } = await call('list_projects', { tech: 'REACT' });
    const slugs = (data as { slug: string }[]).map((p) => p.slug).sort();
    expect(slugs).toEqual(['code-migration']);
  });

  it('returns an empty list when nothing matches', async () => {
    const { isError, data } = await call('list_projects', { tech: 'COBOL' });
    expect(isError).toBe(false);
    expect(data).toEqual([]);
  });
});

describe('get_project', () => {
  it('returns the four case-study sections for a known slug, without the raw body', async () => {
    const { isError, data } = await call('get_project', { slug: 'code-migration' });
    expect(isError).toBe(false);
    const project = data as { sections: { problem: string; architecture: string; tradeOffs: string; results: string } };
    expect(project).not.toHaveProperty('body');
    expect(Object.keys(project.sections)).toEqual(['problem', 'architecture', 'tradeOffs', 'results']);
    expect(project.sections.problem.length).toBeGreaterThan(0);
    for (const text of Object.values(project.sections)) expect(text.length).toBeLessThanOrEqual(MAX_SECTION_CHARS);
  });

  it('returns an error result that points to list_projects for an unknown slug', async () => {
    const result = await runTool('get_project', { slug: 'does-not-exist' });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/list_projects/);
  });
});

describe('get_profile', () => {
  it.each(PROFILE_SECTIONS)('returns the %s section', async (section) => {
    const { isError, content: text } = await call('get_profile', { section });
    expect(isError).toBe(false);
    expect(text.length).toBeGreaterThan(2);
  });

  it('returns only the public email for contact', async () => {
    const { data } = await call('get_profile', { section: 'contact' });
    expect(data).toEqual({ publicEmail: await content.getPublicEmail() });
  });
});

describe('runTool', () => {
  it.each([
    ['a missing required field', 'get_project', {}],
    ['a wrong type', 'get_project', { slug: 42 }],
    ['a value outside the enum', 'get_profile', { section: 'salary' }],
    ['an extra field', 'list_projects', { tech: 'React', limit: 5 }],
    ['input that is not an object', 'list_projects', null],
  ] as const)('returns isError for %s, without throwing', async (_case, name, input) => {
    const result = await runTool(name, input);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/^Invalid input for /);
  });

  it('returns isError for an unknown tool name', async () => {
    const result = await runTool('delete_project', { slug: 'code-migration' });
    expect(result).toEqual({ isError: true, content: expect.stringMatching(/Unknown tool "delete_project"/) });
  });

  it('turns a failing content source into an error result without internal details', async () => {
    const failing = createTools({
      getProjects: () => Promise.reject(new Error('ENOENT: /secret/path/content')),
      getProject: () => Promise.reject(new Error('boom')),
      getCv: () => Promise.reject(new Error('boom')),
    });
    const result = await failing.runTool('list_projects', {});
    expect(result.isError).toBe(true);
    expect(result.content).not.toMatch(/secret|ENOENT/);
  });
});

describe('TOOL_DEFS', () => {
  it('defines exactly the three read-only tools', () => {
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(['list_projects', 'get_project', 'get_profile']);
  });

  it.each(TOOL_DEFS.map((t) => [t.name, t] as const))('%s is strict and says when to use it', (_name, tool) => {
    expect(tool.strict).toBe(true);
    expect(tool.input_schema.additionalProperties).toBe(false);
    expect(tool.description).toMatch(/Use it /);
    for (const field of tool.input_schema.required) expect(tool.input_schema.properties).toHaveProperty(field);
  });
});

describe('sectionOf', () => {
  it('stops at the next H2 and handles CRLF bodies', () => {
    const body = '## Problem\r\nSlow builds.\r\n\r\n## Results\r\nFaster.';
    expect(sectionOf(body, 'Problem')).toBe('Slow builds.');
    expect(sectionOf(body, 'Results')).toBe('Faster.');
    expect(sectionOf(body, 'Architecture')).toBe('');
  });
});
