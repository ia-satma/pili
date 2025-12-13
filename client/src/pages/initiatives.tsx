import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Initiative } from "@shared/schema";

interface InitiativesResponse {
  initiatives: Initiative[];
}

export default function Initiatives() {
  useDocumentTitle("Iniciativas");
  
  const { data, isLoading } = useQuery<InitiativesResponse>({
    queryKey: ["/api/initiatives"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Iniciativas</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const initiatives = data?.initiatives || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="heading-initiatives">Iniciativas</h1>
        <p className="text-muted-foreground">Modelo canónico de iniciativas con historial de snapshots</p>
      </div>

      <Card data-testid="card-initiatives-list">
        <CardHeader>
          <CardTitle>Lista de Iniciativas</CardTitle>
          <CardDescription>{initiatives.length} iniciativas registradas</CardDescription>
        </CardHeader>
        <CardContent>
          {initiatives.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="text-no-initiatives">
              No hay iniciativas registradas. Sube un archivo Excel para crear iniciativas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>DevOps ID</TableHead>
                  <TableHead className="w-20">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initiatives.map((init) => (
                  <TableRow key={init.id} data-testid={`row-initiative-${init.id}`}>
                    <TableCell className="font-mono text-xs">{init.id}</TableCell>
                    <TableCell className="font-medium">{init.title}</TableCell>
                    <TableCell>{init.owner || "-"}</TableCell>
                    <TableCell>
                      {init.currentStatus ? (
                        <Badge variant="outline">{init.currentStatus}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{init.devopsCardId || "-"}</TableCell>
                    <TableCell>
                      <Link href={`/initiatives/${init.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-initiative-${init.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
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
