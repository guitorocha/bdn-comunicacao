import { executarLembretes } from "./lembretes";
import { REMINDER_KINDS, type ReminderKind } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint da Lambda de lembretes — invocada pelo EventBridge Scheduler.
//
// Arquivo separado do `lambda.ts` de propósito, e não um segundo export dele:
// importar aquele arquivo arrasta o Express, o `routes.ts` e, por tabela, o
// `tokens.ts`, que resolve o JWT_SECRET **na carga do módulo** e lança em
// produção se ele faltar. O job não emite sessão nenhuma; herdar essa exigência
// significaria dar a ele um segredo que não usa. Aqui o grafo de importação
// para em storage + push.
// ─────────────────────────────────────────────────────────────────────────────

interface EventoLembrete {
  tipo?: string;
}

export const handler = async (event: EventoLembrete) => {
  const tipo = event?.tipo;
  if (!REMINDER_KINDS.includes(tipo as ReminderKind)) {
    // Falha ruidosa: o payload vem do Terraform, então um valor errado aqui é
    // erro de configuração e precisa aparecer na métrica de erro da função.
    throw new Error(`Tipo de lembrete desconhecido: ${String(tipo)}`);
  }
  return executarLembretes(tipo as ReminderKind);
};
