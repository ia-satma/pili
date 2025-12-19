import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ArrowLeft, User, Database, Info, TrendingUp, Zap } from "lucide-react";
import type { Initiative, InitiativeSnapshot } from "@shared/schema";

interface SnapshotsResponse {
  initiative: Initiative;
  snapshots: InitiativeSnapshot[];
  totalSnapshots: number;
}

export default function InitiativeDetail() {
  const params = useParams();
  const id = params.id;

  useDocumentTitle("Detalle del Proyecto");

  const { data, isLoading, error } = useQuery<SnapshotsResponse>({
    queryKey: ['/api/initiatives', id, 'snapshots'],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.initiative) {
    return (
      <div className="p-10 text-center max-w-md mx-auto">
        <div className="bg-destructive/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <Database className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold mb-2">Proyecto no encontrado</h2>
        <p className="text-muted-foreground mb-6">No pudimos encontrar los detalles de este proyecto o iniciativa.</p>
        <Link href="/">
          <Button variant="default">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const { initiative, snapshots } = data;
  const latestSnapshot = snapshots[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                {initiative.powerSteeringId || initiative.devopsCardId || "S/ID"}
              </Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold">
                {initiative.currentStatus || "Draft"}
              </Badge>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{initiative.title}</h1>
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
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Dueño / Responsable</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-lg">{initiative.owner || "Sin asignar"}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">ID PowerSteering</p>
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    <p className="font-mono font-medium">{initiative.powerSteeringId || "N/A"}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs font-bold text-muted-foreground uppercase opacity-70 mb-2">Descripción</p>
                <div className="prose prose-sm max-w-none text-foreground/80 bg-muted/30 p-4 rounded-lg border leading-relaxed">
                  {latestSnapshot?.description || "Sin descripción disponible."}
                </div>
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
                <trending-up className="h-5 w-5" />
                Matriz de Impacto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-white rounded-xl border-2 border-green-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div>
                    <p className="text-[10px] font-black uppercase text-green-600 tracking-widest">Valor</p>
                    <p className="text-4xl font-black">{latestSnapshot?.totalValor ?? "N/A"}</p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-full">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white rounded-xl border-2 border-orange-500/20 shadow-sm transition-all hover:scale-[1.02]">
                  <div>
                    <p className="text-[10px] font-black uppercase text-orange-600 tracking-widest">Esfuerzo</p>
                    <p className="text-4xl font-black">{latestSnapshot?.totalEsfuerzo ?? "N/A"}</p>
                  </div>
                  <div className="bg-orange-100 p-3 rounded-full">
                    <Zap className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
