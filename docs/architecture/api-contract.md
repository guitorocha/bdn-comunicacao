# Contrato da API

Todas as rotas vivem em [`server/routes.ts`](../../server/routes.ts), montadas por
`registerRoutes(httpServer, app)`. Base: mesma origem do front (`/api/...`).

## Convenções

- **Autenticação:** cookie `bdn_session` (HttpOnly), enviado automaticamente pelo navegador.
  Há um fallback de migração que aceita `Authorization: Bearer <token>` — ele existe apenas
  para abas antigas ainda abertas e **deve ser removido** quando todos tiverem relogado
  (`readToken`).
- **Erros:** sempre `{ "message": "texto em português" }`. Erros de Zod acrescentam
  `errors: ZodIssue[]`.
- **Nunca** há campo `password` em resposta alguma.
- **Rate limit** (janela de 15 minutos, resposta 429 com `{ message }`):

| Limitador | Escopo | Limite | Observação |
|---|---|---|---|
| `apiLimiter` | Tudo sob `/api` | 600 | Teto geral |
| `loginIpLimiter` | IP, só em `POST /api/auth/login` | 30 | `skipSuccessfulRequests` — a equipe compartilha IP atrás de NAT |
| `loginUserLimiter` | `username` do corpo | 10 | Barra ataque distribuído contra uma conta |

## Níveis de autorização

| Nível | Significado |
|---|---|
| 🌐 **Público** | Sem autenticação |
| 🔒 **Autenticado** | `requireUser` — qualquer conta válida e não bloqueada |
| 🛡️ **Admin** | `requireAdmin` — `isAdmin === true` |

`requireUser`/`requireAdmin` recarregam o usuário do banco e recusam (401) se: o token for
inválido/expirado, a senha tiver mudado desde a emissão (`pv`), ou a conta estiver bloqueada.

---

## Autenticação

### `POST /api/auth/login` 🌐

```jsonc
// request
{ "username": "lucas", "password": "..." }
// 200
{ "user": { "id": 3, "username": "lucas", "displayName": "Lucas Almeida",
            "isAdmin": false, "roles": ["fotografia"], "mustChangePassword": false, /* ... */ } }
```

Efeitos colaterais: emite o cookie `bdn_session` (12h); zera `failedLoginCount` no acerto;
regrava senha em texto puro como hash; grava auditoria.

| Código | Quando |
|---|---|
| 400 | `username` ou `password` ausente |
| 401 | Credenciais inválidas (usuário inexistente **ou** senha errada — mesma mensagem) |
| 403 | Conta bloqueada — **a mensagem revela que a conta existe, deliberadamente** ([spec 003](../specs/003-autenticacao-e-contas.md)) |
| 429 | Rate limit |

O token **não** vai no corpo. Se algum cliente precisar dele fora do cookie, isso é uma
mudança de modelo de segurança — exige ADR.

### `POST /api/auth/logout` 🌐
Apaga o cookie. `{ "success": true }`. Não há estado de sessão no servidor para invalidar.

### `GET /api/auth/me` 🔒
Revalida o cookie e devolve o `SafeUser` atualizado. Usado no boot do cliente.

---

## Usuários

### `GET /api/users` 🔒
Admin recebe todos os campos (menos `password`). Usuário comum recebe apenas
`{ id, username, displayName, isAdmin, roles }`.

### `GET /api/users/me` 🔒
`SafeUser` do usuário da sessão.

### `PATCH /api/users/me` 🔒
Corpo: `updateProfileSchema` — `displayName` (obrigatório), `email` (válido ou vazio),
`phone`, `cellName`, `cellLeaders` (texto, máx. 120). Responde o `SafeUser` atualizado.
`username` **não** é editável por rota alguma.

### `PATCH /api/users/me/password` 🔒
```jsonc
{ "currentPassword": "...", "newPassword": "..." }
```
Exige a senha atual (403 se errada). Aplica a política de senha (400). Limpa
`mustChangePassword`, invalida todos os tokens anteriores (a impressão digital `pv` muda) e
**reemite o cookie** de quem trocou. Grava `password.change`.

### `POST /api/users` 🛡️
```jsonc
{ "username": "novo.membro", "displayName": "Novo Membro",
  "password": "...", "isAdmin": false, "roles": [] }
```
Cria com `mustChangePassword: true`. 409 se o `username` já existir. 201 com o `SafeUser`.
Grava `user.create`.

### `POST /api/users/:id/reset-password` 🛡️
```jsonc
{ "newPassword": "..." }
```
Não pede a senha atual — o admin não a conhece. Efeitos: alvo passa a ter
`mustChangePassword: true` (exceto se for reset da própria senha), sessões do alvo caem,
`failedLoginCount` zera e a conta é desbloqueada, se estiver.

| Código | Quando |
|---|---|
| 400 | ID inválido, ou a nova senha viola a política (inclusive ser igual ao `username` do alvo) |
| 403 | Alvo é a conta raiz `admin` e o solicitante não é ela mesma |
| 404 | Usuário não encontrado |

Grava `password.reset` e, se desbloqueou, `account.unlocked`.

### `POST /api/users/:id/unlock` 🛡️
Zera `failedLoginCount` e `lockedAt`. **Qualquer admin pode desbloquear qualquer conta,
inclusive a raiz** — se não fosse assim, oito palpites errados em `@admin` trancariam a via
de recuperação do sistema. 409 se a conta não estiver bloqueada nem tiver falhas
acumuladas. Grava `account.unlocked`.

### `PATCH /api/users/:id/roles` 🛡️
```jsonc
{ "roles": ["fotografia", "filmmaker"] }
```
Substitui a lista inteira. 400 se algum valor não estiver em `SCHEDULE_ROLES`.
**Não** é auditado hoje (ver [`backlog.md`](../backlog.md)).

### `PATCH /api/users/:id/admin` 🛡️
```jsonc
{ "isAdmin": true }
```
403 ao tentar revogar o admin da conta raiz. Grava `admin.grant` / `admin.revoke`.
Não há trava no servidor contra o admin revogar a si mesmo — a UI desabilita o próprio
switch, mas a API aceita. Registrado no [`backlog.md`](../backlog.md).

### `DELETE /api/users/:id` 🛡️
403 para a conta raiz. 404 se não existir. Grava `user.delete`.
**Não** apaga em cascata indisponibilidades nem escalações — ver [`backlog.md`](../backlog.md).

---

## Auditoria

### `GET /api/audit?limit=100` 🛡️
Últimas entradas, mais recentes primeiro. `limit` é fixado no intervalo `[1, 500]`
(padrão 100). **Não existe rota de escrita, edição ou exclusão** — a trilha só cresce.

> Endpoint implementado e sem consumidor: nenhuma tela lê `/api/audit` hoje.
> Ver [spec 007](../specs/007-trilha-de-auditoria.md).

---

## Solicitações

### `POST /api/requests` 🌐
```jsonc
{ "requesterName": "João", "ministry": "Louvor", "eventType": "culto",
  "eventName": "Culto de Celebração", "eventDate": "2026-08-10", "eventTime": "19:00",
  "eventDescription": "...", "promotionType": "interna" }
```
201 com a solicitação criada (`status: "pendente"`).

**409 — conflito:**
```jsonc
{ "message": "Já existe um evento agendado para o ministério \"Louvor\" na data 2026-08-10.",
  "conflictingEvent": { /* a solicitação existente */ } }
```
Regra: mesmo `ministry` + mesmo `eventDate`, ignorando as canceladas.

> Esta é a única rota de escrita pública. Ela é protegida apenas pelo `apiLimiter`
> (600/15min por IP) — não há CAPTCHA. Ver [`security.md`](security.md).

### `GET /api/requests` 🔒
Todas as solicitações, mais recentes primeiro.

### `GET /api/requests/:id` 🌐
Pública para permitir o acompanhamento por protocolo. 404 se não existir.

> Os IDs são adivinháveis por enumeração e o corpo inclui `requesterName` e a descrição do
> evento. Trade-off consciente (a alternativa seria um token de acompanhamento por
> solicitação) — ver [`backlog.md`](../backlog.md).

### `PATCH /api/requests/:id/status` 🔒
```jsonc
{ "status": "em_andamento" }   // pendente | em_andamento | concluida | cancelada
```
400 para status fora da lista; 404 se não existir. Não há máquina de estados: qualquer
transição é permitida. Não é auditado.

---

## Subtarefas

| Rota | Nível | Notas |
|---|---|---|
| `GET /api/requests/:id/subtasks` | 🌐 | Leitura pública — alimenta a página de acompanhamento |
| `POST /api/requests/:id/subtasks` | 🔒 | `{ "title": "Criar arte" }`; `requestId` vem da URL |
| `PATCH /api/subtasks/:id/toggle` | 🔒 | Inverte `completed`; 404 se não existir |
| `DELETE /api/subtasks/:id` | 🔒 | 404 se não existir |

## Comentários

| Rota | Nível | Notas |
|---|---|---|
| `GET /api/requests/:id/comments` | 🌐 | Leitura pública |
| `POST /api/requests/:id/comments` | 🔒 | `{ "content": "..." }` — **`authorName` vem da sessão**, nunca do corpo |

---

## Indisponibilidade

### `GET /api/unavailability` 🔒
Admin recebe as entradas de **todos** (a geração automática precisa disso); usuário comum
recebe só as suas.

### `POST /api/unavailability` 🔒
```jsonc
{ "date": "2026-08-10", "period": "manha" }   // period opcional, padrão "dia"
```
O `userId` vem da sessão — ninguém registra indisponibilidade por outra pessoa.
400 se a data não casar com `^\d{4}-\d{2}-\d{2}$` ou o período for inválido.
201 com a entrada; a criação é idempotente/absorvente (ver [`data-model.md`](data-model.md)).

### `DELETE /api/unavailability/:id` 🔒
O dono remove a sua; admin remove a de qualquer um. 403 caso contrário. 404 se não existir.

---

## Escalas

### `GET /api/schedules` 🔒
Todas as escalas (passadas e futuras), ordenadas por `eventDate eventTime`. O filtro de
"futuras" é do cliente.

### `POST /api/schedules` 🛡️
```jsonc
{ "title": "Culto", "eventType": "culto", "eventDate": "2026-08-09", "eventTime": "10:00",
  "notes": null,
  "assignments": [
    { "role": "fotografia", "volunteerId": 3, "volunteerName": "Lucas Almeida" },
    { "role": "treinamento", "volunteerId": 7, "volunteerName": "Ana Lima" }
  ] }
```
**400 — conflito de treinamento:** quem está em `treinamento` não pode ocupar outra função
no **mesmo período do mesmo dia**. A verificação (`trainingIssue`) considera todas as escalas
já salvas naquela data, agrupando por período — dois cultos de domingo são avaliados
separadamente.

### `POST /api/schedules/bulk` 🛡️
```jsonc
{ "schedules": [ /* array de InsertSchedule, mínimo 1 */ ] }
```
Valida o conflito de treinamento de cada item contra as escalas salvas **e** contra as já
criadas no próprio lote, então cria uma a uma. 201 com o array criado.

> **Não é transacional.** Um conflito no item 5 devolve 400 com os itens 1–4 já persistidos.
> Aceito no contexto atual; ver [`backlog.md`](../backlog.md).

### `PUT /api/schedules/:id` 🛡️
Substituição completa. A própria escala é excluída da checagem de conflito (o que vale é o
corpo enviado). 404 se não existir.

### `DELETE /api/schedules/:id` 🛡️
`{ "success": true }`.

> Nenhuma rota de escala é auditada — a trilha cobre contas e acessos, não conteúdo.

---

## Resumo de autorização

| Rota | 🌐 | 🔒 | 🛡️ |
|---|:--:|:--:|:--:|
| `POST /api/auth/login`, `POST /api/auth/logout` | ✅ | | |
| `GET /api/auth/me` | | ✅ | |
| `GET /api/users`, `GET /api/users/me`, `PATCH /api/users/me[/password]` | | ✅ | |
| `POST /api/users`, `POST /api/users/:id/{reset-password,unlock}` | | | ✅ |
| `PATCH /api/users/:id/{roles,admin}`, `DELETE /api/users/:id` | | | ✅ |
| `GET /api/audit` | | | ✅ |
| `POST /api/requests`, `GET /api/requests/:id` | ✅ | | |
| `GET /api/requests/:id/{subtasks,comments}` | ✅ | | |
| `GET /api/requests`, `PATCH /api/requests/:id/status` | | ✅ | |
| `POST /api/requests/:id/{subtasks,comments}`, `PATCH /api/subtasks/:id/toggle`, `DELETE /api/subtasks/:id` | | ✅ | |
| `GET/POST /api/unavailability`, `DELETE /api/unavailability/:id` | | ✅ | |
| `GET /api/schedules` | | ✅ | |
| `POST/PUT/DELETE /api/schedules*` | | | ✅ |

## Pendência conhecida

O API Gateway declara a rota `GET /health`
([`infra/api_gateway.tf`](../../infra/api_gateway.tf)), mas **o Express não implementa
`/health`** — a chamada cai no 404 do Express. Ou implemente o handler, ou remova a rota do
Terraform. Ver [`backlog.md`](../backlog.md).
