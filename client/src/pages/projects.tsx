import { ProjectsGrid } from "@/components/projects-grid";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Projects() {
  useDocumentTitle("Proyectos");
  
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <p className="text-muted-foreground">
          Vista de todos los proyectos de mejora continua
        </p>
      </div>

      {/* Projects Grid */}
      <ProjectsGrid />
    </div>
  );
}
