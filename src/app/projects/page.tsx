import type { Metadata } from "next";
import { ProjectCard } from "@/components/ProjectCard";
import { getProjects } from "@/server/content";

export const metadata: Metadata = { title: "Projects" };

// The Projects list (FR-001): every project, newest first, each linking to its case study.
export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Projects</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} headingLevel={2} />
        ))}
      </div>
    </div>
  );
}
