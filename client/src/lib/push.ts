import { apiRequest } from "./queryClient";

// ─────────────────────────────────────────────────────────────────────────────
// Notificações de escala no navegador
//
// O service worker só é registrado quando a pessoa clica em ativar. Registrar
// no boot pediria permissão sem contexto — e navegador que recebe "não" guarda
// a recusa para sempre, sem oferecer o pedido de novo.
// ─────────────────────────────────────────────────────────────────────────────

export type PushStatus =
  // A página não está num contexto seguro (HTTPS ou localhost). Nenhum
  // navegador expõe Push API fora dele — no iPhone é a causa mais comum de
  // "não funciona", porque o acesso pela rede local costuma ser http://IP.
  | "sem-https"
  // iOS: as APIs só existem no web app instalado na Tela de Início
  | "instalar-no-ios"
  // O navegador realmente não tem Push API
  | "sem-suporte"
  // Já recusou a permissão: só dá para reverter nas configurações do navegador
  | "bloqueado"
  | "desativado"
  | "ativado";

// iPadOS 13+ se identifica como "Macintosh"; o que o denuncia é a tela sensível
// ao toque. Sem isso, um iPad cairia na mensagem de "navegador sem suporte".
function ehIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function instaladoNaTelaDeInicio(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function suportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Distingue as três causas de "não dá para ativar", porque cada uma tem uma
// saída diferente — e dizer "use o Safari" para quem já está no Safari é pior
// que não dizer nada.
function motivoIndisponivel(): PushStatus | null {
  // Vem primeiro porque instalar na Tela de Início não resolve HTTP: o Safari
  // continua sem expor as APIs.
  if (!window.isSecureContext) return "sem-https";
  if (!suportaPush()) return ehIOS() && !instaladoNaTelaDeInicio() ? "instalar-no-ios" : "sem-suporte";
  return null;
}

export async function statusPush(): Promise<PushStatus> {
  const indisponivel = motivoIndisponivel();
  if (indisponivel) return indisponivel;
  if (Notification.permission === "denied") return "bloqueado";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "ativado" : "desativado";
}

export async function ativarPush(): Promise<PushStatus> {
  const indisponivel = motivoIndisponivel();
  if (indisponivel) return indisponivel;

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desativado";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // A assinatura anterior pode ter sido emitida com outra chave VAPID (troca de
  // chave no servidor); nesse caso o subscribe falha até cancelar a antiga.
  const existente = await registration.pushManager.getSubscription();
  const chave = await buscarChavePublica();
  if (existente) {
    if (mesmaChave(existente, chave)) {
      await registrarNoServidor(existente);
      return "ativado";
    }
    await existente.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    // Sem isso o navegador aceitaria push silencioso — a especificação exige
    // que toda mensagem vire notificação visível, e é o que fazemos.
    userVisibleOnly: true,
    applicationServerKey: base64UrlParaBytes(chave),
  });

  await registrarNoServidor(subscription);
  return "ativado";
}

export async function desativarPush(): Promise<PushStatus> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "desativado";

  // Avisa o servidor antes de cancelar: cancelando primeiro, o endpoint some e
  // o registro ficaria para trás sendo tentado até expirar.
  await apiRequest("DELETE", "/api/push/inscricoes", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
  return "desativado";
}

export async function enviarTeste(): Promise<void> {
  await apiRequest("POST", "/api/push/teste");
}

async function buscarChavePublica(): Promise<string> {
  const res = await apiRequest("GET", "/api/push/chave-publica");
  const { chave, ativo } = await res.json();
  if (!ativo || !chave) {
    throw new Error("As notificações ainda não foram configuradas no servidor.");
  }
  return chave;
}

async function registrarNoServidor(subscription: globalThis.PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await apiRequest("POST", "/api/push/inscricoes", {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });
}

function mesmaChave(subscription: globalThis.PushSubscription, chave: string): boolean {
  const atual = subscription.options.applicationServerKey;
  if (!atual) return false;
  return bytesParaBase64Url(new Uint8Array(atual)) === chave;
}

// A chave VAPID trafega em base64url; o subscribe() exige os bytes crus.
function base64UrlParaBytes(base64Url: string): Uint8Array {
  const preenchimento = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
  const binario = window.atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesParaBase64Url(bytes: Uint8Array): string {
  let binario = "";
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return window.btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
