# Constituição do Projeto — BDN Comunicação

> Princípios que **nenhuma** mudança pode violar sem uma decisão explícita registrada em
> [`decisions/`](decisions/). Se uma tarefa parece exigir quebrar um artigo daqui, a tarefa
> está mal formulada ou o artigo precisa ser emendado — pare e levante a questão.

## Artigo I — O contexto manda no projeto

Este sistema serve ao ministério de comunicação de **uma igreja local**: dezenas de
usuários, centenas de registros, orçamento de infraestrutura próximo de zero, e **nenhum
time de plantão**. Toda decisão técnica é avaliada contra esse contexto.

**Consequências práticas:**
- `Scan` no DynamoDB é aceitável onde a tabela é pequena; otimização prematura para escala
  que não existe é rejeitada.
- Complexidade operacional (fila, cache distribuído, microsserviço, orquestrador) precisa
  de justificativa forte. O padrão é *não*.
- Custo mensal é requisito, não detalhe. A meta é permanecer em Free Tier / < US$ 1 por mês.

## Artigo II — Segurança falha fechada

O sistema guarda dados pessoais de voluntários (nome, e-mail, telefone, célula) e controla
quem entra. Onde houver dúvida entre conveniência e segurança, **segurança vence**.

**Invariantes:**
- Nenhuma senha em texto puro é gravada por código novo. `scrypt`, sempre
  ([`server/password.ts`](../server/password.ts)).
- Nenhum segredo é versionado. `JWT_SECRET` vem de variável de ambiente; sem ele com ≥ 32
  caracteres, **produção não sobe** (`resolveSecret` em [`server/tokens.ts`](../server/tokens.ts)).
- O token de sessão nunca sai no corpo da resposta nem vive em `localStorage` — só em
  cookie `HttpOnly`.
- Nenhum corpo de request ou de resposta vai para log. Só metadados
  ([`server/index.ts`](../server/index.ts)).
- Toda rota nova é **privada por padrão**. Tornar algo público é decisão consciente, listada
  em [`architecture/api-contract.md`](architecture/api-contract.md).
- Identidade de autor (`authorName`, `actorId`) vem sempre da sessão, nunca do corpo.

## Artigo III — A regra de negócio mora no `shared/`

Regra que o cliente precisa antecipar **e** o servidor precisa impor vive em
[`shared/schema.ts`](../shared/schema.ts) e é importada pelos dois lados.

**Por quê:** duplicar a regra garante que uma das cópias envelheça. O padrão do projeto é:
o cliente usa a regra para *avisar antes* (UX), o servidor usa a mesma regra para *recusar*
(segurança). Exemplos vivos: `passwordIssue`, `trainingConflicts`, `periodOfTime`,
`isRootAdmin`, `unavailabilityPeriod`.

**Corolário:** validação só no cliente é bug de segurança, não escolha de UX.

## Artigo IV — Persistência atrás de uma fronteira

Todo acesso a dados passa pela interface `IStorage`
([`server/storage.ts`](../server/storage.ts)). Rotas não conhecem DynamoDB.

- `MemStorage` — desenvolvimento; **aborta** se `NODE_ENV=production`.
- `DynamoStorage` — produção.

Adicionar um método de dados significa adicioná-lo à interface e às **duas** implementações.
Uma rota que importe `@aws-sdk/*` diretamente viola este artigo.

## Artigo V — O passado não some

Dados gravados por versões anteriores continuam válidos. Campos novos são **normalizados na
leitura**, não migrados em massa.

Referências: `normalizeUser` e `normalizeUnavailability` em
[`server/storage-dynamo.ts`](../server/storage-dynamo.ts), `unavailabilityPeriod` em
[`shared/schema.ts`](../shared/schema.ts).

Isso vale também para senhas em texto puro herdadas: `verifyPassword` aceita, e o login
regrava como hash na primeira autenticação bem-sucedida.

## Artigo VI — A trilha de auditoria é append-only

A tabela `audit` registra login, bloqueio, criação/remoção de usuário e mudança de
privilégio. **Não existe rota que altere ou apague uma entrada**, e a política IAM da Lambda
não concede `UpdateItem` nem `DeleteItem` sobre essa tabela
([`infra/lambda.tf`](../infra/lambda.tf)).

Uma conta de admin comprometida não pode varrer os próprios rastros pela aplicação. Qualquer
mudança que enfraqueça isso precisa de ADR.

## Artigo VII — O comentário explica o porquê

O código deste projeto comenta **decisões**, não mecânica. Comentário que narra o que a
linha faz é ruído; comentário que explica por que a alternativa óbvia foi rejeitada é a
documentação mais barata que existe.

Ao editar um trecho comentado, **atualize ou preserve o porquê**. Apagar a justificativa
para "limpar" é perda de informação irrecuperável.

## Artigo VIII — Simplicidade acima de generalidade

O código atende ao caso que existe. Abstração especulativa ("um dia vamos precisar de vários
tenants / vários bancos / plugins") é rejeitada até que o segundo caso concreto apareça.

## Artigo IX — Português na interface, sempre

Toda mensagem visível ao usuário — erro de API incluído — é em português, clara e
acionável. A pessoa que lê "Conta bloqueada por tentativas de senha incorretas. Peça a um
administrador para desbloqueá-la." sabe o que fazer; quem lê "Unauthorized" não sabe.

## Emendas

Emendar esta constituição exige: (1) um ADR explicando o que mudou e por quê, (2) atualizar
este arquivo, (3) atualizar as specs afetadas — tudo no mesmo commit.
