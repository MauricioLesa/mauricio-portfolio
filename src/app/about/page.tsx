import type { Metadata } from "next";
import { Mdx } from "@/components/Mdx";
import { getPage } from "@/server/content";

export const metadata: Metadata = { title: "About" };

// About (FR-003): background, the stack and the "Learning now" list.
export default async function About() {
  const about = await getPage("about");

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">About</h1>

      <section aria-labelledby="background-heading" className="flex flex-col gap-3">
        <h2 id="background-heading" className="text-xl font-semibold">
          Background
        </h2>
        <Mdx source={about.body} />
      </section>

      <section aria-labelledby="stack-heading" className="flex flex-col gap-3">
        <h2 id="stack-heading" className="text-xl font-semibold">
          Stack
        </h2>
        <ul aria-labelledby="stack-heading" className="flex flex-wrap gap-2">
          {about.stack.map((tech) => (
            <li key={tech} className="rounded border border-border px-3 py-1">
              {tech}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="learning-heading" className="flex flex-col gap-3">
        <h2 id="learning-heading" className="text-xl font-semibold">
          Learning now
        </h2>
        <ul aria-labelledby="learning-heading" className="list-disc space-y-1 pl-6">
          {about.learningNow.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
