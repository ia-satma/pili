import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ImportResult {
  success: boolean;
  created: number;
  errors: string[];
  message: string;
}

// CSV column mappings (Spanish -> English)
const COLUMN_MAPPINGS: Record<string, string> = {
  nombre: "projectName",
  proyecto: "projectName",
  "nombre del proyecto": "projectName",
  analista: "bpAnalyst",
  "business process analyst": "bpAnalyst",
  bp_analyst: "bpAnalyst",
  presupuesto: "budget",
  budget: "budget",
  problema: "problemStatement",
  "problema u oportunidad": "problemStatement",
  problem_statement: "problemStatement",
  objetivo: "objective",
  descripcion: "description",
  área: "departmentName",
  area: "departmentName",
  depto: "departmentName",
  departamento: "departmentName",
  negocio: "departmentName",
  region: "region",
  región: "region",
  estado: "status",
  status: "status",
  patrocinador: "sponsor",
  sponsor: "sponsor",
  lider: "leader",
  líder: "leader",
  leader: "leader",
  responsable: "responsible",
  prioridad: "priority",
  priority: "priority",
  indicadores: "kpis",
  kpis: "kpis",
  fecha_inicio: "startDate",
  "fecha inicio": "startDate",
  start_date: "startDate",
  fecha_fin: "endDate",
  "fecha fin": "endDate",
  end_date: "endDate",
};

function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;
    
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      const mappedKey = COLUMN_MAPPINGS[header] || header;
      row[mappedKey] = values[idx] || "";
    });
    rows.push(row);
  }
  
  return rows;
}

function sanitizeBudget(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

export function CsvImporter() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        setPreview(parsed);
        setResult(null);
      } catch (err) {
        toast({
          title: "Error al leer archivo",
          description: "No se pudo parsear el archivo CSV",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;

    setIsLoading(true);
    try {
      // Sanitize budget values before sending
      const cleanedProjects = preview.map(row => ({
        ...row,
        budget: sanitizeBudget(row.budget || ""),
      }));

      const response = await apiRequest("POST", "/api/projects/bulk", {
        projects: cleanedProjects,
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        toast({
          title: "Importación exitosa",
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
    } catch (error) {
      toast({
        title: "Error al importar",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setPreview(null);
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
        <Button variant="outline" data-testid="button-import-csv">
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Proyectos desde CSV
          </DialogTitle>
          <DialogDescription>
            Selecciona un archivo CSV con tus proyectos. Las columnas se mapean automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-csv-file"
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              data-testid="button-select-file"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Seleccionar Archivo CSV
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">
              Columnas soportadas: nombre, presupuesto, problema, analista, área, región, etc.
            </p>
          </div>

          {/* Preview */}
          {preview && preview.length > 0 && !result && (
            <div className="space-y-2">
              <p className="text-sm font-medium" data-testid="text-preview-count">
                Vista previa: {preview.length} filas encontradas
              </p>
              <div className="max-h-48 overflow-auto border rounded-lg">
                <table className="w-full text-sm" data-testid="table-csv-preview">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Nombre</th>
                      <th className="p-2 text-left">Analista</th>
                      <th className="p-2 text-left">Presupuesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="border-t" data-testid={`row-preview-${idx}`}>
                        <td className="p-2" data-testid={`cell-row-number-${idx}`}>{idx + 1}</td>
                        <td className="p-2" data-testid={`cell-project-name-${idx}`}>{row.projectName || row.nombre || "-"}</td>
                        <td className="p-2" data-testid={`cell-analyst-${idx}`}>{row.bpAnalyst || row.analista || "-"}</td>
                        <td className="p-2" data-testid={`cell-budget-${idx}`}>${sanitizeBudget(row.budget || row.presupuesto || "").toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 5 && (
                <p className="text-xs text-muted-foreground" data-testid="text-more-rows">
                  ...y {preview.length - 5} filas más
                </p>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div 
              className={`p-4 rounded-lg ${result.success ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}
              data-testid="container-import-result"
            >
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium" data-testid="text-import-message">{result.message}</span>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400" data-testid="container-import-errors">
                  <p className="font-medium">Errores:</p>
                  <ul className="list-disc list-inside">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i} data-testid={`text-error-${i}`}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...y {result.errors.length - 5} errores más</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-close-import">
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          {preview && !result && (
            <Button onClick={handleImport} disabled={isLoading} data-testid="button-confirm-import">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar {preview.length} proyectos
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
