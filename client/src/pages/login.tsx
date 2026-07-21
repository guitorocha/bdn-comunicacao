import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock } from "lucide-react";
import { Link, useLocation } from "wouter";

interface LoginForm {
  username: string;
  password: string;
}

export default function Login() {
  const { toast } = useToast();
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const form = useForm<LoginForm>({
    defaultValues: { username: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: ({ user }) => {
      // O token não vem no corpo: ficou no cookie HttpOnly gravado pelo servidor
      login(user);
      // Senha provisória (conta criada ou redefinida por um admin): trocar antes
      // de qualquer outra coisa — só o dono deve conhecer a própria senha.
      if (user.mustChangePassword) {
        toast({
          title: "Defina sua senha",
          description: "Sua senha foi definida por um administrador. Escolha uma nova para continuar.",
        });
        navigate("/usuarios");
        return;
      }
      // Volta para a página que pediu o login (?next=...), senão vai às escalas.
      // O wouter (useHashLocation) guarda a query real em window.location.search,
      // não no hash — por isso lemos de search aqui.
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      navigate(next && next.startsWith("/") ? next : "/escalas");
    },
    onError: () => {
      toast({ title: "Erro de autenticação", description: "Usuário ou senha inválidos.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-sm w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Acesso da Equipe</h2>
          <p className="text-sm text-muted-foreground">Área restrita ao ministério de comunicação</p>
        </div>

        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" placeholder="seu.usuario" {...form.register("username")} data-testid="input-username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" placeholder="********" {...form.register("password")} data-testid="input-password" />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-login">
            {mutation.isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao início
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
