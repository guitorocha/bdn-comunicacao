import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PASSWORD_MIN_LENGTH, passwordIssue } from "@shared/schema";
import { KeyRound, Save, ShieldAlert, UserCog } from "lucide-react";
import { Redirect } from "wouter";
import { Navbar } from "@/components/Navbar";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function UsuariosPage() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Redirect to="/login?next=/usuarios" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-lg font-bold uppercase tracking-wider">Meus Dados</h1>
          <p className="text-sm text-muted-foreground">
            Mantenha seu cadastro e sua senha atualizados.
          </p>
        </div>

        {user.mustChangePassword && (
          <Card className="p-4 border-destructive/40 bg-destructive/5 flex gap-3" data-testid="banner-must-change-password">
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Troque sua senha para continuar</p>
              <p className="text-xs text-muted-foreground">
                Sua senha atual foi definida por um administrador, que a conhece. Escolha uma
                senha nova abaixo — as demais páginas ficam bloqueadas até lá.
              </p>
            </div>
          </Card>
        )}

        <ProfileForm />
        <PasswordForm />

        <footer className="mt-12 pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [cellName, setCellName] = useState(user?.cellName ?? "");
  const [cellLeaders, setCellLeaders] = useState(user?.cellLeaders ?? "");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/users/me", {
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        cellName: cellName.trim(),
        cellLeaders: cellLeaders.trim(),
      });
      return res.json();
    },
    onSuccess: (updated) => {
      updateUser(updated);
      toast({ title: "Dados atualizados", description: "Seu cadastro foi salvo." });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
        <UserCog className="w-4 h-4 text-primary" />
        Cadastro
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="profile-displayname">Nome</Label>
          <Input
            id="profile-displayname"
            placeholder="Nome Completo"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            data-testid="input-profile-displayname"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">E-mail</Label>
          <Input
            id="profile-email"
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-profile-email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">Telefone</Label>
          <Input
            id="profile-phone"
            type="tel"
            placeholder="(11) 90000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="input-profile-phone"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-cell">Célula</Label>
          <Input
            id="profile-cell"
            placeholder="Nome da célula"
            value={cellName}
            onChange={(e) => setCellName(e.target.value)}
            data-testid="input-profile-cell"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-cell-leaders">Liderança da célula</Label>
          <Input
            id="profile-cell-leaders"
            placeholder="Ex.: João e Maria"
            value={cellLeaders}
            onChange={(e) => setCellLeaders(e.target.value)}
            data-testid="input-profile-cell-leaders"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Usuário: <strong>@{user?.username}</strong> (não pode ser alterado)
      </p>

      <Button
        onClick={() => mutation.mutate()}
        disabled={!displayName.trim() || mutation.isPending}
        data-testid="button-save-profile"
      >
        <Save className="w-4 h-4 mr-1" />
        {mutation.isPending ? "Salvando..." : "Salvar dados"}
      </Button>
    </Card>
  );
}

function PasswordForm() {
  const { toast } = useToast();
  const { updateUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/users/me/password", {
        currentPassword,
        newPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      // A senha passou a ser escolha do dono: some a exigência de troca
      updateUser({ mustChangePassword: false });
      // A troca invalidou a sessão antiga — o servidor já reemitiu o cookie
      toast({
        title: "Senha alterada",
        description: "As sessões abertas em outros dispositivos foram encerradas.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  // Mesma regra do servidor, para o erro aparecer antes de enviar
  const policyIssue = newPassword.length > 0 ? passwordIssue(newPassword) : null;
  const canSubmit =
    currentPassword.length > 0 && !policyIssue && newPassword.length > 0 && !mismatch && confirmPassword.length > 0;

  return (
    <Card className="p-6 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" />
        Alterar senha
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="current-password">Senha atual</Label>
          <Input
            id="current-password"
            type="password"
            placeholder="********"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            data-testid="input-current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input
            id="new-password"
            type="password"
            placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            data-testid="input-new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar nova senha</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="********"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            data-testid="input-confirm-password"
          />
        </div>
      </div>

      {policyIssue && (
        <p className="text-xs text-destructive">{policyIssue}</p>
      )}

      {mismatch && (
        <p className="text-xs text-destructive">As senhas não conferem.</p>
      )}

      <Button
        onClick={() => mutation.mutate()}
        disabled={!canSubmit || mutation.isPending}
        data-testid="button-change-password"
      >
        <KeyRound className="w-4 h-4 mr-1" />
        {mutation.isPending ? "Alterando..." : "Alterar senha"}
      </Button>
    </Card>
  );
}
