import { PMOChat } from "@/components/pmo-chat";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Chat() {
  useDocumentTitle("PMO Bot");
  
  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-2xl font-semibold tracking-tight">PMO Bot</h1>
        <p className="text-muted-foreground">
          Consulta información de proyectos con el asistente
        </p>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 min-h-0">
        <PMOChat />
      </div>
    </div>
  );
}
