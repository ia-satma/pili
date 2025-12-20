import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ArrowLeft, User, Database, Info, TrendingUp, Zap, CalendarX2 } from "lucide-react";
import type { Project } from "@shared/schema";

interface ProjectResponse {
    project: Project;
}

export default function ProjectPage() {
    const params = useParams();
    const [, setLocation] = useLocation();
    const id = params.id;

    useDocumentTitle("Detalle del Proyecto");

    const { data, isLoading, error } = useQuery<ProjectResponse>({
        queryKey: ['/api/projects', id],
        enabled: !!id,
        queryFn: () => fetch(`/api/projects/${id}`).then(r => {
            if (!r.ok) throw new Error("Error al obtener el proyecto");
            return r.json();
        }),
    });

    if (isLoading) {
        return (
            <div className="p-6 max-w-5xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-8 w-48" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (error || !data?.project) {
        return (
            <div className="p-10 text-center max-w-md mx-auto">
                <div className="bg-destructive/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Database className="h-8 w-8 text-destructive" />
                </div>
                <h2 className="text-xl font-bold mb-2">❌ Error: No se encontró el proyecto</h2>
                <p className="text-muted-foreground mb-6">No pudimos encontrar los detalles del proyecto con ID {id}.</p>
                <Button onClick={() => setLocation("/")} variant="default">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver al Dashboard
                </Button>
            </div>
        );
    }

    const { project } = data;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full"
                        onClick={() => setLocation("/")}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                                ID: {project.id}
                            </Badge>
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold">
                                {project.status || "Draft"}
                            </Badge>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">{project.projectName}</h1>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Info Cards */}
                <div className="lg:col-span-2 space-y-8">
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2 font-bold uppercase tracking-tight">
                                <Info className="h-5 w-5 text-primary" />
                                Información del Proyecto
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Dueño / Responsable</p>
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-primary" />
                                        <p className="font-semibold text-lg">{project.owner || "Sin asignar"}</p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">ID Power Steering</p>
                                    <div className="flex items-center gap-2">
                                        <Database className="h-4 w-4 text-primary" />
                                        <p className="font-mono font-medium">{project.legacyId || "N/A"}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70 mb-2">Descripción</p>
                                <div className="prose prose-sm max-w-none text-foreground/80 bg-muted/30 p-4 rounded-lg border leading-relaxed">
                                    {project.description || "Sin descripción disponible."}
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70 mb-2">Beneficios e Impacto</p>
                                <div className="prose prose-sm max-w-none text-foreground/80 bg-blue-50/50 p-4 rounded-lg border border-blue-100 leading-relaxed">
                                    {project.impactDescription || "No se han detallado los beneficios estimados."}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* NEW: Governance & Team Card */}
                    <Card className="border-2 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2 font-bold uppercase tracking-tight">
                                <User className="h-5 w-5 text-primary" />
                                Governance & Equipo
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Dueño del Proyecto</p>
                                <p className="font-medium">{project.owner || "Sin asignar"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Sponsor</p>
                                <p className="font-medium">{project.sponsor || "Sin asignar"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Líder de Iniciativa</p>
                                <p className="font-medium">{project.leader || "Sin asignar"}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Unidad de Negocio</p>
                                <Badge variant="outline">{project.businessUnit || project.departmentName || "General"}</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Scores and Metrics */}
                <div className="space-y-8">
                    <Card className="border-2 border-primary shadow-md overflow-hidden bg-primary/5">
                        <div className="bg-primary h-1 w-full" />
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2 font-black uppercase">
                                <TrendingUp className="h-5 w-5" />
                                Metas y Score
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 bg-white rounded-xl border-2 border-green-500/20 shadow-sm transition-all hover:scale-[1.02]">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-green-600 tracking-widest">Valor (Y)</p>
                                        <p className="text-4xl font-black">{project.totalValor ?? "N/A"}</p>
                                    </div>
                                    <div className="bg-green-100 p-3 rounded-full">
                                        <TrendingUp className="h-6 w-6 text-green-600" />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-white rounded-xl border-2 border-orange-500/20 shadow-sm transition-all hover:scale-[1.02]">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Esfuerzo (X)</p>
                                        <p className="text-4xl font-black">{project.totalEsfuerzo ?? "N/A"}</p>
                                    </div>
                                    <div className="bg-orange-100 p-3 rounded-full">
                                        <Zap className="h-6 w-6 text-orange-600" />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* NEW: Timeline Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2 font-bold uppercase tracking-tight">
                                <CalendarX2 className="h-5 w-5 text-primary" />
                                Cronograma
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg">
                                <div>
                                    <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Inicio</p>
                                    <p className="font-mono font-medium">{project.startDate || "N/A"}</p>
                                </div>
                                <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
                                <div className="text-right">
                                    <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Fin Estimado</p>
                                    <p className="font-mono font-medium">{project.endDate || "N/A"}</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="font-bold text-muted-foreground uppercase opacity-70">Progreso Reportado</span>
                                    <span className="font-bold">{project.progress || 0}%</span>
                                </div>
                                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-500"
                                        style={{ width: `${project.progress || 0}%` }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
