import { z } from 'zod';

// Zod schemas for the frontmatter of every file in content/ (data-model.md section 1).
// Objects are strict, so a misspelled field fails the build instead of being silently ignored.

/** YAML turns unquoted dates (2026-01-15) into Date objects; accept both and keep a yyyy-mm-dd string. */
const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.iso.date(),
);

const nonEmpty = z.string().trim().min(1);

export const REQUIRED_ABOUT_STACK = [
  'Node.js',
  'TypeScript',
  'React',
  'Next.js',
  'Docker',
  'Redis',
  'RabbitMQ',
  'AWS',
] as const;

export const GUARDRAIL_CATEGORY_IDS = [
  'off-topic',
  'system-prompt',
  'contact-data',
  'unsupported-claim',
] as const;

export const ProjectFrontmatter = z
  .strictObject({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens'),
    title: nonEmpty.max(80),
    summary: nonEmpty.max(200),
    featured: z.boolean(),
    featuredRank: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    stack: z.array(nonEmpty).min(1),
    images: z.array(z.strictObject({ src: nonEmpty, alt: z.string() })).optional(),
    publishedAt: isoDate,
  })
  .superRefine((project, ctx) => {
    if (project.featured && project.featuredRank === undefined) {
      ctx.addIssue({ code: 'custom', path: ['featuredRank'], message: 'Required when featured is true' });
    }
    if (!project.featured && project.featuredRank !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['featuredRank'], message: 'Only featured projects have a rank' });
    }
  });

export const CvFrontmatter = z.strictObject({
  name: nonEmpty,
  headline: nonEmpty,
  location: nonEmpty,
  publicEmail: z.email(),
  experience: z
    .array(
      z.strictObject({
        company: nonEmpty,
        role: nonEmpty,
        start: nonEmpty,
        end: nonEmpty.nullable(),
        highlights: z.array(nonEmpty),
      }),
    )
    .min(1),
  skills: z.array(z.strictObject({ group: nonEmpty, items: z.array(nonEmpty).min(1) })).min(1),
  education: z.array(
    z.strictObject({ institution: nonEmpty, degree: nonEmpty, year: z.union([nonEmpty, z.number().int()]) }),
  ),
  pdfVersion: nonEmpty,
});

export const PageSchemas = {
  home: z.strictObject({
    oneLiner: nonEmpty.max(160),
  }),
  about: z.strictObject({
    stack: z.array(nonEmpty).refine((stack) => REQUIRED_ABOUT_STACK.every((tech) => stack.includes(tech)), {
      message: `Must include ${REQUIRED_ABOUT_STACK.join(', ')}`,
    }),
    learningNow: z.array(nonEmpty).min(1),
  }),
  'how-i-work-with-ai': z.strictObject({
    steps: z.array(nonEmpty).min(1),
  }),
  architecture: z.strictObject({
    practices: z.array(z.strictObject({ name: nonEmpty, where: nonEmpty })).min(1),
  }),
  guardrails: z.strictObject({
    categories: z
      .array(
        z.strictObject({
          id: z.enum(GUARDRAIL_CATEGORY_IDS),
          reason: nonEmpty,
          examples: z.array(z.strictObject({ prompt: nonEmpty, response: nonEmpty })).min(1),
        }),
      )
      .min(1),
  }),
} as const;

export type PageName = keyof typeof PageSchemas;
export const PAGE_NAMES = Object.keys(PageSchemas) as PageName[];

export type ProjectSummary = z.infer<typeof ProjectFrontmatter>;
export type Project = ProjectSummary & { body: string };
export type Cv = z.infer<typeof CvFrontmatter> & { body: string };
export type PageContent<N extends PageName> = z.infer<(typeof PageSchemas)[N]> & { body: string };
