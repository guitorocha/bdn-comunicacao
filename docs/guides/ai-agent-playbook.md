# Playbook para Agentes de IA

Este documento é escrito para você, agente (Claude, Devin, GPT, Cursor, Copilot…). Ele
existe porque este repositório tem armadilhas que **parecem** convenções conhecidas e não
são — e porque a intenção por trás do código está registrada, mas em lugares específicos.

## Regra zero

**A intenção está escrita.** Antes de concluir que algo está errado, procure o porquê:

1. comentários no próprio código (este projeto comenta decisões, não mecânica);
2. a spec da funcionalidade em [`../specs/`](../specs/);
3. o ADR em [`../decisions/`](../decisions/);
4. a [constituição](../constitution.md).

Se depois disso a estranheza continuar sem explicação, **aí sim** é candidata a bug ou
dívida — e o lugar de registrá-la é [`../backlog.md`](../backlog.md), não uma "correção"
silenciosa.

## Ordem de leitura por tipo de tarefa

| Tarefa | Leia, nesta ordem |
|---|---|
| Qualquer coisa | [`../constitution.md`](../constitution.md) → este playbook |
| Mudar comportamento de funcionalidade | spec correspondente → `shared/schema.ts` → `server/routes.ts` → a página/componente |
| Mexer em auth, sessão, senha, permissão | [`../architecture/security.md`](../architecture/security.md) → [spec 003](../specs/003-autenticacao-e-contas.md) → ADRs [0003](../decisions/ADR-0003-sessao-jwt-em-cookie-httponly.md), [0004](../decisions/ADR-0004-bloqueio-permanente-de-conta.md), [0005](../decisions/ADR-0005-conta-raiz-admin.md) |
| Mexer em escalas | [spec 005](../specs/005-escalas-de-voluntarios.md) → [spec 006](../specs/006-geracao-automatica-de-escalas.md) → [ADR-0006](../decisions/ADR-0006-treinamento-como-funcao-de-escala.md) → `client/src/lib/escalas.ts` |
| Mexer em dados/persistência | [`../architecture/data-model.md`](../architecture/data-model.md) → [ADR-0001](../decisions/ADR-0001-dynamodb-como-persistencia.md) → [ADR-0002](../decisions/ADR-0002-drizzle-como-fonte-de-tipos.md) |
| Mexer em API | [`../architecture/api-contract.md`](../architecture/api-contract.md) |
| Mexer em infra/deploy | [`../architecture/infrastructure.md`](../architecture/infrastructure.md) → [`deployment.md`](deployment.md) → [ADR-0007](../decisions/ADR-0007-serverless-cloudfront-lambda.md) |

## As oito armadilhas

Cada uma já custou tempo ou produziria um bug de produção.

### 1. `pgTable` não significa PostgreSQL
[`shared/schema.ts`](../../shared/schema.ts) usa `drizzle-orm/pg-core`, mas **o banco é
DynamoDB**. Não escreva migração, não sugira `db:push`, não conte com constraint, transação
ou índice de banco relacional. `.notNull()`, `.unique()` e `.default()` são **decorativos**.
[ADR-0002](../decisions/ADR-0002-drizzle-como-fonte-de-tipos.md).

### 2. Dois entrypoints de servidor
[`server/index.ts`](../../server/index.ts) (dev / `npm start`) e
[`server/lambda.ts`](../../server/lambda.ts) (produção) montam **cada um o seu** app Express.
Middleware adicionado só no primeiro **não existe em produção**. Adicione nos dois, ou mova
para dentro de `registerRoutes`.

### 3. A ordem de `SCHEDULE_ROLES` é regra de negócio
`treinamento` é o último **de propósito**: a geração automática itera nessa ordem e preenche
o aprendiz depois das funções operacionais. Reordenar muda o resultado.
[ADR-0006](../decisions/ADR-0006-treinamento-como-funcao-de-escala.md).

### 4. Roteamento por hash, com dois padrões de query
As URLs são `/#/rota`. A query string do navegador fica em `window.location.search` (é de lá
que o login lê `?next=`), mas a página de acompanhamento lê o `?id=` de **dentro** do hash.
Confira qual se aplica antes de mexer.

### 5. Dependências que não fazem nada
`passport`, `passport-local`, `express-session`, `connect-pg-simple`, `memorystore`, `pg`,
`ws` estão no `package.json` e **não são usados**. Vieram do template. A autenticação é JWT
em cookie ([`server/tokens.ts`](../../server/tokens.ts)) — não parta do Passport para
entendê-la.

### 6. Regra só no cliente é bug de segurança
Quando o cliente antecipa uma regra (senha, treinamento, indisponibilidade), ele usa a
**mesma função** de `shared/schema.ts` que o servidor usa para recusar. Ao adicionar uma
regra, imponha no servidor. [Artigo III](../constitution.md).

### 7. Tabela nova exige três edições no Terraform
Recurso em `dynamodb.tf`, variável no bloco `environment` de `lambda.tf` e ARN na policy IAM
do mesmo arquivo. Esquecer a terceira produz `AccessDeniedException` só em produção.

### 8. Dependência de runtime nova precisa entrar no allowlist do build
[`script/build.ts`](../../script/build.ts) marca como *external* tudo que não está na
allowlist — e o que é external **não vai no ZIP da Lambda**. O erro aparece só em produção.

## Verificações antes de dizer "pronto"

- [ ] `npm run check` passa (é o único portão automatizado que existe).
- [ ] A regra vale no **servidor**, não só no formulário.
- [ ] Nenhuma resposta expõe `password`.
- [ ] Nenhum corpo de request/resposta foi para log.
- [ ] Se adicionou método de dados: entrou na `IStorage` **e** nas duas implementações.
- [ ] Se adicionou rota: está documentada em
      [`../architecture/api-contract.md`](../architecture/api-contract.md), com nível de
      autorização, e é privada por padrão.
- [ ] Se mudou comportamento: a spec correspondente foi atualizada **no mesmo commit**.
- [ ] Se a decisão tinha alternativa real: existe ADR.
- [ ] Comentários de "porquê" preservados ou atualizados, não apagados.
- [ ] Mensagens de usuário em português, claras e acionáveis.

## Como escrever a mudança

**Siga o estilo do arquivo que você está editando.** Este repositório tem um estilo
consistente e deliberado:

- comentários explicam decisões, em português, frequentemente citando a alternativa
  rejeitada;
- separadores de seção `// ── Nome ──` organizam arquivos longos;
- identificadores em inglês, domínio em português;
- `data-testid` em kebab-case nos elementos interativos;
- funções puras de regra ficam em `shared/` ou em `client/src/lib/`, não dentro de
  componentes.

Não introduza abstração especulativa ([Artigo VIII](../constitution.md)). Não reescreva o
que não foi pedido.

## O que **não** fazer sem pedir

- Executar `npm run db:push` (não há banco relacional).
- Rodar `terraform apply` ou `aws s3 sync` — deploy é ato deliberado do responsável, e o
  estado do Terraform é local.
- Trocar `JWT_SECRET` (desloga todo mundo).
- Apagar dados de qualquer tabela; a `audit` é append-only **por contrato e por IAM**.
- Comitar `user-admin.json`, `.env*`, `terraform.tfstate*` ou `dist/`.
- "Limpar" as dependências não usadas junto com outra mudança — é uma tarefa própria, com
  risco próprio ([`../backlog.md`](../backlog.md)).
- Migrar o schema Drizzle para Zod puro como efeito colateral de outra tarefa.

## Fluxo SDD para uma tarefa nova

```
1. Ler a constituição e este playbook
2. Localizar a spec afetada (ou criar a partir de specs/_template.md)
3. Escrever/ajustar os REQUISITOS e os CRITÉRIOS DE ACEITE — antes do código
4. Se houver escolha técnica com alternativa real → ADR
5. Implementar, do compartilhado para fora:
      shared/schema.ts → server/storage* → server/routes.ts → client
6. npm run check + exercitar o fluxo no navegador (comum e admin)
7. Atualizar a spec, o contrato da API e o backlog — no mesmo commit
```

## Ao propor melhorias

Se você identificar um problema fora do escopo pedido, **relate, não conserte**. O lugar é
[`../backlog.md`](../backlog.md), com: o que é, por que importa, qual o risco de deixar como
está e qual seria a correção. Mudança fora de escopo, mesmo boa, dificulta a revisão de quem
mantém isso sozinho.

## Contexto humano

Este sistema é mantido por poucas pessoas, voluntariamente, para uma igreja local. Otimize
para **quem vai ler o código daqui a seis meses sem contexto nenhum** — provavelmente a
mesma pessoa que escreveu, ou outro agente de IA. Clareza vence esperteza. Comentário que
explica o porquê vale mais que uma linha economizada.
