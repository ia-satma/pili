import { useDocumentTitle } from "@/hooks/use-document-title";
import { SmartProjectGrid } from "@/components/smart-project-grid";

export default function ProjectMaster() {
  useDocumentTitle("Project Master");

  return (
    <div className="flex flex-col h-full" data-testid="page-project-master">
      <div className="p-6 pb-4" data-testid="header-project-master">
        <h1 className="text-2xl font-semibold tracking-tight">Project Master View</h1>
        <p className="text-muted-foreground">
          Grid editable tipo Excel para gestión de proyectos
        </p>
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-6" data-testid="container-smart-grid">
        <SmartProjectGrid />
      </div>
    </div>
  );
}
