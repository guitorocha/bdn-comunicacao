# ADR-0001 — DynamoDB como persistência, com `IStorage` como fronteira

- **Status:** Aceita
- **Data:** 2026-03 (inferida do commit `584b50d infra+ajustes para prod`)
- **Relacionada:** [ADR-0002](ADR-0002-drizzle-como-fonte-de-tipos.md), [ADR-0007](ADR-0007-serverless-cloudfront-lambda.md)

## Contexto

O projeto nasceu de um template com PostgreSQL e Drizzle ORM. Ao ir para produção, o
requisito de custo apareceu com força: uma igreja local, sem orçamento de infraestrutura e
sem ninguém para operar banco. Um RDS mínimo custa mais por mês do que o resto do sistema
inteiro, e um Postgres serverless traria complexidade de VPC/NAT — mais custo fixo.

O volume real é pequeno: dezenas de usuários, centenas de solicitações, algumas centenas de
escalas por ano.

## Decisão

Persistir em **DynamoDB** com `billing_mode = PAY_PER_REQUEST`, e isolar todo o acesso a
dados atrás da interface `IStorage` ([`server/storage.ts`](../../server/storage.ts)), com
duas implementações:

- `MemStorage` — desenvolvimento, em memória, semeada; **lança exceção** se
  `NODE_ENV=production`;
- `DynamoStorage` — produção, usando a IAM role da Lambda.

Nenhuma rota conhece DynamoDB.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **RDS PostgreSQL** | Custo fixo mensal maior que todo o resto somado; exige VPC, e Lambda em VPC precisa de NAT Gateway (mais custo fixo ainda) |
| **Aurora Serverless v2** | Capacidade mínima cobrada continuamente; ainda dentro de VPC |
| **Postgres gerenciado externo (Neon, Supabase)** | Dependência de terceiro fora da conta AWS; latência; mais um segredo e mais um painel para a equipe operar |
| **SQLite em EFS/S3** | Escrita concorrente entre invocações de Lambda é problema conhecido |

## Consequências

**Ganhos**
- Free Tier cobre o uso real; custo de banco ≈ US$ 0.
- Sem VPC, sem NAT, sem pool de conexões — cold start curto.
- Escala sozinho sem ajuste de capacidade.

**Custos aceitos**
- **Sem JOIN.** Relações são de aplicação; `assignments` é embutido em `schedules` e o nome
  do voluntário, desnormalizado.
- **Sem integridade referencial.** Apagar um usuário não apaga suas indisponibilidades nem o
  remove de escalas.
- **`Scan` em várias leituras** (`getAllUsers`, `getAllSchedules`, `getAllRequests`,
  `getRecentAuditEntries`). Aceitável no volume atual ([Artigo I](../constitution.md)).
- **Sem transação.** `POST /api/schedules/bulk` cria item a item.
- **Sem auto-incremento** — IDs vêm de `Date.now() * 1000 + random`.

**Passou a ser obrigatório**
- Todo acesso a dados atravessa `IStorage`. Rota que importe `@aws-sdk/*` viola o
  [Artigo IV](../constitution.md).
- Todo método novo entra na interface **e nas duas implementações**.
- Toda tabela nova exige três edições no Terraform: recurso, variável de ambiente e policy
  IAM ([`../architecture/data-model.md`](../architecture/data-model.md)).
- Campo novo é normalizado na leitura, não migrado em massa ([Artigo V](../constitution.md)).

## Quando revisitar

Se surgir necessidade de consulta ad-hoc, relatório ou junção entre entidades — ou se
alguma tabela passar de alguns milhares de itens, tornando o `Scan` sensível. O caminho
provável não é trocar de banco, e sim acrescentar GSIs. Trocar o banco significa reescrever
apenas `DynamoStorage` — foi para isso que a fronteira existe.
