import { ProjectsGrid } from "@/components/projects-grid";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { CsvImporter } from "@/components/csv-importer";

export default function Projects() {
  useDocumentTitle("Proyectos");
  
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-muted-foreground">
            Vista de todos los proyectos de mejora continua
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvImporter />
          <CreateProjectDialog />
        </div>
      </div>

      {/* Projects Grid */}
      <ProjectsGrid />
    </div>
  );
}
