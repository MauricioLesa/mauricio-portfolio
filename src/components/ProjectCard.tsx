import Link from 'next/link';
import type { ProjectSummary } from '@/server/content';

type HeadingLevel = 2 | 3 | 4;

/** A project card. The title is the link, so its accessible name is the project title. */
export function ProjectCard({ project, headingLevel = 2 }: { project: ProjectSummary; headingLevel?: HeadingLevel }) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <Heading className="text-lg font-semibold leading-snug">
        <Link href={`/projects/${project.slug}`} className="hover:no-underline">
          {project.title}
        </Link>
      </Heading>
      <p className="text-sm text-muted">{project.summary}</p>
      <ul aria-label="Tech stack" className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {project.stack.map((tech) => (
          <li key={tech} className="rounded border border-border px-2 py-0.5 text-xs">
            {tech}
          </li>
        ))}
      </ul>
    </article>
  );
}
