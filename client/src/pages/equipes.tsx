import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PASSWORD_MIN_LENGTH, isRootAdmin, passwordIssue, ROOT_ADMIN_USERNAME } from "@shared/schema";
import { ArrowLeft, KeyRound, Plus, Shield, ShieldOff, Trash2, User, Users } from "lucide-react";
import { Link, Redirect } from "wouter";
import { Navbar } from "@/components/Navbar";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  mustChangePassword?: boolean;
  email?: string | null;
  phone?: string | null;
  cellName?: string | null;
  cellLeaders?: string | null;
}

export default function EquipesPage() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login?next=/equipes" />;
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full p-8 text-center space-y-4">
          <ShieldOff className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <h2 className="text-lg font-bold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            Apenas administradores podem gerenciar as equipes.
          </p>
          <Link href="/solicitacoes/painel">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao painel
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold uppercase tracking-wider">Gerenciar Equipes</h1>
          <p className="text-sm text-muted-foreground">Criar, remover e configurar acessos da equipe.</p>
        </div>
        <CreateUserForm />
        <UserList currentUserId={user.id} />

        <footer className="mt-12 pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}

function CreateUserForm() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users", {
        username: username.trim(),
        displayName: displayName.trim(),
        password: password.trim(),
        isAdmin,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário criado", description: `${displayName || username} foi adicionado à equipe.` });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Mesma política do servidor, avaliada enquanto digita
  const policyIssue = password.length > 0 ? passwordIssue(password.trim(), username) : null;
  const canSubmit = username.trim() && password.trim() && displayName.trim() && !policyIssue;

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
        <Plus className="w-4 h-4 text-primary" />
        Novo Usuário
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="new-username">Usuário</Label>
          <Input
            id="new-username"
            placeholder="nome.usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="input-new-username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-displayname">Nome de Exibição</Label>
          <Input
            id="new-displayname"
            placeholder="Nome Completo"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="input-new-displayname"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Senha</Label>
          <Input
            id="new-password"
            type="password"
            placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-new-password"
          />
          {policyIssue && <p className="text-xs text-destructive">{policyIssue}</p>}
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch
              id="new-admin"
              checked={isAdmin}
              onCheckedChange={setIsAdmin}
              data-testid="switch-new-admin"
            />
            <Label htmlFor="new-admin" className="text-sm cursor-pointer">Administrador</Label>
          </div>
        </div>
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={!canSubmit || mutation.isPending}
        data-testid="button-create-user"
      >
        <Plus className="w-4 h-4 mr-1" />
        {mutation.isPending ? "Criando..." : "Criar Usuário"}
      </Button>
    </Card>
  );
}

// Reset de senha por um admin: define uma senha provisória, que o dono é
// obrigado a trocar no primeiro acesso. A conta raiz é a exceção — só ela
// redefine a própria senha, senão um admin comprometido tomaria a conta de
// recuperação do sistema.
function ResetPasswordDialog({ user, isSelf }: { user: SafeUser; isSelf: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const blocked = isRootAdmin(user) && !isSelf;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${user.id}/reset-password`, {
        newPassword: password.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Senha redefinida",
        description: isSelf
          ? "Sua senha foi alterada. As sessões em outros dispositivos foram encerradas."
          : `Passe a senha para ${user.displayName}. Ele precisará trocá-la no primeiro acesso.`,
      });
      setOpen(false);
      setPassword("");
      setConfirm("");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Mesma política do servidor, avaliada enquanto digita
  const policyIssue = password.length > 0 ? passwordIssue(password.trim(), user.username) : null;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.trim().length > 0 && confirm.length > 0 && !policyIssue && !mismatch;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={blocked}
          title={
            blocked
              ? `A senha de @${ROOT_ADMIN_USERNAME} só pode ser redefinida pelo próprio usuário`
              : "Redefinir senha"
          }
          className="text-muted-foreground hover:text-primary"
          data-testid={`button-reset-password-${user.id}`}
        >
          <KeyRound className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma senha provisória para <strong>{user.displayName}</strong> (@{user.username}).
            {!isSelf && " Ele será obrigado a trocá-la no primeiro acesso, e todas as sessões abertas dele serão encerradas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`reset-password-${user.id}`}>Nova senha</Label>
            <Input
              id={`reset-password-${user.id}`}
              type="password"
              placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={`input-reset-password-${user.id}`}
            />
            {policyIssue && <p className="text-xs text-destructive">{policyIssue}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`reset-confirm-${user.id}`}>Confirmar senha</Label>
            <Input
              id={`reset-confirm-${user.id}`}
              type="password"
              placeholder="********"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid={`input-reset-confirm-${user.id}`}
            />
            {mismatch && <p className="text-xs text-destructive">As senhas não conferem.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            data-testid={`button-confirm-reset-${user.id}`}
          >
            <KeyRound className="w-4 h-4 mr-1" />
            {mutation.isPending ? "Redefinindo..." : "Redefinir senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserList({ currentUserId }: { currentUserId: number }) {
  const { toast } = useToast();

  const query = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Usuário removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível remover o usuário.", variant: "destructive" });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: number; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/admin`, { isAdmin });
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.isAdmin ? "Privilégio de admin concedido" : "Privilégio de admin removido",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível atualizar o usuário.", variant: "destructive" });
    },
  });

  const users = query.data || [];

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        Equipe ({users.length})
      </h2>

      {query.isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
      )}

      {users.length === 0 && !query.isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário encontrado.</p>
      )}

      <div className="space-y-2">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          // A conta raiz é a via de recuperação: não se apaga nem se rebaixa
          const isRoot = isRootAdmin(u);
          return (
            <div
              key={u.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 group"
              data-testid={`user-row-${u.id}`}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{u.displayName}</span>
                  {u.isAdmin && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 border text-xs">Admin</Badge>
                  )}
                  {isSelf && (
                    <Badge variant="outline" className="text-xs">Você</Badge>
                  )}
                  {u.mustChangePassword && (
                    <Badge variant="outline" className="text-xs text-muted-foreground" title="Senha definida por um admin — o usuário precisa trocá-la">
                      Senha provisória
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  @{u.username}
                  {u.cellName && <> · Célula {u.cellName}</>}
                  {u.cellLeaders && <> ({u.cellLeaders})</>}
                </p>
                {(u.email || u.phone) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {[u.email, u.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle admin */}
                <div
                  className="flex items-center gap-1.5"
                  title={
                    isRoot
                      ? `O usuário "${ROOT_ADMIN_USERNAME}" é sempre administrador`
                      : u.isAdmin ? "Remover admin" : "Tornar admin"
                  }
                >
                  <Switch
                    checked={u.isAdmin}
                    onCheckedChange={(checked) =>
                      toggleAdminMutation.mutate({ id: u.id, isAdmin: checked })
                    }
                    disabled={isSelf || isRoot || toggleAdminMutation.isPending}
                    data-testid={`switch-admin-${u.id}`}
                  />
                  <Shield className={`w-3.5 h-3.5 ${u.isAdmin ? "text-primary" : "text-muted-foreground/40"}`} />
                </div>

                <Separator orientation="vertical" className="h-6" />

                {/* Reset de senha */}
                <ResetPasswordDialog user={u} isSelf={isSelf} />

                {/* Delete */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSelf || isRoot}
                      title={isRoot ? `O usuário "${ROOT_ADMIN_USERNAME}" não pode ser removido` : "Remover usuário"}
                      className="text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-user-${u.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O usuário <strong>{u.displayName}</strong> (@{u.username}) será removido permanentemente. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(u.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid={`button-confirm-delete-${u.id}`}
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
