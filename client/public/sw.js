// Service worker do BDN Comunicação.
//
// Existe por um motivo só: sem um service worker registrado o navegador não
// entrega notificação push. Ele NÃO faz cache de nada — a aplicação é servida
// pelo CloudFront e um cache aqui só criaria a classe de bug em que a pessoa
// continua vendo a versão antiga da tela depois do deploy.

self.addEventListener("install", () => {
  // Assume o controle sem esperar as abas antigas fecharem: quem acabou de
  // ativar as notificações não deveria precisar recarregar a página.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Sem dados o push não vira notificação visível — e o navegador pune quem
  // recebe push silencioso demais revogando a permissão.
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { titulo: "Comunicação BDN", corpo: event.data.text(), url: "/#/escalas" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.titulo, {
      body: payload.corpo,
      icon: "/logo-bdn.png",
      badge: "/logo-bdn.png",
      lang: "pt-BR",
      // Uma escala substitui a notificação anterior do mesmo tipo em vez de
      // empilhar: o lembrete de hoje torna o de segunda obsoleto.
      tag: "escala",
      renotify: true,
      data: { url: payload.url || "/#/escalas" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/#/escalas", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // Já tem o app aberto? Foca essa aba em vez de abrir outra.
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && "focus" in janela) {
          janela.navigate(destino);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
