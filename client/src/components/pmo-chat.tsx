import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  Info,
  LogIn,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ChatMessage, ExcelVersion } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface ChatResponseMeta {
  requestId: string;
  mode: "DETERMINISTIC" | "LLM" | "ERROR";
  route?: string;
  latencyMs?: number;
  errorCode?: string;
  status?: string;
  messageUser?: string;
}

interface ChatResponse {
  message: ChatMessage;
  sourceVersion?: ExcelVersion;
  meta?: ChatResponseMeta;
}

interface ChatMessagesResponse {
  messages: ChatMessage[];
}

export function PMOChat() {
  const [input, setInput] = useState("");
  const [lastMeta, setLastMeta] = useState<ChatResponseMeta | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  
  const isAdminOrEditor = user?.role === "admin" || user?.role === "editor";

  const { data: messagesData, isLoading: isLoadingMessages } = useQuery<ChatMessagesResponse>({
    queryKey: ["/api/chat/messages"],
  });

  const { data: versionsData } = useQuery<{ versions: ExcelVersion[] }>({
    queryKey: ["/api/versions"],
  });

  const latestVersion = versionsData?.versions?.[0];

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/chat/send", { content });
      return response.json() as Promise<ChatResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      setInput("");
      if (data.meta) {
        setLastMeta(data.meta);
        if (data.meta.status === "ERROR") {
          setShowErrorDetails(false);
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error al enviar mensaje",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/chat/clear");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages"] });
      toast({
        title: "Historial limpiado",
        description: "El historial de conversación ha sido eliminado.",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesData?.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const messages = messagesData?.messages || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">PMO Bot</h3>
            <p className="text-xs text-muted-foreground">
              Asistente de consulta de datos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestVersion && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1 text-xs">
                  <FileSpreadsheet className="h-3 w-3" />
                  v{latestVersion.id}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Versión activa: {latestVersion.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(latestVersion.uploadedAt), "dd MMM yyyy HH:mm", { locale: es })}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => clearHistoryMutation.mutate()}
            disabled={messages.length === 0 || clearHistoryMutation.isPending}
            data-testid="button-clear-chat"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <p>
            Este asistente responde <strong>únicamente</strong> con datos verificados del Excel cargado. 
            No interpreta, infiere ni genera información que no exista en los datos.
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <Card className="overflow-visible bg-muted/30 border-dashed">
              <CardContent className="p-6 text-center space-y-4">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <h4 className="font-medium">Bienvenido al PMO Bot</h4>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Puedo ayudarte a consultar información de los proyectos. Intenta preguntar cosas como:
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "¿Cuántos proyectos están abiertos?",
                    "¿Cuáles proyectos están vencidos?",
                    "¿Qué proyectos tiene el departamento de TI?",
                    "¿Cuál es el estado del proyecto X?",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                      data-testid={`suggestion-${suggestion.slice(0, 20)}`}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
                data-testid={`chat-message-${message.id}`}
              >
                {message.role === "assistant" && (
                  <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[80%] space-y-2",
                    message.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-lg px-4 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  
                  {/* Citations */}
                  {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Fuentes:</p>
                      <div className="flex flex-wrap gap-1">
                        {message.citations.map((citation, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs font-mono"
                          >
                            {citation.sheet && `${citation.sheet}`}
                            {citation.row && `:R${citation.row}`}
                            {citation.column && `:${citation.column}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(message.createdAt), "HH:mm", { locale: es })}
                  </p>
                </div>
                
                {message.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading indicator for pending message */}
          {sendMessageMutation.isPending && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Consultando datos...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      {!authLoading && !isAuthenticated ? (
        <div className="p-4 border-t border-border">
          <Card className="overflow-visible bg-muted/30 border-dashed">
            <CardContent className="p-4 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Lock className="h-5 w-5" />
                <span className="font-medium">Iniciar sesión requerido</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Para usar el PMO Bot necesitas iniciar sesión con tu cuenta de Replit.
              </p>
              <Button 
                onClick={() => window.location.href = "/api/login"}
                className="gap-2"
                data-testid="button-login-chat"
              >
                <LogIn className="h-4 w-4" />
                Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta al PMO Bot..."
              className="min-h-[44px] max-h-32 resize-none"
              disabled={sendMessageMutation.isPending}
              data-testid="input-chat-message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Las respuestas se basan exclusivamente en los datos del Excel cargado
          </p>
        </form>
      )}
    </div>
  );
}
