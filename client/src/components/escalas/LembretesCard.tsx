import { useEffect, useState } from "react";
import { Bell, BellOff, Share, ShieldAlert, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ativarPush,
  desativarPush,
  enviarTeste,
  statusPush,
  type PushStatus,
} from "@/lib/push";

interface LembretesCardProps {
  // Como banner, some assim que a pessoa ativa; como cartão do perfil, fica
  // sempre visível para poder desligar depois.
  variant?: "card" | "banner";
}

// Interruptor dos lembretes de escala. O estado real mora no navegador (a
// assinatura push), não numa preferência guardada no servidor: assim o que a
// tela mostra é o que de fato vai acontecer naquele aparelho.
export function LembretesCard({ variant = "card" }: LembretesCardProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    statusPush().then(setStatus);
  }, []);

  // Enquanto não sabe o estado, não pisca nada na tela
  if (status === null) return null;
  if (variant === "banner" && status === "ativado") return null;

  const alternar = async (ativar: boolean) => {
    setOcupado(true);
    try {
      setStatus(ativar ? await ativarPush() : await desativarPush());
      if (ativar) {
        toast({
          title: "Lembretes ativados",
          description: "Você será avisado na segunda-feira e na manhã do dia em que servir.",
        });
      }
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };

  const testar = async () => {
    setOcupado(true);
    try {
      await enviarTeste();
      toast({ title: "Notificação enviada", description: "Ela deve aparecer em instantes." });
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };

  const moldura = variant === "banner"
    ? "p-4 border-primary/30 bg-primary/5"
    : "p-6";

  // No iPhone o Safari só entrega notificação para site instalado na tela de
  // início. Dizer "sem suporte" aqui seria falso e deixaria a pessoa sem saída.
  if (status === "instalar-no-ios") {
    return (
      <Card className={`${moldura} space-y-2`} data-testid="card-lembretes-ios">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          Lembretes de escala
        </h3>
        <p className="text-sm text-muted-foreground">
          No iPhone, os lembretes só funcionam com o app instalado. Toque em{" "}
          <Share className="w-3.5 h-3.5 inline align-text-bottom" /> <strong>Compartilhar</strong> e
          depois em <strong>Adicionar à Tela de Início</strong>. Abra o app por lá e volte aqui
          para ativar.
        </p>
      </Card>
    );
  }

  // Endereço http:// (típico de teste pela rede local). Instalar na tela de
  // início não resolve — nenhum navegador expõe notificação fora de HTTPS.
  if (status === "sem-https") {
    return (
      <Card className={`${moldura} space-y-2`} data-testid="card-lembretes-sem-https">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Lembretes indisponíveis neste endereço
        </h3>
        <p className="text-sm text-muted-foreground">
          As notificações exigem uma conexão segura (<code>https://</code>). Você está acessando
          por <code>{window.location.protocol}//{window.location.host}</code>. Abra o sistema pelo
          endereço oficial para ativar os lembretes.
        </p>
      </Card>
    );
  }

  if (status === "sem-suporte") {
    return (
      <Card className={`${moldura} space-y-2`} data-testid="card-lembretes-sem-suporte">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <BellOff className="w-4 h-4 text-muted-foreground" />
          Lembretes de escala
        </h3>
        <p className="text-sm text-muted-foreground">
          Este navegador não oferece notificações. No iPhone e no iPad, é preciso iOS 16.4 ou mais
          recente, com o app aberto pela Tela de Início.
        </p>
      </Card>
    );
  }

  if (status === "bloqueado") {
    return (
      <Card className={`${moldura} space-y-2`} data-testid="card-lembretes-bloqueado">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <BellOff className="w-4 h-4 text-destructive" />
          Lembretes bloqueados
        </h3>
        <p className="text-sm text-muted-foreground">
          As notificações foram recusadas neste navegador. Para voltar atrás, libere as
          notificações deste site nas configurações do navegador e recarregue a página.
        </p>
      </Card>
    );
  }

  const ativado = status === "ativado";

  return (
    <Card className={`${moldura} space-y-3`} data-testid="card-lembretes">
      <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
        {ativado ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
        Lembretes de escala
      </h3>
      <p className="text-sm text-muted-foreground">
        {ativado
          ? "Você recebe um aviso na segunda-feira da semana em que estiver escalado e outro na manhã do próprio dia."
          : "Receba um aviso na segunda-feira da semana em que estiver escalado e outro na manhã do dia — só para as escalas em que você está."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => alternar(!ativado)}
          disabled={ocupado}
          variant={ativado ? "outline" : "default"}
          data-testid="button-toggle-lembretes"
        >
          {ativado ? <BellOff className="w-4 h-4 mr-1" /> : <Bell className="w-4 h-4 mr-1" />}
          {ativado ? "Desativar neste aparelho" : "Ativar lembretes"}
        </Button>
        {ativado && (
          <Button onClick={testar} disabled={ocupado} variant="ghost" data-testid="button-testar-lembretes">
            Enviar teste
          </Button>
        )}
      </div>
    </Card>
  );
}
