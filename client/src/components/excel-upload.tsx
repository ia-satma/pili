import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UploadResponse {
  success: boolean;
  versionId: number;
  fileName: string;
  totalRows: number;
  processedRows: number;
  errors: string[];
  changes: {
    added: number;
    modified: number;
    deleted: number;
  };
}

export function ExcelUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/excel/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al subir el archivo");
      }

      return response.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setLastUpload(data);
      setUploadProgress(100);
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });

      toast({
        title: "Archivo procesado exitosamente",
        description: `${data.processedRows} filas procesadas. ${data.changes.added} nuevos, ${data.changes.modified} modificados.`,
      });
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      toast({
        title: "Error al procesar el archivo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Validate file type
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

      // Simulate progress for UX
      setUploadProgress(0);
      setLastUpload(null);
      
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      uploadMutation.mutate(file, {
        onSettled: () => {
          clearInterval(progressInterval);
        },
      });
    },
    [uploadMutation, toast]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: uploadMutation.isPending,
  });

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

          {/* Upload Progress */}
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

      {/* Upload Result */}
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
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Archivo</p>
                <p className="text-sm font-medium truncate">{lastUpload.fileName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Filas Totales</p>
                <p className="text-sm font-medium">{lastUpload.totalRows}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Procesadas</p>
                <p className="text-sm font-medium">{lastUpload.processedRows}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Versión ID</p>
                <p className="text-sm font-medium">{lastUpload.versionId}</p>
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

            {lastUpload.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Errores de validación:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {lastUpload.errors.slice(0, 5).map((error, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                      {error}
                    </li>
                  ))}
                  {lastUpload.errors.length > 5 && (
                    <li className="text-xs">
                      Y {lastUpload.errors.length - 5} errores más...
                    </li>
                  )}
                </ul>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => setLastUpload(null)}
              className="w-full"
              data-testid="button-clear-result"
            >
              Subir otro archivo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
