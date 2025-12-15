import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const IMPACT_TYPE_OPTIONS = [
  "Eficiencia",
  "Costos",
  "Ingresos",
  "Riesgo",
  "Otro",
] as const;

const createProjectSchema = z.object({
  projectName: z.string().min(1, "Nombre del proyecto es requerido"),
  bpAnalyst: z.string().optional().nullable(),
  departmentName: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  problemStatement: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  scopeIn: z.string().optional().nullable(),
  scopeOut: z.string().optional().nullable(),
  impactType: z.array(z.string()).default([]),
  kpis: z.string().optional().nullable(),
  budget: z.number().min(0, "El presupuesto debe ser mayor o igual a 0").default(0),
  sponsor: z.string().optional().nullable(),
  leader: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

interface CreateProjectDialogProps {
  triggerClassName?: string;
}

export function CreateProjectDialog({ triggerClassName }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      projectName: "",
      bpAnalyst: "",
      departmentName: "",
      region: "",
      problemStatement: "",
      objective: "",
      scopeIn: "",
      scopeOut: "",
      impactType: [],
      kpis: "",
      budget: 0,
      sponsor: "",
      leader: "",
      startDate: null,
      endDate: null,
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: CreateProjectFormData) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Proyecto creado",
        description: "El proyecto se ha creado exitosamente.",
      });
      form.reset();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear proyecto",
        description: error.message || "Ocurrió un error al crear el proyecto.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateProjectFormData) => {
    createProjectMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={triggerClassName}
          data-testid="button-create-project"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle data-testid="text-dialog-title">Crear Nuevo Proyecto</DialogTitle>
          <DialogDescription>
            Completa la información del proyecto. Los campos marcados con * son requeridos.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-180px)] px-6">
          <Form {...form}>
            <form
              id="create-project-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 pb-4"
            >
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Identificación
                </h3>
                <Separator />

                <FormField
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del proyecto *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ingresa el nombre del proyecto"
                          data-testid="input-project-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bpAnalyst"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Process Analyst</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Nombre del analista"
                            data-testid="input-bp-analyst"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="departmentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Negocio/Área</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Departamento o área"
                            data-testid="input-department-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Región</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="Región del proyecto"
                          data-testid="input-region"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Definición
                </h3>
                <Separator />

                <FormField
                  control={form.control}
                  name="problemStatement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Qué problema u oportunidad se identifica?</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Describe el problema u oportunidad con hechos específicos"
                          className="min-h-[80px]"
                          data-testid="textarea-problem-statement"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="objective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intención / Urgencia</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Describe la intención o urgencia del proyecto"
                          className="min-h-[80px]"
                          data-testid="textarea-objective"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scopeIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Qué SÍ incluye?</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Define lo que el proyecto sí incluye"
                          className="min-h-[80px]"
                          data-testid="textarea-scope-in"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scopeOut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Qué NO incluye?</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Define lo que el proyecto NO incluye"
                          className="min-h-[80px]"
                          data-testid="textarea-scope-out"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Impacto y Recursos
                </h3>
                <Separator />

                <FormField
                  control={form.control}
                  name="impactType"
                  render={() => (
                    <FormItem>
                      <FormLabel>Tipo de Impacto</FormLabel>
                      <div className="flex flex-wrap gap-4 pt-2">
                        {IMPACT_TYPE_OPTIONS.map((option) => (
                          <FormField
                            key={option}
                            control={form.control}
                            name="impactType"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(option)}
                                    onCheckedChange={(checked) => {
                                      const currentValue = field.value || [];
                                      if (checked) {
                                        field.onChange([...currentValue, option]);
                                      } else {
                                        field.onChange(
                                          currentValue.filter((v) => v !== option)
                                        );
                                      }
                                    }}
                                    data-testid={`checkbox-impact-${option.toLowerCase()}`}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  {option}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="kpis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indicadores</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ""}
                          placeholder="Define los indicadores de éxito del proyecto"
                          className="min-h-[80px]"
                          data-testid="textarea-kpis"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="budget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Presupuesto Requerido</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          placeholder="0"
                          data-testid="input-budget"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Gobernanza
                </h3>
                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sponsor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patrocinador</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Nombre del patrocinador"
                            data-testid="input-sponsor"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="leader"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Líder del proyecto</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="Nombre del líder"
                            data-testid="input-leader"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha de inicio</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-start-date"
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP", { locale: es })
                                ) : (
                                  <span>Seleccionar fecha</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) =>
                                field.onChange(date ? format(date, "yyyy-MM-dd") : null)
                              }
                              disabled={(date) =>
                                date < new Date("1900-01-01")
                              }
                              initialFocus
                              data-testid="calendar-start-date"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha de término</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-end-date"
                              >
                                {field.value ? (
                                  format(new Date(field.value), "PPP", { locale: es })
                                ) : (
                                  <span>Seleccionar fecha</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) =>
                                field.onChange(date ? format(date, "yyyy-MM-dd") : null)
                              }
                              disabled={(date) =>
                                date < new Date("1900-01-01")
                              }
                              initialFocus
                              data-testid="calendar-end-date"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>
        <DialogFooter className="px-6 pb-6 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-project-form"
            disabled={createProjectMutation.isPending}
            data-testid="button-submit"
          >
            {createProjectMutation.isPending ? "Creando..." : "Crear Proyecto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateProjectTrigger({ className }: { className?: string }) {
  return <CreateProjectDialog triggerClassName={className} />;
}
