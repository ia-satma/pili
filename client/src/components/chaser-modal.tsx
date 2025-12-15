import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, AlertTriangle, Copy, Check, Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ChaserDraft {
  projectId: number;
  projectName: string;
  responsible: string | null;
  sponsor: string | null;
  department: string | null;
  triggeredBy: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  subject: string;
  body: string;
  suggestedAction: string;
  createdAt: string;
}

interface ChaserCycleResult {
  totalScanned: number;
  draftsGenerated: number;
  drafts: ChaserDraft[];
  cycleCompletedAt: string;
}

export function ChaserModal() {
  const [open, setOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<ChaserDraft | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const { toast } = useToast();

  const chaserMutation = useMutation({
    mutationFn: async (): Promise<ChaserCycleResult> => {
      const response = await fetch("/api/chaser/run-cycle", { method: "POST" });
      if (!response.ok) throw new Error("Error al ejecutar ciclo del Chaser");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.draftsGenerated === 0) {
        toast({
          title: "Sin borradores pendientes",
          description: `Se escanearon ${data.totalScanned} proyectos críticos. No se encontraron flags que requieran notificación.`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    },
  });

  const handleCopyToClipboard = async (draft: ChaserDraft) => {
    const emailContent = `Para: ${draft.responsible || draft.sponsor || "responsable@empresa.com"}
Asunto: ${draft.subject}

${draft.body}`;

    await navigator.clipboard.writeText(emailContent);
    setCopiedId(draft.projectId);
    toast({
      title: "Copiado al portapapeles",
      description: "El borrador del email ha sido copiado.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenMailClient = (draft: ChaserDraft) => {
    const to = draft.responsible || draft.sponsor || "";
    const subject = encodeURIComponent(draft.subject);
    const body = encodeURIComponent(draft.body);
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
  };

  const getSeverityBadge = (severity: "HIGH" | "MEDIUM" | "LOW") => {
    const config = {
      HIGH: { label: "Alta", className: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30" },
      MEDIUM: { label: "Media", className: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
      LOW: { label: "Baja", className: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30" },
    };
    return config[severity];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
            chaserMutation.mutate();
          }}
          disabled={chaserMutation.isPending}
          data-testid="button-run-chaser"
        >
          {chaserMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          GENERAR NOTIFICACIONES
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Borradores de Notificación - Chaser Agent
          </DialogTitle>
          <DialogDescription>
            Borradores generados automáticamente basados en flags de auditoría. Revisa y aprueba antes de enviar.
          </DialogDescription>
        </DialogHeader>

        {chaserMutation.isPending ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Escaneando proyectos críticos...</p>
          </div>
        ) : chaserMutation.data?.draftsGenerated === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-green-500/10 mb-4">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-medium mb-2">Sin notificaciones pendientes</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Se escanearon {chaserMutation.data.totalScanned} proyectos con salud crítica.
              No se encontraron flags que requieran notificación automática.
            </p>
          </div>
        ) : chaserMutation.data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">
                  Borradores ({chaserMutation.data.draftsGenerated})
                </h4>
                <Badge variant="outline" className="text-xs">
                  {chaserMutation.data.drafts.filter(d => d.severity === "HIGH").length} urgentes
                </Badge>
              </div>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {chaserMutation.data.drafts.map((draft, idx) => {
                    const severityConfig = getSeverityBadge(draft.severity);
                    return (
                      <div
                        key={`${draft.projectId}-${idx}`}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          selectedDraft?.projectId === draft.projectId && selectedDraft?.triggeredBy === draft.triggeredBy
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => setSelectedDraft(draft)}
                        data-testid={`draft-item-${draft.projectId}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-medium line-clamp-1">{draft.projectName}</span>
                          <Badge variant="outline" className={cn("text-xs shrink-0", severityConfig.className)}>
                            {severityConfig.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
                          {draft.triggeredBy}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Para: {draft.responsible || draft.sponsor || "Sin asignar"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="border rounded-lg p-4">
              {selectedDraft ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn("text-xs", getSeverityBadge(selectedDraft.severity).className)}>
                      Prioridad: {getSeverityBadge(selectedDraft.severity).label}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyToClipboard(selectedDraft)}
                        data-testid="button-copy-draft"
                      >
                        {copiedId === selectedDraft.projectId ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenMailClient(selectedDraft)}
                        data-testid="button-send-draft"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Abrir en Email
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Para:</span>
                      <p className="text-sm font-medium">{selectedDraft.responsible || selectedDraft.sponsor || "Sin asignar"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Asunto:</span>
                      <p className="text-sm font-medium">{selectedDraft.subject}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Mensaje:</span>
                      <ScrollArea className="h-[200px] mt-1">
                        <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/50 p-3 rounded-md">
                          {selectedDraft.body}
                        </pre>
                      </ScrollArea>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Acción sugerida:</span>
                      <p className="text-sm text-muted-foreground">{selectedDraft.suggestedAction}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Selecciona un borrador para ver el detalle</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
