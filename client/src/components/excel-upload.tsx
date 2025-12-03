import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, AlertTriangle, FileWarning, Eye, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface RowWarning {
  fila: number;
  tipo: string;
  mensaje: string;
}

interface UploadResponse {
  success: boolean;
  versionId: number;
  fileName: string;
  totalRows: number;
  proyectosCreados: number;
  proyectosBorradorIncompleto: number;
  filasDescartadas: number;
  advertencias: RowWarning[];
  changes: {
    added: number;
    modified: number;
    deleted: number;
  };
}

export function ExcelUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { isEditor, isLoading: authLoading } = useAuth();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      // Add timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      try {
        const response = await fetch("/api/excel/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Sesión expirada. Por favor inicia sesión nuevamente.");
          }
          if (response.status === 403) {
            throw new Error("No tienes permisos para subir archivos. Contacta a un administrador.");
          }
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Error al subir el archivo");
        }

        return response.json() as Promise<UploadResponse>;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error("Tiempo de espera agotado. Intenta con un archivo más pequeño.");
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      setLastUpload(data);
      setUploadProgress(100);
      setShowAllWarnings(false);
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });

      const totalProcessed = data.proyectosCreados + data.proyectosBorradorIncompleto;
      toast({
        title: "Archivo procesado",
        description: `${totalProcessed} proyectos procesados. ${data.proyectosCreados} completos, ${data.proyectosBorradorIncompleto} borradores.`,
      });
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      
      // Check if it's an auth error
      const isAuthError = error.message.includes("Sesión") || error.message.includes("401") || error.message.includes("permisos");
      
      toast({
        title: isAuthError ? "Problema de autenticación" : "Error al procesar el archivo",
        description: error.message,
        variant: "destructive",
      });
      
      // If auth error, suggest re-login
      if (isAuthError) {
        console.error("[Upload] Auth error - user should re-login");
      }
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Check authentication first
      if (!isEditor) {
        toast({
          title: "No autenticado",
          description: "Debes iniciar sesión para subir archivos",
          variant: "destructive",
        });
        return;
      }

      const validTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];
      
      if (!validTypes.includes(file.type) && !file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        toast({
          title: "Tipo de archivo inválido",
          description: "Por favor sube un archivo Excel (.xlsx o .xls)",
          variant: "destructive",
        });
        return;
      }

      setUploadProgress(0);
      setLastUpload(null);
      
      // Show immediate feedback
      setUploadProgress(10);
      
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85; // Stay at 85% while processing
          }
          return prev + 5;
        });
      }, 300);

      uploadMutation.mutate(file, {
        onSettled: () => {
          clearInterval(progressInterval);
        },
        onError: () => {
          clearInterval(progressInterval);
          setUploadProgress(0);
        },
      });
    },
    [uploadMutation, toast, isEditor]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: uploadMutation.isPending || !isEditor,
  });

  if (!authLoading && !isEditor) {
    return (
      <div className="space-y-6">
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Acceso Restringido
            </CardTitle>
            <CardDescription>
              No tienes permisos para cargar archivos Excel. Contacta a un administrador si necesitas acceso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-8 text-center border-border opacity-50">
              <div className="flex flex-col items-center gap-4">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-lg font-medium text-muted-foreground">
                    Función de carga deshabilitada
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Solo los usuarios con rol de Editor o Admin pueden cargar archivos
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const navigateToProjects = (filter?: string) => {
    if (filter === "drafts") {
      setLocation("/projects?filter=borradores");
    } else {
      setLocation("/projects");
    }
  };

  const warningsToShow = showAllWarnings 
    ? lastUpload?.advertencias || []
    : (lastUpload?.advertencias || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Cargar Archivo Excel
          </CardTitle>
          <CardDescription>
            Sube la matriz de proyectos para actualizar el sistema. El archivo será validado y los cambios se registrarán en la bitácora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragActive && !isDragReject && "border-primary bg-primary/5",
              isDragReject && "border-destructive bg-destructive/5",
              !isDragActive && "border-border hover:border-primary/50 hover:bg-muted/50",
              uploadMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
            data-testid="dropzone-excel"
          >
            <input {...getInputProps()} data-testid="input-excel-file" />
            
            <div className="flex flex-col items-center gap-4">
              {uploadMutation.isPending ? (
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
              ) : isDragActive ? (
                <Upload className="h-12 w-12 text-primary" />
              ) : (
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
              )}
              
              <div className="space-y-2">
                {isDragActive ? (
                  <p className="text-lg font-medium">Suelta el archivo aquí</p>
                ) : (
                  <>
                    <p className="text-lg font-medium">
                      Arrastra y suelta tu archivo Excel aquí
                    </p>
                    <p className="text-sm text-muted-foreground">
                      o haz clic para seleccionar un archivo
                    </p>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  Formatos soportados: .xlsx, .xls
                </p>
              </div>
            </div>
          </div>

          {(uploadMutation.isPending || uploadProgress > 0) && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {uploadMutation.isPending ? "Procesando archivo..." : "Completado"}
                </span>
                <span className="font-medium">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {lastUpload && (
        <Card className="overflow-visible" data-testid="upload-result">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {lastUpload.success ? (
                <CheckCircle2 className="h-5 w-5 text-traffic-green" />
              ) : (
                <XCircle className="h-5 w-5 text-traffic-red" />
              )}
              Resultado del Procesamiento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Archivo</p>
                <p className="text-sm font-medium truncate" data-testid="text-filename">{lastUpload.fileName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Filas Totales</p>
                <p className="text-sm font-medium" data-testid="text-total-rows">{lastUpload.totalRows}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-traffic-green/10 border border-traffic-green/20">
                <CheckCircle2 className="h-8 w-8 text-traffic-green flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-traffic-green" data-testid="text-created-count">
                    {lastUpload.proyectosCreados}
                  </p>
                  <p className="text-xs text-muted-foreground">Proyectos Creados</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 rounded-lg bg-traffic-yellow/10 border border-traffic-yellow/20">
                <AlertTriangle className="h-8 w-8 text-traffic-yellow flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-traffic-yellow" data-testid="text-draft-count">
                    {lastUpload.proyectosBorradorIncompleto}
                  </p>
                  <p className="text-xs text-muted-foreground">Borradores Incompletos</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <FileWarning className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-muted-foreground" data-testid="text-discarded-count">
                    {lastUpload.filasDescartadas}
                  </p>
                  <p className="text-xs text-muted-foreground">Filas Descartadas</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="bg-traffic-green/20 text-traffic-green border-0">
                +{lastUpload.changes.added} nuevos
              </Badge>
              <Badge className="bg-traffic-yellow/20 text-traffic-yellow border-0">
                ~{lastUpload.changes.modified} modificados
              </Badge>
              <Badge className="bg-traffic-red/20 text-traffic-red border-0">
                -{lastUpload.changes.deleted} eliminados
              </Badge>
            </div>

            {lastUpload.advertencias.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-traffic-yellow" />
                    Advertencias ({lastUpload.advertencias.length})
                  </p>
                  {lastUpload.advertencias.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllWarnings(!showAllWarnings)}
                      data-testid="button-toggle-warnings"
                    >
                      {showAllWarnings ? "Ver menos" : `Ver todas (${lastUpload.advertencias.length})`}
                    </Button>
                  )}
                </div>
                <ul className="text-sm text-muted-foreground space-y-2 max-h-60 overflow-y-auto">
                  {warningsToShow.map((warning, index) => (
                    <li 
                      key={index} 
                      className="flex items-start gap-2 p-2 rounded bg-muted/50"
                      data-testid={`warning-item-${index}`}
                    >
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "flex-shrink-0 text-xs",
                          warning.tipo === "row_empty" || warning.tipo === "row_unreadable" 
                            ? "border-muted-foreground/50" 
                            : "border-traffic-yellow/50 text-traffic-yellow"
                        )}
                      >
                        Fila {warning.fila}
                      </Badge>
                      <span className="text-xs">{warning.mensaje}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="default"
                onClick={() => navigateToProjects()}
                className="flex-1 min-w-[140px]"
                data-testid="button-view-projects"
              >
                <Eye className="h-4 w-4 mr-2" />
                Ver proyectos creados
              </Button>
              
              {lastUpload.proyectosBorradorIncompleto > 0 && (
                <Button
                  variant="outline"
                  onClick={() => navigateToProjects("drafts")}
                  className="flex-1 min-w-[140px] border-traffic-yellow/50 text-traffic-yellow hover:bg-traffic-yellow/10"
                  data-testid="button-view-drafts"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Ver borradores incompletos
                </Button>
              )}
              
              <Button
                variant="ghost"
                onClick={() => setLastUpload(null)}
                data-testid="button-clear-result"
              >
                Subir otro archivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
