import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, Loader2, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CommitteePacket {
  id: number;
  status: string;
  createdAt: string;
  initiativeCount: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="default" data-testid="badge-status-completed">Completado</Badge>;
    case "PENDING":
      return <Badge variant="secondary" data-testid="badge-status-pending">Pendiente</Badge>;
    case "FAILED":
      return <Badge variant="destructive" data-testid="badge-status-failed">Error</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-unknown">{status}</Badge>;
  }
}

export default function Committee() {
  useDocumentTitle("Comité - PMO Dashboard");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ packets: CommitteePacket[] }>({
    queryKey: ["/api/committee/packets"],
    refetchInterval: 5000,
  });

  const runCommitteeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/committee/run", {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Generación iniciada",
        description: `Trabajo #${data.jobId} encolado correctamente`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/committee/packets"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo iniciar la generación del paquete",
        variant: "destructive",
      });
    },
  });

  const packets = data?.packets || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Paquetes de Comité</h1>
          <p className="text-muted-foreground">
            Genera reportes consolidados para reuniones de comité
          </p>
        </div>
        <Button
          onClick={() => runCommitteeMutation.mutate()}
          disabled={runCommitteeMutation.isPending}
          data-testid="button-generate-packet"
        >
          {runCommitteeMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Users className="h-4 w-4 mr-2" />
          )}
          Generar Paquete
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Paquetes</CardTitle>
          <CardDescription>
            Paquetes de comité generados anteriormente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : packets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-empty-state">
              No hay paquetes de comité registrados
            </div>
          ) : (
            <div className="space-y-3">
              {packets.map((packet) => (
                <Link
                  key={packet.id}
                  href={`/committee/${packet.id}`}
                  className="block"
                  data-testid={`link-packet-${packet.id}`}
                >
                  <div className="flex items-center justify-between p-4 border rounded-md hover-elevate cursor-pointer">
                    <div className="flex items-center gap-4">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <div className="font-medium" data-testid={`text-packet-title-${packet.id}`}>
                          Paquete #{packet.id}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(packet.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                          {packet.initiativeCount > 0 && (
                            <span className="ml-2">
                              · {packet.initiativeCount} iniciativas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(packet.status)}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
