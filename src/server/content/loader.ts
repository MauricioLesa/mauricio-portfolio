import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { z } from 'zod';

type Issue = z.core.$ZodIssue;

/** Invalid or missing content. It fails the build, naming the file and listing the zod issues. */
export class ContentError extends Error {
  override readonly name = 'ContentError';

  constructor(
    readonly file: string,
    readonly reason: string,
    readonly issues: readonly Issue[] = [],
  ) {
    const details = issues.map((i) => `\n  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('');
    super(`${file}: ${reason}${details}`);
  }
}

export type ParsedFile<T> = { file: string; data: T; body: string };

/**
 * Reads and validates MDX files under one content root, caching each file for the life of the
 * process. Reads are synchronous on purpose: pages are prerendered at build time, and synchronous
 * work finishes during prerendering instead of being treated as request-time data.
 */
export function createLoader(root: string) {
  const cache = new Map<string, ParsedFile<unknown>>();

  function load<S extends z.ZodType>(relativePath: string, schema: S): ParsedFile<z.infer<S>> {
    const cached = cache.get(relativePath);
    if (cached) return cached as ParsedFile<z.infer<S>>;

    const file = path.join(root, relativePath);
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      throw new ContentError(file, 'File not found');
    }

    let parsed: { data: Record<string, unknown>; content: string };
    try {
      // Passing an options object stops gray-matter from caching results by content string.
      parsed = matter(raw, {});
    } catch (error) {
      throw new ContentError(file, `Invalid frontmatter: ${(error as Error).message}`);
    }

    const result = schema.safeParse(parsed.data);
    if (!result.success) throw new ContentError(file, 'Invalid frontmatter', result.error.issues);

    const entry: ParsedFile<z.infer<S>> = { file, data: result.data, body: parsed.content };
    cache.set(relativePath, entry);
    return entry;
  }

  /** The `.mdx` file names in a directory under the root, sorted. */
  function list(relativeDir: string): string[] {
    const dir = path.join(root, relativeDir);
    try {
      return readdirSync(dir)
        .filter((name) => name.endsWith('.mdx'))
        .sort();
    } catch {
      throw new ContentError(dir, 'Directory not found');
    }
  }

  return { root, load, list };
}

export type Loader = ReturnType<typeof createLoader>;
