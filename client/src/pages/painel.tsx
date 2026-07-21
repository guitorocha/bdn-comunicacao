import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar, CheckCircle2, ChevronRight, Clock,
  Hash, MessageSquare, Plus, Send, Trash2, User
} from "lucide-react";
import { Redirect } from "wouter";
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

export default function Painel() {
  const { user, isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  if (!isAuthenticated) {
    return <Redirect to="/login?next=/solicitacoes/painel" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar subtitle="Painel de Solicitações" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold uppercase tracking-wider">Painel de Solicitações</h2>
          <p className="text-sm text-muted-foreground">Olá, {user?.displayName} — acompanhe e gerencie as solicitações de divulgação.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Request List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider">Solicitações</h2>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluida">Concluídas</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <RequestList
              statusFilter={statusFilter}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {selectedId ? (
              <RequestDetail requestId={selectedId} userName={user?.displayName || "Equipe"} />
            ) : (
              <Card className="p-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                <p>Selecione uma solicitação para ver os detalhes</p>
              </Card>
            )}
          </div>
        </div>

        <footer className="mt-12 pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}

function RequestList({ statusFilter, selectedId, onSelect }: {
  statusFilter: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const query = useQuery<Request[]>({
    queryKey: ["/api/requests"],
    refetchInterval: 5000,
  });

  const requests = (query.data || []).filter((r) =>
    statusFilter === "todos" ? true : r.status === statusFilter
  );

  if (query.isLoading) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">Carregando...</Card>;
  }

  if (requests.length === 0) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">Nenhuma solicitação encontrada.</Card>;
  }

  return (
    <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
      {requests.map((r) => (
        <Card
          key={r.id}
          className={`p-4 cursor-pointer hover-elevate transition-colors ${selectedId === r.id ? "ring-1 ring-primary" : ""}`}
          onClick={() => onSelect(r.id)}
          data-testid={`card-request-${r.id}`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-bold">#{r.id}</span>
            <Badge className={`${statusColors[r.status]} border text-xs`}>{statusLabels[r.status]}</Badge>
          </div>
          <p className="text-sm font-medium truncate">{r.eventName}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{r.ministry}</span>
            <span>·</span>
            <span>{r.eventDate}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{r.requesterName}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function RequestDetail({ requestId, userName }: { requestId: number; userName: string }) {
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");

  const requestQuery = useQuery<Request>({
    queryKey: ["/api/requests", requestId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${requestId}`);
      return res.json();
    },
  });

  const subtasksQuery = useQuery<Subtask[]>({
    queryKey: ["/api/requests", requestId, "subtasks"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${requestId}/subtasks`);
      return res.json();
    },
  });

  const commentsQuery = useQuery<Comment[]>({
    queryKey: ["/api/requests", requestId, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/requests/${requestId}/comments`);
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/requests/${requestId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId] });
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    },
  });

  const addSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", `/api/requests/${requestId}/subtasks`, { title, requestId });
      return res.json();
    },
    onSuccess: () => {
      setNewSubtask("");
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "subtasks"] });
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/subtasks/${id}/toggle`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "subtasks"] });
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/subtasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "subtasks"] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/requests/${requestId}/comments`, {
        content,
        authorName: userName,
        requestId,
      });
      return res.json();
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/requests", requestId, "comments"] });
    },
  });

  const req = requestQuery.data;
  const subtasks = subtasksQuery.data || [];
  const comments = commentsQuery.data || [];

  if (requestQuery.isLoading) {
    return <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>;
  }

  if (!req) {
    return <Card className="p-8 text-center text-muted-foreground">Solicitação não encontrada.</Card>;
  }

  return (
    <div className="space-y-4">
      {/* Request info */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" />
            <span className="font-bold text-lg">#{req.id}</span>
            <span className="text-muted-foreground">—</span>
            <span className="font-semibold">{req.eventName}</span>
          </div>
          <Select value={req.status} onValueChange={(v) => statusMutation.mutate(v)}>
            <SelectTrigger className="w-[160px]" data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Solicitante:</span>
            <span className="font-medium">{req.requesterName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Ministério:</span>
            <Badge variant="secondary">{req.ministry}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Data:</span>
            <span className="font-medium">{req.eventDate} às {req.eventTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tipo:</span>
            <Badge variant="outline">{req.eventType === "culto" ? "Culto" : "Outro evento"}</Badge>
            <Badge variant="outline">{req.promotionType === "interna" ? "Divulgação Interna" : "Divulgação Externa"}</Badge>
          </div>
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Descrição:</span>
          <p className="mt-1">{req.eventDescription}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Criado em {formatDate(req.createdAt)}
        </p>
      </Card>

      {/* Subtasks */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          Subtarefas
        </h3>

        {subtasks.length > 0 && (
          <div className="space-y-2">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-3 group" data-testid={`subtask-${st.id}`}>
                <Checkbox
                  checked={st.completed}
                  onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                  data-testid={`checkbox-subtask-${st.id}`}
                />
                <span className={`text-sm flex-1 ${st.completed ? "line-through text-muted-foreground" : ""}`}>
                  {st.title}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteSubtaskMutation.mutate(st.id)}
                  data-testid={`button-delete-subtask-${st.id}`}
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground" />
                </Button>
              </div>
            ))}
            {/* Progress */}
            <div className="mt-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${subtasks.length > 0 ? (subtasks.filter(s => s.completed).length / subtasks.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {subtasks.filter(s => s.completed).length}/{subtasks.length} concluídas
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Nova subtarefa..."
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSubtask.trim()) {
                addSubtaskMutation.mutate(newSubtask.trim());
              }
            }}
            data-testid="input-new-subtask"
          />
          <Button
            size="icon"
            disabled={!newSubtask.trim() || addSubtaskMutation.isPending}
            onClick={() => newSubtask.trim() && addSubtaskMutation.mutate(newSubtask.trim())}
            data-testid="button-add-subtask"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Comments */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Comentários
        </h3>

        {comments.length > 0 && (
          <div className="space-y-4 max-h-[300px] overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="space-y-1" data-testid={`comment-${c.id}`}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{c.authorName[0]?.toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-semibold">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground ml-8">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            placeholder="Adicionar comentário..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[60px]"
            data-testid="input-new-comment"
          />
        </div>
        <Button
          disabled={!newComment.trim() || addCommentMutation.isPending}
          onClick={() => newComment.trim() && addCommentMutation.mutate(newComment.trim())}
          data-testid="button-add-comment"
        >
          <Send className="w-4 h-4 mr-1" />
          {addCommentMutation.isPending ? "Enviando..." : "Enviar comentário"}
        </Button>
      </Card>
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
