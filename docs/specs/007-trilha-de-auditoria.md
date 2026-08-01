# 007 — Trilha de Auditoria

| | |
|---|---|
| **ID** | 007 |
| **Status** | **Parcial** — API e persistência implementadas; **não há interface que a leia** |
| **Atores** | Administrador |
| **Depende de** | [003 — Autenticação](003-autenticacao-e-contas.md) |
| **Última revisão** | 2026-07-29 |

## Objetivo

Responder à pergunta "o que aconteceu?" depois de um incidente de acesso: quem entrou, quem
tentou e errou, quem virou admin, quem apagou quem — com um registro que **nem um
administrador comprometido consegue reescrever**.

## Fora de escopo

- Log de aplicação (erro, performance, request). Isso é CloudWatch.
- Auditoria de **conteúdo**: mudanças em solicitações, escalas, subtarefas e comentários
  **não** são registradas. A trilha cobre contas e acessos.
- Alerta ativo (e-mail/push ao detectar padrão suspeito).
- Retenção com expurgo automático — a trilha só cresce.

## Histórias de usuário

**HU-1.** Como administrador, quero saber quem entrou no sistema e quando.

**HU-2.** Como administrador, quero ver as tentativas de login que falharam e de que IP,
para reconhecer um ataque.

**HU-3.** Como administrador, quero rastrear quem criou, removeu, promoveu ou rebaixou uma
conta.

**HU-4.** Como responsável pelo sistema, quero garantia de que a trilha não pode ser
apagada pela aplicação, mesmo por um admin mal-intencionado.

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-AUD-001 | O sistema DEVE registrar: `login.success`, `login.failure`, `login.blocked`, `account.locked`, `account.unlocked`, `password.change`, `password.reset`, `user.create`, `user.delete`, `admin.grant`, `admin.revoke` | HU-1..3 |
| RF-AUD-002 | Cada entrada DEVE ter data/hora ISO 8601, ação, ator (quando conhecido), alvo, IP e detalhe opcional | HU-2 |
| RF-AUD-003 | Em login que falha por conta inexistente, a entrada DEVE registrar o nome digitado como alvo, sem ator | HU-2 |
| RF-AUD-004 | A entrada de falha de login DEVE trazer o contador (ex.: "tentativa 3/8") | HU-2 |
| RF-AUD-005 | O sistema NÃO DEVE oferecer rota que altere ou apague uma entrada | HU-4 |
| RF-AUD-006 | A política IAM da Lambda NÃO DEVE conceder `UpdateItem` nem `DeleteItem` sobre a tabela de auditoria | HU-4 |
| RF-AUD-007 | A leitura DEVE ser restrita a administradores | HU-1 |
| RF-AUD-008 | A leitura DEVE devolver as N mais recentes, com N entre 1 e 500 (padrão 100) | HU-1 |
| RF-AUD-009 | Falha ao gravar auditoria NÃO DEVE derrubar a operação auditada | — |
| RF-AUD-010 | Nenhuma entrada DEVE conter senha, hash de senha, token ou corpo de request | [Artigo II](../constitution.md) |
| RF-AUD-011 | A tabela DEVE ter *point-in-time recovery* habilitado | HU-4 |

## Regras de negócio

### RN-1 — Append-only em duas camadas
Camada de aplicação: só existem `createAuditEntry` e `getRecentAuditEntries` na `IStorage`.
Camada de infraestrutura: a policy `DynamoDBAuditAppendOnly` concede apenas
`PutItem`/`GetItem`/`Query`/`Scan`.
**Por quê:** a proteção na aplicação cai junto com a aplicação. A IAM sobrevive a um bug de
código e a uma execução remota — nem o processo tem permissão de apagar. Ver
[`../architecture/security.md`](../architecture/security.md).

### RN-2 — A auditoria nunca derruba a operação
`recordAudit` envolve tudo em `try/catch` e só loga o erro.
**Por quê:** um DynamoDB indisponível não pode impedir alguém de fazer login. A alternativa
— falhar a operação quando a auditoria falha — trocaria um problema de observabilidade por
uma indisponibilidade.
**Consequência conhecida:** a trilha pode ter buracos silenciosos. Aceito.

### RN-3 — A trilha cobre contas, não conteúdo
Escalas, solicitações, subtarefas e comentários não geram entradas.
**Por quê:** o risco que motivou a trilha é acesso indevido, não vandalismo de conteúdo (que
é visível e reversível pela própria equipe). Ampliar o escopo é possível — acrescente à
`AUDIT_ACTIONS` — mas é decisão consciente, não omissão.

### RN-4 — Leitura por `Scan` + ordenação em memória
`getRecentAuditEntries` faz `Scan` e ordena por `at` descendente.
**Por quê:** no volume desta igreja a tabela é pequena ([Artigo I](../constitution.md)). Se
crescer, o caminho é um GSI por dia (hash com `at` truncado) — não paginação improvisada.

## Critérios de aceite

**CA-1** (RF-AUD-001, RF-AUD-004)
- **Dado** uma conta existente
- **Quando** alguém errar a senha pela 3ª vez seguida
- **Então** há uma entrada `login.failure` com o alvo, o IP e detalhe "tentativa 3/8"

**CA-2** (RF-AUD-003)
- **Quando** o login for tentado com um usuário inexistente
- **Então** há uma entrada `login.failure` com `targetName` igual ao digitado, `actorId`
  nulo e detalhe "usuário inexistente"

**CA-3** (RF-AUD-001)
- **Quando** a 8ª falha bloquear a conta
- **Então** existem duas entradas: `login.failure` e `account.locked`

**CA-4** (RF-AUD-007)
- **Dado** um usuário comum autenticado
- **Quando** chamar `GET /api/audit`
- **Então** recebe 403

**CA-5** (RF-AUD-005, RF-AUD-006)
- **Quando** procurar por rota de escrita/edição/exclusão de auditoria
- **Então** não existe nenhuma; e a policy IAM não concede `UpdateItem`/`DeleteItem` sobre a
  tabela

**CA-6** (RF-AUD-009)
- **Dado** que a gravação de auditoria falha
- **Quando** um usuário fizer login com credenciais corretas
- **Então** o login é concluído normalmente e o erro aparece só no log do servidor

**CA-7** (RF-AUD-008)
- **Quando** chamar `GET /api/audit?limit=9999`
- **Então** recebe no máximo 500 entradas

## Contrato

`GET /api/audit?limit=100` 🛡️ —
[`../architecture/api-contract.md`](../architecture/api-contract.md).

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| Tipos | [`shared/schema.ts`](../../shared/schema.ts) | `AUDIT_ACTIONS`, `AUDIT_ACTION_LABELS`, `auditEntries`, `InsertAuditEntry` |
| Gravação | [`server/audit.ts`](../../server/audit.ts) | `recordAudit`, `clientIp` |
| Persistência | [`server/storage-dynamo.ts`](../../server/storage-dynamo.ts) | `createAuditEntry`, `getRecentAuditEntries` |
| API | [`server/routes.ts`](../../server/routes.ts) | `GET /api/audit` e as chamadas a `recordAudit` |
| Infra | [`infra/dynamodb.tf`](../../infra/dynamodb.tf), [`infra/lambda.tf`](../../infra/lambda.tf) | tabela `audit`, policy `DynamoDBAuditAppendOnly` |

## Lacuna principal

**Não existe interface para ler a trilha.** `AUDIT_ACTION_LABELS` foi criado justamente para
uma tela que ainda não existe, e nenhum arquivo do cliente referencia `/api/audit`. Hoje a
consulta só é possível via chamada direta à API (com sessão de admin) ou pelo console do
DynamoDB.

Esboço do que a tela precisaria, se for implementada:

- Rota `/#/auditoria`, visível apenas a admins (padrão de `EquipesPage`).
- Lista das últimas 100 entradas, com data/hora local, rótulo de `AUDIT_ACTION_LABELS`,
  ator, alvo, IP e detalhe.
- Filtro por ação e destaque para `login.failure`, `login.blocked` e `account.locked`.
- Sem paginação real enquanto o `limit` resolver — não improvise `LastEvaluatedKey`.

Registrado em [`../backlog.md`](../backlog.md).

## Outras lacunas

- `PATCH /api/users/:id/roles` não é auditado, embora mude o que a pessoa pode fazer nas
  escalas.
- Mudança de status de solicitação não é auditada (RN-3, por decisão).
