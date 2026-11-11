import path from 'node:path';
import type { z } from 'zod';
import { ContentError, createLoader } from './loader';
import {
  CvFrontmatter,
  PageSchemas,
  ProjectFrontmatter,
  type Cv,
  type PageContent,
  type PageName,
  type Project,
  type ProjectSummary,
} from './schemas';

export { ContentError } from './loader';
export type { Cv, PageContent, PageName, Project, ProjectSummary } from './schemas';

const PROJECTS_DIR = 'projects';
const FEATURED_COUNT = 3;

/** The content functions from contracts/server-modules.md, bound to one content root. */
export function createContent(root: string) {
  const loader = createLoader(root);

  function loadProject(fileName: string): Project {
    const { file, data, body } = loader.load(path.join(PROJECTS_DIR, fileName), ProjectFrontmatter);
    const expectedSlug = fileName.replace(/\.mdx$/, '');
    if (data.slug !== expectedSlug) {
      throw new ContentError(file, `slug "${data.slug}" must match the file name "${expectedSlug}"`);
    }
    return { ...data, body };
  }

  function loadAllProjects(): Project[] {
    return loader.list(PROJECTS_DIR).map(loadProject);
  }

  function toSummary(project: Project): ProjectSummary {
    const summary: Partial<Project> = { ...project };
    delete summary.body;
    return summary as ProjectSummary;
  }

  function loadCv(): Cv {
    const { data, body } = loader.load('cv.mdx', CvFrontmatter);
    return { ...data, body };
  }

  return {
    /** Every project, newest first. */
    async getProjects(): Promise<ProjectSummary[]> {
      return loadAllProjects()
        .map(toSummary)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    },

    /** Exactly 3 projects, ordered by featuredRank. Throws if the content doesn't have exactly 3. */
    async getFeaturedProjects(): Promise<ProjectSummary[]> {
      const featured = loadAllProjects()
        .filter((p) => p.featured)
        .map(toSummary)
        .sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0));
      if (featured.length !== FEATURED_COUNT) {
        throw new ContentError(
          path.join(root, PROJECTS_DIR),
          `Expected exactly ${FEATURED_COUNT} featured projects, found ${featured.length}`,
        );
      }
      return featured;
    },

    /** One project with its MDX body, or null when the slug is unknown. */
    async getProject(slug: string): Promise<Project | null> {
      const fileName = `${slug}.mdx`;
      if (!loader.list(PROJECTS_DIR).includes(fileName)) return null;
      return loadProject(fileName);
    },

    async getProjectSlugs(): Promise<string[]> {
      return loadAllProjects().map((p) => p.slug);
    },

    async getCv(): Promise<Cv> {
      return loadCv();
    },

    async getPage<N extends PageName>(name: N): Promise<PageContent<N>> {
      // TypeScript can't narrow the indexed schema for a generic N, so widen and re-assert.
      const schema: z.ZodType<Record<string, unknown>> = PageSchemas[name];
      const { data, body } = loader.load(path.join('pages', `${name}.mdx`), schema);
      return { ...data, body } as PageContent<N>;
    },

    /** The single contact detail allowed anywhere on the site (FR-005). */
    async getPublicEmail(): Promise<string> {
      return loadCv().publicEmail;
    },
  };
}

export type Content = ReturnType<typeof createContent>;

const content = createContent(path.join(process.cwd(), 'content'));

export const {
  getProjects,
  getFeaturedProjects,
  getProject,
  getProjectSlugs,
  getCv,
  getPage,
  getPublicEmail,
} = content;
