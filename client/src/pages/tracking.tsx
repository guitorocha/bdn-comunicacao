import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, CheckCircle2, Circle, Clock, Hash, MessageSquare, Search, User } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import type { Request, Subtask, Comment } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  em_andamento: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  concluida: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelada: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function Tracking() {
  const [searchId, setSearchId] = useState("");
  const [activeId, setActiveId] = useState<number | null>(() => {
    // Check URL params
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const id = params.get("id");
    return id ? parseInt(id, 10) : null;
  });

  const requestQuery = useQuery<Request>({
    queryKey: ["/api/requests", activeId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${activeId}`);
      return res.json();
    },
    enabled: activeId !== null,
  });

  const subtasksQuery = useQuery<Subtask[]>({
    queryKey: ["/api/requests", activeId, "subtasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${activeId}/subtasks`);
      return res.json();
    },
    enabled: activeId !== null,
  });

  const commentsQuery = useQuery<Comment[]>({
    queryKey: ["/api/requests", activeId, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${activeId}/comments`);
      return res.json();
    },
    enabled: activeId !== null,
  });

  const handleSearch = () => {
    const parsed = parseInt(searchId.replace("#", ""), 10);
    if (!isNaN(parsed)) {
      setActiveId(parsed);
    }
  };

  const req = requestQuery.data;
  const subtasks = subtasksQuery.data || [];
  const comments = commentsQuery.data || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="mb-2">
          <h1 className="text-lg font-bold uppercase tracking-wider">Acompanhamento de Solicitação</h1>
        </div>

        {/* Search */}
        <Card className="p-6">
          <div className="space-y-2">
            <Label>Número da solicitação</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: 1000"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                data-testid="input-search-id"
              />
              <Button onClick={handleSearch} data-testid="button-search">
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Loading */}
        {requestQuery.isLoading && activeId && (
          <Card className="p-8 text-center text-muted-foreground">Buscando solicitação...</Card>
        )}

        {/* Error / Not found */}
        {requestQuery.isError && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Solicitação não encontrada. Verifique o número informado.</p>
          </Card>
        )}

        {/* Result */}
        {req && (
          <div className="space-y-4">
            {/* Request info */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="font-bold text-lg" data-testid="text-request-id">#{req.id}</span>
                </div>
                <Badge className={`${statusColors[req.status]} border`} data-testid="badge-status">
                  {statusLabels[req.status]}
                </Badge>
              </div>

              <Separator />

              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Solicitante:</span>
                  <span className="font-medium">{req.requesterName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground ml-6">Ministério:</span>
                  <Badge variant="secondary">{req.ministry}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Evento:</span>
                  <span className="font-medium">{req.eventName}</span>
                  <Badge variant="outline" className="text-xs">{req.eventType === "culto" ? "Culto" : "Outro evento"}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Data/Hora:</span>
                  <span className="font-medium">
                    {req.eventDate} às {req.eventTime}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground ml-6">Descrição:</span>
                  <span>{req.eventDescription}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground ml-6">Divulgação:</span>
                  <Badge variant="outline">{req.promotionType === "interna" ? "Interna" : "Externa"}</Badge>
                </div>
              </div>

              <Separator />
              <p className="text-xs text-muted-foreground">
                Solicitado em {formatDate(req.createdAt)}
              </p>
            </Card>

            {/* Subtasks */}
            <Card className="p-6 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Progresso
              </h3>
              {subtasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma etapa registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {subtasks.map((st) => (
                    <div key={st.id} className="flex items-center gap-3 text-sm" data-testid={`subtask-${st.id}`}>
                      {st.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className={st.completed ? "line-through text-muted-foreground" : ""}>{st.title}</span>
                    </div>
                  ))}
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${subtasks.length > 0 ? (subtasks.filter(s => s.completed).length / subtasks.length) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {subtasks.filter(s => s.completed).length} de {subtasks.length} etapas concluídas
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {/* Comments */}
            <Card className="p-6 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Comentários
              </h3>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((c) => (
                    <div key={c.id} className="space-y-1" data-testid={`comment-${c.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{c.authorName}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <footer className="mt-12 pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}
