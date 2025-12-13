import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Mail, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface ChaserDraft {
  id: number;
  initiativeId: number;
  initiativeTitle: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SENT":
      return <Badge variant="default" data-testid="badge-status-sent">Enviado</Badge>;
    case "DRAFT":
      return <Badge variant="secondary" data-testid="badge-status-draft">Borrador</Badge>;
    case "CANCELLED":
      return <Badge variant="outline" data-testid="badge-status-cancelled">Cancelado</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-unknown">{status}</Badge>;
  }
}

export default function Chasers() {
  useDocumentTitle("Seguimientos - PMO Dashboard");

  const { data, isLoading } = useQuery<{ chasers: ChaserDraft[] }>({
    queryKey: ["/api/chasers"],
  });

  const chasers = data?.chasers || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Borradores de Seguimiento</h1>
        <p className="text-muted-foreground">
          Correos de seguimiento generados automáticamente para iniciativas con alertas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Seguimientos</CardTitle>
          <CardDescription>
            Borradores de correo pendientes de envío o ya enviados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : chasers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-empty-state">
              No hay borradores de seguimiento registrados
            </div>
          ) : (
            <div className="space-y-3">
              {chasers.map((chaser) => (
                <div
                  key={chaser.id}
                  className="p-4 border rounded-md"
                  data-testid={`row-chaser-${chaser.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate" data-testid={`text-subject-${chaser.id}`}>
                          {chaser.subject}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span data-testid={`text-initiative-${chaser.id}`}>
                            {chaser.initiativeTitle}
                          </span>
                          <span className="mx-2">·</span>
                          <span>
                            {format(new Date(chaser.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                          {chaser.sentAt && (
                            <>
                              <span className="mx-2">·</span>
                              <span>
                                Enviado: {format(new Date(chaser.sentAt), "dd MMM yyyy", { locale: es })}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {chaser.body}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {getStatusBadge(chaser.status)}
                      <Link href={`/initiatives/${chaser.initiativeId}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`link-initiative-${chaser.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
