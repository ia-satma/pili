import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ArrowLeft, History, Database } from "lucide-react";
import type { Initiative, InitiativeSnapshot } from "@shared/schema";

interface SnapshotsResponse {
  initiative: Initiative;
  snapshots: InitiativeSnapshot[];
  totalSnapshots: number;
}

export default function InitiativeDetail() {
  const params = useParams();
  const id = params.id;
  
  useDocumentTitle("Detalle de Iniciativa");
  
  const { data, isLoading } = useQuery<SnapshotsResponse>({
    queryKey: ['/api/initiatives', id, 'snapshots'],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data?.initiative) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Iniciativa no encontrada</p>
        <Link href="/initiatives">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a iniciativas
          </Button>
        </Link>
      </div>
    );
  }

  const { initiative, snapshots } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/initiatives">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="heading-initiative-title">{initiative.title}</h1>
          <p className="text-muted-foreground">ID: {initiative.id}</p>
        </div>
      </div>

      <Card data-testid="card-initiative-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Información de la Iniciativa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="font-medium" data-testid="text-owner">{initiative.owner || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status Actual</p>
              <p className="font-medium" data-testid="text-status">{initiative.currentStatus || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">DevOps Card ID</p>
              <p className="font-mono text-sm" data-testid="text-devops-id">{initiative.devopsCardId || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PowerSteering ID</p>
              <p className="font-mono text-sm" data-testid="text-ps-id">{initiative.powerSteeringId || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-snapshots-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Snapshots
          </CardTitle>
          <CardDescription>{snapshots.length} snapshot(s) registrados</CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-snapshots">
              No hay snapshots para esta iniciativa.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>% Avance</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Esfuerzo</TableHead>
                  <TableHead>Puntaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snap) => (
                  <TableRow key={snap.id} data-testid={`row-snapshot-${snap.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        Batch #{snap.batchId}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(snap.createdAt).toLocaleDateString("es-MX", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{snap.status || snap.estatusAlDia || "-"}</TableCell>
                    <TableCell>{snap.percentComplete ?? "-"}%</TableCell>
                    <TableCell className="font-mono">{snap.totalValor ?? "-"}</TableCell>
                    <TableCell className="font-mono">{snap.totalEsfuerzo ?? "-"}</TableCell>
                    <TableCell className="font-mono font-bold">{snap.puntajeTotal ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
