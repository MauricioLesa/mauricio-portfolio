import 'server-only';
import { z } from 'zod';
import { getCv, getProject, getProjects, type Content } from '@/server/content';

// T065: the assistant's three read-only tools (data-model.md, "Assistant tools").
// Each tool is a pure lookup over the content functions. None of them writes anything, so even a
// model tricked by a prompt injection can only read public content.

export const TOOL_NAMES = ['list_projects', 'get_project', 'get_profile'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const PROFILE_SECTIONS = ['summary', 'skills', 'experience', 'education', 'contact'] as const;

/** The shape the Messages API expects for a tool. `strict: true` makes the API enforce the schema. */
export interface ToolDefinition {
  name: ToolName;
  description: string;
  strict: true;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export interface ToolResult {
  /** A small JSON string (or a short error message), sent back as the tool_result content. */
  content: string;
  isError: boolean;
}

/** Longest text a tool returns for one section, so later rounds don't carry big results. */
export const MAX_SECTION_CHARS = 1200;

// zod schemas: the server-side check, run even though `strict: true` should already guarantee them.
const ListProjectsInput = z.strictObject({
  tech: z.string().trim().min(1).max(50).optional(),
});
const GetProjectInput = z.strictObject({
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a slug from list_projects'),
});
const GetProfileInput = z.strictObject({
  section: z.enum(PROFILE_SECTIONS),
});

export const TOOL_DEFS: readonly ToolDefinition[] = [
  {
    name: 'list_projects',
    description:
      "List Mauricio's portfolio projects with their slug, title, summary and tech stack. Use it first for any " +
      'question about what he has built or which technologies he has used in projects. Pass `tech` to keep only ' +
      'projects whose stack contains that text (case-insensitive); leave it out to see every project and match ' +
      'synonyms yourself.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tech: { type: 'string', description: 'A technology to filter by, for example "React" or "RabbitMQ".' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_project',
    description:
      "Get one project's details: summary, stack, and its Problem, Architecture, Trade-offs and Results sections. " +
      'Use it when the user asks about a specific project or wants more detail than list_projects gives. ' +
      '`slug` must be a slug returned by list_projects.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The project slug from list_projects, for example "code-migration".' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_profile',
    description:
      "Get one section of Mauricio's CV: `summary` (headline, location and short bio), `skills`, `experience` " +
      '(companies, roles, dates and highlights), `education`, or `contact` (the public email only). Use it for ' +
      'questions about his background, skills, work history, education or how to contact him.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: [...PROFILE_SECTIONS], description: 'Which CV section to return.' },
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
];

type ContentSource = Pick<Content, 'getProjects' | 'getProject' | 'getCv'>;

/** Builds the tools over one content source, so tests can pass fixtures or a failing source. */
export function createTools(content: ContentSource) {
  async function listProjects({ tech }: z.infer<typeof ListProjectsInput>) {
    const needle = tech?.toLowerCase();
    const projects = await content.getProjects();
    return projects
      .filter((p) => !needle || p.stack.some((item) => item.toLowerCase().includes(needle)))
      .map(({ slug, title, summary, stack }) => ({ slug, title, summary, stack }));
  }

  async function getProjectDetails({ slug }: z.infer<typeof GetProjectInput>): Promise<ToolResult> {
    const project = await content.getProject(slug);
    if (!project) {
      return { isError: true, content: `No project with slug "${slug}". Call list_projects to get valid slugs.` };
    }
    const { title, summary, stack, body } = project;
    const sections = {
      problem: sectionOf(body, 'Problem'),
      architecture: sectionOf(body, 'Architecture'),
      tradeOffs: sectionOf(body, 'Trade-offs'),
      results: sectionOf(body, 'Results'),
    };
    return ok({ slug, title, summary, stack, sections });
  }

  async function getProfile({ section }: z.infer<typeof GetProfileInput>) {
    const cv = await content.getCv();
    switch (section) {
      case 'summary':
        return { name: cv.name, headline: cv.headline, location: cv.location, bio: clip(cv.body.trim()) };
      case 'skills':
        return cv.skills;
      case 'experience':
        return cv.experience;
      case 'education':
        return cv.education;
      case 'contact':
        // The only contact detail the assistant may share (FR-018).
        return { publicEmail: cv.publicEmail };
    }
  }

  /** Validates the input with zod, runs one tool, and never throws: every failure is an error result. */
  async function runTool(name: string, input: unknown): Promise<ToolResult> {
    try {
      switch (name) {
        case 'list_projects': {
          const parsed = ListProjectsInput.safeParse(input);
          return parsed.success ? ok(await listProjects(parsed.data)) : invalid(name, parsed.error);
        }
        case 'get_project': {
          const parsed = GetProjectInput.safeParse(input);
          return parsed.success ? await getProjectDetails(parsed.data) : invalid(name, parsed.error);
        }
        case 'get_profile': {
          const parsed = GetProfileInput.safeParse(input);
          return parsed.success ? ok(await getProfile(parsed.data)) : invalid(name, parsed.error);
        }
        default:
          return { isError: true, content: `Unknown tool "${name}". Available tools: ${TOOL_NAMES.join(', ')}.` };
      }
    } catch {
      // Don't send internal details (file paths, stack traces) to the model.
      return { isError: true, content: `The ${name} tool failed. Answer without it or try another tool.` };
    }
  }

  return { runTool };
}

/** The tools over the site's real content. */
export const { runTool } = createTools({ getProjects, getProject, getCv });

function ok(value: unknown): ToolResult {
  return { isError: false, content: JSON.stringify(value) };
}

function invalid(name: string, error: z.ZodError): ToolResult {
  const issues = error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  return { isError: true, content: `Invalid input for ${name}: ${issues}` };
}

/** The text under one `## Heading` of an MDX body, up to the next H2, clipped to MAX_SECTION_CHARS. */
export function sectionOf(body: string, heading: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return clip((end < 0 ? rest : rest.slice(0, end)).join('\n').trim());
}

function clip(text: string): string {
  return text.length <= MAX_SECTION_CHARS ? text : `${text.slice(0, MAX_SECTION_CHARS - 1).trimEnd()}…`;
}
