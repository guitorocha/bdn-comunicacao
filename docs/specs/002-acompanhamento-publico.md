# 002 — Acompanhamento Público de Solicitação

| | |
|---|---|
| **ID** | 002 |
| **Status** | Implementada |
| **Atores** | Solicitante (público) |
| **Depende de** | [001 — Solicitações de divulgação](001-solicitacoes-de-divulgacao.md) |
| **Última revisão** | 2026-07-29 |

## Objetivo

Permitir que quem pediu a divulgação veja o andamento sem precisar de conta e sem ter que
perguntar no WhatsApp — bastando o número de protocolo que recebeu ao enviar o pedido.

## Fora de escopo

- Autenticação ou token por solicitação.
- Listagem: não há como descobrir "minhas solicitações"; só se consulta um protocolo por vez.
- Interação: o acompanhamento é somente leitura. O solicitante não comenta nem cancela.

## Histórias de usuário

**HU-1.** Como solicitante, quero digitar meu protocolo e ver o status atual, para saber se
minha arte está sendo feita.

**HU-2.** Como solicitante, quero ver as subtarefas e os comentários da equipe, para
entender o que já foi feito e o que falta.

**HU-3.** Como solicitante, quero abrir um link direto para o meu protocolo, para não ter
que digitá-lo de novo.

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-ACP-001 | O sistema DEVE exibir uma solicitação a partir do número de protocolo, **sem autenticação** | HU-1 |
| RF-ACP-002 | O sistema DEVE exibir status, dados do evento, subtarefas (com marcação de concluída) e comentários | HU-2 |
| RF-ACP-003 | O sistema DEVE aceitar o protocolo por parâmetro na URL (`#/acompanhar?id=1234`) | HU-3 |
| RF-ACP-004 | O sistema DEVE aceitar o protocolo digitado com ou sem `#` | HU-1 |
| RF-ACP-005 | O sistema NÃO DEVE permitir nenhuma escrita a partir desta página | — |
| RF-ACP-006 | O sistema DEVE responder 404 para protocolo inexistente e informar isso ao usuário | HU-1 |

## Regras de negócio

### RN-1 — Leitura pública das três coleções
`GET /api/requests/:id`, `.../subtasks` e `.../comments` são públicas; a **escrita** nas três
exige login.
**Por quê:** o acompanhamento não teria valor mostrando só o status — o solicitante quer ver
que "a arte foi aprovada" no comentário. Como o conteúdo é sobre eventos públicos da igreja,
o risco de exposição é baixo e o ganho de autonomia é alto.

### RN-2 — Protocolo como única credencial
Não há token de acompanhamento; conhecer o número basta.
**Por quê:** trade-off consciente de simplicidade. O custo é que os IDs, embora grandes
(`generateRequestId`), são enumeráveis, e o corpo inclui `requesterName` e a descrição do
evento. Se um dia o conteúdo ficar sensível, a correção é um token opaco por solicitação —
não "proteger" a rota, o que quebraria a funcionalidade.

## Critérios de aceite

**CA-1** (RF-ACP-001)
- **Dado** um visitante sem sessão e o protocolo 1234 existente
- **Quando** consultar 1234 na página de acompanhamento
- **Então** vê status, dados do evento, subtarefas e comentários

**CA-2** (RF-ACP-003)
- **Quando** abrir `#/acompanhar?id=1234`
- **Então** a solicitação 1234 já vem carregada, sem digitação

**CA-3** (RF-ACP-004)
- **Quando** digitar `#1234`
- **Então** o `#` é descartado e o protocolo 1234 é consultado

**CA-4** (RF-ACP-006)
- **Quando** consultar um protocolo inexistente
- **Então** a página informa que a solicitação não foi encontrada

## Contrato

`GET /api/requests/:id` 🌐 · `GET /api/requests/:id/subtasks` 🌐 ·
`GET /api/requests/:id/comments` 🌐 —
[`../architecture/api-contract.md`](../architecture/api-contract.md).

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| UI | [`client/src/pages/tracking.tsx`](../../client/src/pages/tracking.tsx) | `Tracking` |
| API | [`server/routes.ts`](../../server/routes.ts) | rotas `GET` de request/subtasks/comments |

> ⚠️ **Detalhe de roteamento:** esta página lê o `?id=` de **dentro do hash**
> (`window.location.hash.split("?")[1]`), enquanto o login lê `?next=` de
> `window.location.search`. Os dois padrões coexistem no repositório — confira qual se
> aplica antes de mexer. Ver [`../architecture/overview.md`](../architecture/overview.md).

## Dívidas e lacunas

- IDs enumeráveis expõem `requesterName` e descrição a quem varrer a faixa numérica (RN-2).
- Não há indicação de "última atualização" da solicitação.

Ver [`../backlog.md`](../backlog.md).
