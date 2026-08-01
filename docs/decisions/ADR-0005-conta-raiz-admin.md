# ADR-0005 — Conta raiz `admin` com privilégios especiais

- **Status:** Aceita
- **Data:** 2026-07 (commit `3aae59c`)
- **Relacionada:** [ADR-0004](ADR-0004-bloqueio-permanente-de-conta.md), [spec 003](../specs/003-autenticacao-e-contas.md)

## Contexto

Todos os administradores são iguais na aplicação: qualquer um pode criar contas, promover,
rebaixar, apagar e redefinir senhas. Isso cria um caminho de tomada do sistema:

> Uma conta de admin comprometida redefine a senha de **todos os outros admins**, inclusive
> a conta usada para recuperação, e o dono legítimo perde o sistema.

Não há e-mail transacional, então não existe "recuperar por link". A única recuperação fora
da aplicação é editar o item direto no DynamoDB — o que exige acesso ao console AWS, que nem
todo administrador do ministério tem.

## Decisão

Tratar o usuário de `username` **`admin`** (comparação com trim + lowercase, via
`isRootAdmin`) como **conta raiz**, com quatro regras impostas pela API:

| Regra | Efeito |
|---|---|
| Não pode ser removida | `DELETE /api/users/:id` → 403 |
| Não pode deixar de ser administradora | `PATCH /api/users/:id/admin` com `false` → 403 |
| Só ela redefine a própria senha | `POST /api/users/:id/reset-password` por outro admin → 403 |
| **Qualquer admin pode desbloqueá-la** | `POST /api/users/:id/unlock` permitido |

As três primeiras fecham os três caminhos de tomada (resetar, rebaixar, apagar-e-recriar). A
quarta é a exceção deliberada: sem ela, oito palpites errados em `@admin`
([ADR-0004](ADR-0004-bloqueio-permanente-de-conta.md)) trancariam a via de recuperação, e a
única saída seria o DynamoDB na mão.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Todos os admins iguais** | Deixa aberto o caminho de tomada descrito no contexto |
| **Identificar a raiz por `id = 1`** | Frágil: os IDs de produção vêm de `generateId()` (timestamp), não são sequenciais. O `username` é estável e visível na interface |
| **Flag `isRoot` no banco** | Mais um campo para manter em sincronia e passível de edição indevida; o `username` já é único e imutável por design |
| **Hierarquia de níveis (super-admin, admin, membro)** | Sistema de permissões que ninguém pediu, para um time de dezenas de pessoas |
| **Bloquear também o desbloqueio da raiz** | Transformaria oito palpites errados numa negação de serviço permanente do sistema inteiro |

## Consequências

**Ganhos**
- Existe sempre uma conta que sobrevive a um admin comprometido.
- As regras são simples de explicar à equipe: "a conta `admin` é especial".

**Custos aceitos**
- **O `username` `admin` vira reservado.** Criar um usuário chamado `admin` para uma pessoa
  qualquer lhe daria esses privilégios. Não há validação impedindo isso na criação — ver
  [`../backlog.md`](../backlog.md).
- **Se a senha da raiz for perdida, ninguém a redefine pela aplicação.** A saída é um
  `aws dynamodb update-item` — documentado em [`../guides/deployment.md`](../guides/deployment.md).
- A conta raiz é criada por seed manual no DynamoDB
  ([`user-admin.example.json`](../../user-admin.example.json)), com senha em texto puro que
  vira hash no primeiro login. O arquivo real (`user-admin.json`) é ignorado pelo git.

**Passou a ser obrigatório**
- Toda rota que altere uma conta alheia deve checar `isRootAdmin` antes de agir.
- A interface deve desabilitar (e explicar) as ações proibidas sobre a raiz — já feito em
  [`client/src/pages/equipes.tsx`](../../client/src/pages/equipes.tsx).
