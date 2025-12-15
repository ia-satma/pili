import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ImportMetadata {
  header_row: number | null;
  total_rows: number;
  columns_mapped: Record<string, string>;
  columns_unmapped: string[];
}

interface ImportResult {
  success: boolean;
  created: number;
  errors: string[];
  message: string;
  metadata?: ImportMetadata;
}

export function ExcelImporter() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    const validExtensions = ['.xlsx', '.xls'];
    const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt)) {
      toast({
        title: "Formato no soportado",
        description: "Por favor selecciona un archivo Excel (.xlsx o .xls)",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setFileName(file.name);
    setResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/projects/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data: ImportResult = await response.json();
      setResult(data);

      if (data.success) {
        toast({
          title: "Importación exitosa",
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      } else {
        toast({
          title: "Error en la importación",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      setResult({
        success: false,
        created: 0,
        errors: [errorMessage],
        message: "Error al procesar el archivo",
      });
      toast({
        title: "Error al importar",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setFileName(null);
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetState, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    }}>
      <DialogTrigger asChild>
        <Button variant="default" data-testid="button-import-excel">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar desde Excel (Detección Automática)
          </DialogTitle>
          <DialogDescription>
            Sube tu archivo Excel (.xlsx). El sistema detectará automáticamente la fila de encabezados buscando "Iniciativa".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg" data-testid="container-excel-info">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">Detección de Encabezados Inteligente</p>
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                  <li>Busca la columna "Iniciativa" en las primeras 15 filas</li>
                  <li>Maneja celdas combinadas (merged cells)</li>
                  <li>Mapea columnas automáticamente (Dueño → Sponsor, Esfuerzo → Budget)</li>
                  <li>Limpia datos numéricos de formatos de moneda</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="border-2 border-dashed rounded-lg p-6 text-center" data-testid="container-file-dropzone">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-excel-file"
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              data-testid="button-select-excel"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Seleccionar Archivo Excel
            </Button>
            {fileName && (
              <p className="mt-3 text-sm font-medium" data-testid="text-file-name">
                Archivo seleccionado: <span className="text-primary">{fileName}</span>
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Formatos soportados: .xlsx, .xls
            </p>
          </div>

          {result && (
            <div 
              className={`p-4 rounded-lg ${result.success ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}
              data-testid="container-excel-result"
            >
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium" data-testid="text-excel-message">{result.message}</span>
              </div>

              {result.metadata && (
                <div className="mt-3 text-sm space-y-2" data-testid="container-metadata">
                  {result.metadata.header_row !== null && (
                    <p className="text-muted-foreground" data-testid="text-header-row">
                      Encabezado detectado en fila: <span className="font-medium">{result.metadata.header_row + 1}</span>
                    </p>
                  )}
                  {Object.keys(result.metadata.columns_mapped).length > 0 && (
                    <div data-testid="container-mapped-columns">
                      <p className="text-muted-foreground mb-1">Columnas mapeadas:</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(result.metadata.columns_mapped).map(([excel, db], i) => (
                          <span 
                            key={i} 
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                            data-testid={`badge-mapped-${i}`}
                          >
                            {excel} → {db}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.metadata.columns_unmapped.length > 0 && (
                    <div data-testid="container-unmapped-columns">
                      <p className="text-muted-foreground mb-1">Columnas ignoradas:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.metadata.columns_unmapped.slice(0, 10).map((col, i) => (
                          <span 
                            key={i} 
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            data-testid={`badge-unmapped-${i}`}
                          >
                            {col}
                          </span>
                        ))}
                        {result.metadata.columns_unmapped.length > 10 && (
                          <span className="text-xs text-muted-foreground">
                            +{result.metadata.columns_unmapped.length - 10} más
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="mt-3 text-sm text-red-600 dark:text-red-400" data-testid="container-excel-errors">
                  <p className="font-medium">Errores/Advertencias:</p>
                  <ul className="list-disc list-inside mt-1">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="text-xs" data-testid={`text-excel-error-${i}`}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li className="text-xs">...y {result.errors.length - 5} más</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-close-excel-import">
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          {selectedFile && !result && (
            <Button onClick={handleImport} disabled={isLoading} data-testid="button-confirm-excel-import">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Excel
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
