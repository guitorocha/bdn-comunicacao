import { storage } from "./storage";
import { enviarPush, pushEnabled } from "./push";
import {
  mensagemLembrete,
  reminderKey,
  type ReminderItem,
  type ReminderKind,
  type Schedule,
  type User,
} from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Lembretes de escala
//
// Dois disparos, ambos vindos do EventBridge Scheduler: segunda de manhã (as
// escalas da semana) e todo dia de manhã (as escalas do próprio dia). Só quem
// está escalado recebe, e cada pessoa recebe UMA notificação por disparo,
// listando todas as suas escalas na janela — quem serve de manhã e à noite no
// domingo não é avisado duas vezes.
// ─────────────────────────────────────────────────────────────────────────────

// As datas das escalas são dias do calendário da igreja, não instantes. A
// Lambda roda em UTC, onde "hoje" vira ontem depois das 21h de Brasília — daí
// a conversão explícita em vez de `new Date().toISOString()`.
const CHURCH_TIMEZONE = "America/Sao_Paulo";

function hojeNaIgreja(): string {
  // "en-CA" formata como YYYY-MM-DD, o mesmo formato de `eventDate`
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function somaDias(dateStr: string, dias: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dias)).toISOString().slice(0, 10);
}

// Semana de segunda a domingo — o domingo fecha a semana porque é o dia de
// culto, e jogá-lo para a semana seguinte deixaria o aviso de segunda sem o
// evento mais importante.
function fimDaSemana(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const diaDaSemana = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = domingo
  const atePrimeiroDomingo = diaDaSemana === 0 ? 0 : 7 - diaDaSemana;
  return somaDias(dateStr, atePrimeiroDomingo);
}

export interface ResultadoLembretes {
  tipo: ReminderKind;
  de: string;
  ate: string;
  escalas: number;
  enviados: number;
  jaAvisados: number;
  semInscricao: number;
  falhas: number;
}

export async function executarLembretes(kind: ReminderKind): Promise<ResultadoLembretes> {
  const hoje = hojeNaIgreja();
  const ate = kind === "dia" ? hoje : fimDaSemana(hoje);

  const resultado: ResultadoLembretes = {
    tipo: kind, de: hoje, ate,
    escalas: 0, enviados: 0, jaAvisados: 0, semInscricao: 0, falhas: 0,
  };

  if (!pushEnabled) {
    console.warn("[lembretes] push desligado (sem chaves VAPID) — nada foi enviado");
    return resultado;
  }

  // O que já passou não vira lembrete, mesmo num disparo manual no meio da
  // semana: ninguém precisa ser avisado do culto de anteontem.
  const escalas = (await storage.getAllSchedules()).filter(
    (s) => s.eventDate >= hoje && s.eventDate <= ate,
  );
  resultado.escalas = escalas.length;
  if (escalas.length === 0) return resultado;

  // Um Scan em vez de N leituras por id: o time tem dezenas de pessoas, e o
  // job precisa do nome e das inscrições de cada uma que aparece na janela.
  const usuarios = new Map<number, User>();
  for (const user of await storage.getAllUsers()) usuarios.set(user.id, user);

  for (const [volunteerId, escalasDoVoluntario] of Array.from(agrupaPorVoluntario(escalas))) {
    const user = usuarios.get(volunteerId);
    // Escala apontando para uma conta apagada — o backlog registra que a
    // exclusão de usuário deixa esse rastro (B-09)
    if (!user) continue;

    const key = reminderKey(kind, volunteerId);
    const pendentes = escalasDoVoluntario.filter((s) => !(s.remindersSent ?? []).includes(key));
    if (pendentes.length === 0) {
      resultado.jaAvisados++;
      continue;
    }

    if (user.pushSubscriptions.length === 0) {
      // Sem marcar nada: se a pessoa ativar as notificações ainda hoje, o
      // próximo disparo a alcança. Quem fica sem aviso aparece para o admin
      // na tela de escalas, com o atalho para cobrar pelo WhatsApp.
      resultado.semInscricao++;
      continue;
    }

    // Marca ANTES de enviar. Uma reexecução da Lambda (falha de rede, retry do
    // Scheduler) encontra a marca gravada e não repete a notificação. O preço é
    // o inverso: se todos os envios falharem, aquele lembrete se perde — para
    // um aviso, avisar duas vezes incomoda mais do que perder um.
    const marcadas: Schedule[] = [];
    for (const escala of pendentes) {
      if (await storage.claimReminder(escala.id, key)) marcadas.push(escala);
    }
    if (marcadas.length === 0) {
      resultado.jaAvisados++;
      continue;
    }

    // A mensagem lista a janela inteira, não só o que foi marcado agora: para
    // quem lê, "suas escalas desta semana" precisa ser a semana toda.
    const itens = escalasDoVoluntario.map((s) => paraItem(s, volunteerId));
    const { titulo, corpo } = mensagemLembrete(kind, user.displayName, itens);

    let entregue = false;
    for (const subscription of user.pushSubscriptions) {
      const status = await enviarPush(subscription, { titulo, corpo, url: "/#/escalas" });
      if (status === "entregue") entregue = true;
      // Aparelho trocado ou dados limpos: para de tentar aquele endereço
      if (status === "expirada") await storage.removePushSubscription(user.id, subscription.endpoint);
    }

    if (entregue) resultado.enviados++;
    else resultado.falhas++;
  }

  // Só contagens no log — nome, telefone e conteúdo da notificação não entram
  console.log(
    `[lembretes] ${kind} ${hoje}..${ate}: ${resultado.enviados} enviados, ` +
    `${resultado.jaAvisados} já avisados, ${resultado.semInscricao} sem inscrição, ` +
    `${resultado.falhas} falhas`,
  );
  return resultado;
}

// volunteerId → escalas dele na janela, na ordem em que vieram (já ordenadas
// por data e hora pelo storage)
function agrupaPorVoluntario(escalas: Schedule[]): Map<number, Schedule[]> {
  const porVoluntario = new Map<number, Schedule[]>();
  for (const escala of escalas) {
    // Um voluntário pode aparecer duas vezes na mesma escala (duas funções);
    // a escala entra uma vez só, e as funções são reunidas em `paraItem`.
    const ids = Array.from(new Set(escala.assignments.map((a) => a.volunteerId)));
    for (const id of ids) {
      const lista = porVoluntario.get(id) ?? [];
      lista.push(escala);
      porVoluntario.set(id, lista);
    }
  }
  return porVoluntario;
}

function paraItem(escala: Schedule, volunteerId: number): ReminderItem {
  return {
    eventDate: escala.eventDate,
    eventTime: escala.eventTime,
    title: escala.title,
    roles: escala.assignments.filter((a) => a.volunteerId === volunteerId).map((a) => a.role),
  };
}
