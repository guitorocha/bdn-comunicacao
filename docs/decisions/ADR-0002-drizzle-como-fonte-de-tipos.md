# ADR-0002 — Manter o schema Drizzle/Postgres apenas como fonte de tipos

- **Status:** Aceita (com dívida técnica declarada)
- **Data:** 2026-03
- **Relacionada:** [ADR-0001](ADR-0001-dynamodb-como-persistencia.md)

## Contexto

[`shared/schema.ts`](../../shared/schema.ts) define as entidades com `pgTable` do
`drizzle-orm/pg-core` e deriva schemas de validação com `createInsertSchema` do
`drizzle-zod`. Isso é herança do template original, que usava PostgreSQL.

Depois da migração para DynamoDB ([ADR-0001](ADR-0001-dynamodb-como-persistencia.md)),
**nenhum PostgreSQL existe no sistema**. Mas o arquivo continua sendo o centro de gravidade
do projeto: cliente e servidor importam dele os tipos, os schemas Zod, as constantes de
domínio e as funções de regra.

## Decisão

Manter a declaração `pgTable` como **fonte de tipos e de schemas Zod**, sem qualquer uso de
runtime do Drizzle. `drizzle-orm`, `drizzle-zod` e `drizzle-kit` permanecem como dependência
de tipos/geração; nenhuma query Drizzle é executada.

## Alternativas consideradas

| Alternativa | Por que não (agora) |
|---|---|
| **Substituir por objetos Zod puros** | Reescrita de todo o arquivo e de cada `type X = typeof x.$inferSelect`; risco de divergência sutil num arquivo que é a espinha dorsal do projeto, sem ganho funcional |
| **Adotar de fato o Drizzle com Postgres** | Reverteria o [ADR-0001](ADR-0001-dynamodb-como-persistencia.md) e o requisito de custo |
| **Deletar o Drizzle e tipar à mão** | Perderia a derivação automática de `insert*Schema`, que hoje evita esquecer campo |

## Consequências

**Ganhos**
- Uma única declaração gera tipo TypeScript, `SafeUser`, `Insert*` e schema Zod de validação.
- Adicionar um campo à entidade propaga tipo e validação sem edição em três lugares.

**Custos aceitos — e é aqui que as pessoas tropeçam**

> ⚠️ **Armadilha nº 1 do repositório.** Ler `pgTable`, `integer`, `jsonb` e concluir "isso é
> um app Postgres" leva a conclusões erradas sobre migração, transação, constraint e índice.
> **Não há banco relacional.** As "colunas" são só a forma de declarar a estrutura do item
> do DynamoDB.

- `drizzle.config.ts` aponta para PostgreSQL e exige `DATABASE_URL`. O script
  **`npm run db:push` não deve ser executado** — não há banco para receber o push.
- Tipos de coluna são decorativos: `boolean`, `jsonb`, `timestamp` não têm efeito. Datas são
  gravadas como **string** (`text`), e é assim que devem continuar.
- `varchar` e `timestamp` são importados e não usados em `shared/schema.ts`.
- Restrições declaradas (`.notNull()`, `.unique()`, `.default()`) **não são impostas por
  banco algum**. `username` único é garantido por uma checagem explícita na rota
  `POST /api/users`; defaults são aplicados no storage.

**Regras que passam a valer**
- Ao acrescentar um campo: declare na `pgTable`, verifique se o `insert*Schema` precisa
  omiti-lo, **e** trate a leitura de itens antigos em `normalizeUser`/equivalente
  ([Artigo V](../constitution.md)).
- Não adicione `.references()` nem relações do Drizzle — seriam ficção.
- Não gere nem versione migrações.

## Dívida e caminho de saída

Registrada em [`../backlog.md`](../backlog.md). A saída, quando fizer sentido:

1. remover `drizzle.config.ts` e o script `db:push`;
2. substituir as `pgTable` por objetos Zod, derivando os tipos com `z.infer`;
3. remover `drizzle-orm`, `drizzle-zod`, `drizzle-kit` e as dependências Postgres não usadas
   (`pg`, `connect-pg-simple`).

Enquanto isso não acontecer, **este ADR é a explicação** — e o comentário de topo de
`shared/schema.ts` deveria apontar para ele.
