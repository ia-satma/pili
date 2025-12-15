import { ExcelUpload } from "@/components/excel-upload";
import { IngestionStatus } from "@/components/ingestion-status";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Upload() {
  useDocumentTitle("Cargar Excel");
  const { toast } = useToast();
  
  const purgeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/purge-all");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Base de datos purgada",
        description: "Carga tu Excel para comenzar de nuevo.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ingestion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/changes"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al purgar la base de datos",
        variant: "destructive",
      });
    },
  });
  
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-upload">Cargar Excel</h1>
        <p className="text-muted-foreground">
          Sube la matriz de proyectos para actualizar el sistema
        </p>
      </div>

      {/* Excel Upload Component */}
      <ExcelUpload />

      {/* H1 Ingestion Status */}
      <IngestionStatus />

      {/* Database Purge Section */}
      <Card className="border-destructive/50" data-testid="card-purge-database">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de Peligro
          </CardTitle>
          <CardDescription>
            Elimina todos los datos de la base de datos para comenzar desde cero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                data-testid="button-purge-database"
                disabled={purgeMutation.isPending}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {purgeMutation.isPending ? "Purgando..." : "PURGAR BASE DE DATOS (RESET)"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="dialog-purge-confirm">
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="dialog-purge-title">¿Purgar toda la base de datos?</AlertDialogTitle>
                <AlertDialogDescription data-testid="dialog-purge-description">
                  Esta acción eliminará TODOS los proyectos, historial y registros. No se puede deshacer. Después deberás cargar tu archivo Excel maestro nuevamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-purge-cancel">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => purgeMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-purge-confirm"
                >
                  Sí, purgar todo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
