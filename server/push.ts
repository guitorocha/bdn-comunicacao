import webpush from "web-push";
import type { PushSubscription } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Notificação push (Web Push, RFC 8291)
//
// Único ponto do servidor que fala com o mundo externo. A mensagem é cifrada
// aqui e entregue ao serviço de push do navegador (Google, Mozilla, Apple) —
// nenhum intermediário nosso, nenhuma conta em terceiro, nenhum custo por
// mensagem. As chaves VAPID são o que prova a esses serviços que o remetente é
// este servidor.
// ─────────────────────────────────────────────────────────────────────────────

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
// O serviço de push exige um contato para avisar sobre problemas de entrega
const subject = process.env.VAPID_SUBJECT ?? "mailto:comunicacao@boladeneve.com";

// Sem chaves o recurso fica desligado em vez de derrubar o servidor: é o estado
// normal do `npm run dev`, onde ninguém quer gerar par de chaves para mexer em
// outra parte do sistema. Em produção a ausência aparece no log do job.
export const pushEnabled = Boolean(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey!, privateKey!);
}

export function vapidPublicKey(): string | null {
  return publicKey ?? null;
}

// O que o service worker recebe e transforma em notificação
export interface PushPayload {
  titulo: string;
  corpo: string;
  url: string;
}

// "entregue"  — o serviço de push aceitou
// "expirada"  — a inscrição morreu (aparelho trocado, dados limpos); quem chama
//               deve removê-la do usuário, senão ela é tentada para sempre
// "erro"      — falha temporária; o lembrete daquela rodada se perde
export type PushResult = "entregue" | "expirada" | "erro" | "desligado";

export async function enviarPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushResult> {
  if (!pushEnabled) return "desligado";

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      JSON.stringify(payload),
      // Sem isso a notificação some se o aparelho estiver desligado. Doze horas
      // cobrem o lembrete da manhã até o fim do culto da noite; passou disso,
      // entregar deixa de ajudar e só confunde.
      { TTL: 12 * 60 * 60 },
    );
    return "entregue";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410 são a forma de o serviço de push dizer que aquele endereço não
    // existe mais. Qualquer outro código é problema de rede ou do serviço.
    if (status === 404 || status === 410) return "expirada";
    // Nunca logar o endpoint nem o corpo: um é credencial de envio, o outro
    // carrega o nome e a agenda da pessoa.
    console.error(`[push] falha no envio (HTTP ${status ?? "?"})`);
    return "erro";
  }
}
