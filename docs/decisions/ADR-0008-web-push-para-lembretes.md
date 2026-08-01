# ADR-0008 — Web Push como canal dos lembretes de escala, em vez de WhatsApp

- **Status:** Aceita
- **Data:** 2026-07-31
- **Relacionada:** [spec 008](../specs/008-lembretes-de-escala.md), [spec 005](../specs/005-escalas-de-voluntarios.md), [ADR-0007](ADR-0007-serverless-cloudfront-lambda.md)

## Contexto

Até aqui o sistema **não notificava ninguém**, por decisão registrada em três lugares: a
[spec 005](../specs/005-escalas-de-voluntarios.md) listava "lembrete por WhatsApp/e-mail"
como fora de escopo, o [overview do produto](../product/overview.md) dizia "o aviso continua
sendo pelo WhatsApp do time", e o [backlog](../backlog.md) guardava a ideia com a ressalva
"exigiria integração de mensagens — hoje fora de escopo por decisão".

O problema que quebrou o empate: o voluntário só descobre que está escalado se abrir
`/#/escalas` por conta própria. Quem esquece, esquece — e o admin refaz a escala na véspera.

O pedido original era WhatsApp, com uma restrição dura: **o número da igreja precisa
continuar ativo no app WhatsApp Business no celular**. Registrar um número na Cloud API da
Meta o remove do aplicativo.

Esta é uma reversão de escopo, então precisa de decisão registrada — o
[Artigo I](../constitution.md) diz que complexidade operacional nova (aqui, um agendador)
tem o *não* como padrão e exige justificativa forte.

## Decisão

Enviar os lembretes por **Web Push** (Push API + VAPID, RFC 8291), disparados por dois
**EventBridge Scheduler** que invocam uma **segunda Lambda**, dedicada ao job.

Como fallback para quem não ativar as notificações, o admin ganha um **link `wa.me`** no
cartão da escala, com o texto do lembrete já escrito. É o WhatsApp de sempre, aberto por uma
pessoa — não uma integração.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Cloud API no número atual (Coexistence)** | A Meta liberou o *Coexistence* em mai/2025 e ele de fato resolveria a restrição. Mas o onboarding exige status de Tech Provider (verificação de negócio + App Review) ou um BSP: a 360dialog cobra €49/mês por número. É 50× o teto de custo do Artigo I, para uma igreja local |
| **Cloud API com um segundo número** | Tecnicamente correto e sem risco: o número atual nem é tocado. Custa um chip dedicado, a criação de um app na Meta, aprovação de dois templates e ~US$0,007 por mensagem. Descartado pelo custo recorrente e pela burocracia, não por limitação técnica — **é o caminho de migração se a adesão ao push ficar baixa** |
| **Baileys / whatsapp-web.js (cliente não-oficial)** | Manteria o número e não custaria nada por mensagem. Mas viola os Termos da Meta, e o banimento derrubaria o WhatsApp Business da igreja inteiro, não só os lembretes. Ainda exigiria sessão persistente, pareamento manual por QR e um empacotamento fora do padrão do `script/build.ts`. O Artigo I (sem equipe de plantão) fecha a porta |
| **Gateway não-oficial gerenciado (Z-API, UltraMsg)** | Mesmo risco de banimento, com mensalidade em cima |
| **E-mail** | Não custa nada e chega a todos, mas ninguém no time lê e-mail no domingo de manhã. O lembrete precisa competir com a notificação do celular, não com a caixa de entrada |
| **Só mostrar na tela (status quo)** | É exatamente o problema |

## Consequências

### Uma segunda Lambda, com o mesmo ZIP

O job **não** roda dentro da Lambda do backend. A primeira versão desta decisão o fazia, por
economia de complexidade, e estava errada em três pontos:

1. **O timeout contamina o outro caminho.** O job precisa de mais de 30s; o request HTTP
   não. Juntos, o teto teria de ser o do job — e como o API Gateway corta a resposta em 29s
   mas a Lambda continua faturando até retornar, um request travado passaria a queimar o
   dobro.
2. **Alarme de falha vira ruído.** Um alarme sobre a métrica `Errors` da função disparia com
   qualquer 500 da API. Separadas, dá para alarmar só o job — que é a correção natural do
   B-29 no [backlog](../backlog.md).
3. **Menor privilégio.** A role do job alcança apenas `users` e `schedules`, com
   `GetItem`/`Scan`/`UpdateItem`. A do backend precisa de muito mais.

O custo disso é menor do que parece porque as duas funções **compartilham o mesmo ZIP**,
mudando só o handler (`dist/lambda.handler` e `dist/lembretes.handler`). Um artefato só
significa que elas nunca ficam em versões diferentes do código.

O job tem entrypoint próprio (`server/lembretes-handler.ts`) em vez de ser um segundo
`export` do `lambda.ts` por um motivo concreto: importar o `lambda.ts` arrasta `routes.ts` e,
por tabela, `tokens.ts` — que resolve o `JWT_SECRET` **na carga do módulo** e lança em
produção se ele faltar. Um export a mais obrigaria a dar ao job um segredo que ele nunca
usa. Com o entrypoint separado, o bundle cai de 1,1 MB para 226 KB, sem Express e sem
`jsonwebtoken`, e a função não recebe `JWT_SECRET`.

## Consequências

**Ganhos**
- **R$ 0,00/mês.** Sem intermediário, sem chip, sem token de terceiro, sem conta em serviço
  nenhum. O EventBridge Scheduler fica dentro do free tier com folga (≈40 execuções/mês).
- Nada novo na infraestrutura além dos agendamentos e da segunda função: mesmo DynamoDB,
  mesmo CloudFront (que já serve o HTTPS que a Push API exige), mesmo pacote de deploy.
- Zero risco regulatório ou de banimento: é padrão do navegador, não engenharia reversa.

**Custos aceitos**
- **No iPhone o push só funciona com o site instalado na Tela de Início.** É limitação da
  Apple, válida ainda no iOS 26, e não tem contorno. Daí o app ter ganhado `manifest` e
  `apple-touch-icon`, e a tela explicar o passo a passo em vez de dizer "sem suporte".
- **A adesão é individual e voluntária.** WhatsApp chega a 100% do time sem esforço; push
  chega a quem ativou. O fallback `wa.me` existe para essa diferença.
- **A primeira dependência externa em runtime** (`web-push`) — precisou entrar na allowlist
  do `script/build.ts`, sob pena de sumir do ZIP só em produção.
- **O primeiro código do servidor que não nasce de um request HTTP**, e o segundo bundle no
  `script/build.ts`. Quem mexer no build precisa lembrar que agora o ZIP leva **dois**
  arquivos.
- **Duas funções para manter alinhadas.** Compartilham o ZIP, então não divergem em código —
  mas variável de ambiente nova que sirva às duas precisa ser declarada nos dois blocos de
  `infra/lambda.tf`.
- Trocar o par de chaves VAPID invalida todas as inscrições: cada pessoa teria de reativar
  as notificações. É o mesmo peso de trocar o `JWT_SECRET`.

**Onde a decisão pode ser revista**
Se a adesão ficar baixa depois de alguns meses, a migração natural é a Cloud API com um
segundo número: o motor de lembretes (janela, agrupamento por voluntário, idempotência,
texto da mensagem) não muda — só o `enviarPush` de `server/push.ts`.
