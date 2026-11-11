import { ContactLink } from "@/components/ContactLink";
import { CvDownloadLink } from "@/components/CvDownloadLink";
import { ProjectCard } from "@/components/ProjectCard";
import { getCv, getFeaturedProjects, getPage } from "@/server/content";

const primaryButton =
  "rounded bg-accent px-4 py-2 font-medium text-accent-contrast no-underline hover:opacity-90";
const secondaryButton =
  "rounded border border-accent px-4 py-2 font-medium no-underline hover:bg-surface";

// Home (FR-002): the one-liner, the 3 featured projects, "Contact me" and "Download CV".
// Everything sits above the fold at 1366x768 (V1).
export default async function Home() {
  const [cv, home, featured] = await Promise.all([getCv(), getPage("home"), getFeaturedProjects()]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold sm:text-4xl">{cv.name}</h1>
        <p data-testid="one-liner" className="max-w-2xl text-lg text-muted">
          {home.oneLiner}
        </p>
        <div className="flex flex-wrap gap-3">
          <ContactLink className={primaryButton} />
          <CvDownloadLink className={secondaryButton} />
        </div>
      </section>

      <section aria-labelledby="featured-heading" className="flex flex-col gap-4">
        <h2 id="featured-heading" className="text-xl font-semibold">
          Featured projects
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((project) => (
            <ProjectCard key={project.slug} project={project} headingLevel={3} />
          ))}
        </div>
      </section>
    </div>
  );
}
