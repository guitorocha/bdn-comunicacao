import { Switch, Route, Router, Redirect, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useAuth } from "@/lib/auth";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/landing";
import Solicitacoes from "@/pages/solicitacoes";
import Escalas from "@/pages/escalas";
import Tracking from "@/pages/tracking";
import Login from "@/pages/login";
import Painel from "@/pages/painel";
import Equipes from "@/pages/equipes";
import Usuarios from "@/pages/usuarios";
import NotFound from "@/pages/not-found";

// Senha definida por um admin (conta nova ou reset): o usuário fica preso em
// /usuarios até escolher a sua. Só as áreas internas são barradas — as páginas
// públicas (formulário, acompanhamento) continuam abertas para todo mundo.
const GATED_PATHS = ["/solicitacoes/painel", "/escalas", "/equipes"];

function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();

  if (user?.mustChangePassword && GATED_PATHS.includes(location)) {
    return <Redirect to="/usuarios" />;
  }
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/solicitacoes/painel" component={Painel} />
      <Route path="/solicitacoes" component={Solicitacoes} />
      <Route path="/escalas" component={Escalas} />
      <Route path="/acompanhar" component={Tracking} />
      <Route path="/login" component={Login} />
      {/* Rota antiga do painel — mantém links salvos funcionando */}
      <Route path="/admin">
        <Redirect to="/solicitacoes/painel" />
      </Route>
      <Route path="/equipes" component={Equipes} />
      <Route path="/usuarios" component={Usuarios} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <PasswordChangeGate>
            <AppRouter />
          </PasswordChangeGate>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
