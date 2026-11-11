import type { Metadata } from "next";
import { CvDownloadLink } from "@/components/CvDownloadLink";
import { Mdx } from "@/components/Mdx";
import { getCv } from "@/server/content";

export const metadata: Metadata = { title: "CV" };

const sectionHeading = "text-xl font-semibold";

/** A role's date range, such as "2020-03 – 2022-12". An `end` of null means a current role. */
function Period({ start, end }: { start: string; end: string | null }) {
  return (
    <p className="text-sm text-muted">
      <time dateTime={start}>{start}</time> – {end ? <time dateTime={end}>{end}</time> : "Present"}
    </p>
  );
}

// The HTML CV (FR-007). It reads no query parameters, so it is fully static and cached like the
// other content pages (analysis C1). "Download CV" points at /api/cv/link, which US2 implements.
export default async function CvPage() {
  const cv = await getCv();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">{cv.name}</h1>
        <p className="text-lg">{cv.headline}</p>
        <p className="text-muted">{cv.location}</p>
        <div>
          <CvDownloadLink className="inline-block rounded bg-accent px-4 py-2 font-medium text-accent-contrast no-underline hover:opacity-90" />
        </div>
      </header>

      {cv.body.trim() && (
        <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
          <h2 id="summary-heading" className={sectionHeading}>
            Summary
          </h2>
          <Mdx source={cv.body} />
        </section>
      )}

      <section aria-labelledby="experience-heading" className="flex flex-col gap-4">
        <h2 id="experience-heading" className={sectionHeading}>
          Experience
        </h2>
        {cv.experience.map((job) => (
          <article key={`${job.company}-${job.start}`} className="flex flex-col gap-1">
            <h3 className="font-semibold">
              {job.role}, {job.company}
            </h3>
            <Period start={job.start} end={job.end} />
            {job.highlights.length > 0 && (
              <ul className="mt-1 list-disc space-y-1 pl-6">
                {job.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="skills-heading" className="flex flex-col gap-4">
        <h2 id="skills-heading" className={sectionHeading}>
          Skills
        </h2>
        {cv.skills.map((group) => {
          const headingId = `skills-${group.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return (
          <div key={group.group} className="flex flex-col gap-2">
            <h3 id={headingId} className="font-semibold">
              {group.group}
            </h3>
            <ul aria-labelledby={headingId} className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li key={item} className="rounded border border-border px-3 py-1 text-sm">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          );
        })}
      </section>

      <section aria-labelledby="education-heading" className="flex flex-col gap-3">
        <h2 id="education-heading" className={sectionHeading}>
          Education
        </h2>
        <ul className="space-y-1">
          {cv.education.map((entry) => (
            <li key={`${entry.institution}-${entry.degree}`}>
              {entry.degree}, {entry.institution} ({entry.year})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
