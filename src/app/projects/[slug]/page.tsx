import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mdx } from "@/components/Mdx";
import { getProject, getProjectSlugs } from "@/server/content";

// Every case study is prerendered at build time. With Cache Components on, `dynamicParams` isn't
// available, so an unknown slug renders at request time and getProject() returning null sends a 404.
export async function generateStaticParams() {
  const slugs = await getProjectSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const project = await getProject((await params).slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

// A case study (FR-004). The body's H2 sections (Problem, Architecture, Trade-offs, Results) are
// checked by content:check (T025); this page renders them as written.
export default async function CaseStudyPage({ params }: PageProps<"/projects/[slug]">) {
  const project = await getProject((await params).slug);
  if (!project) notFound();

  return (
    <article className="flex flex-col gap-6">
      <p>
        <Link href="/projects">← All projects</Link>
      </p>

      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">{project.title}</h1>
        <p className="text-lg text-muted">{project.summary}</p>
        <ul aria-label="Tech stack" className="flex flex-wrap gap-2">
          {project.stack.map((tech) => (
            <li key={tech} className="rounded border border-border px-3 py-1 text-sm">
              {tech}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Published <time dateTime={project.publishedAt}>{project.publishedAt}</time>
        </p>
      </header>

      {project.images?.map((image) => (
        // Frontmatter images have no known dimensions, so next/image (which needs them) doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={image.src} src={image.src} alt={image.alt} className="rounded border border-border" />
      ))}

      <Mdx source={project.body} />
    </article>
  );
}
