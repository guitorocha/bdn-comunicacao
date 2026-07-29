# CLAUDE.md

Orientações para agentes de IA (Claude Code, Devin, GPT, Cursor…) trabalhando neste
repositório.

> **Documentação completa em [`docs/`](docs/). Comece por
> [`docs/guides/ai-agent-playbook.md`](docs/guides/ai-agent-playbook.md)** — ele diz o que
> ler para cada tipo de tarefa e detalha as armadilhas resumidas abaixo.

## O que é este projeto

Sistema de gestão do Ministério de Comunicação da Igreja Bola de Neve Nação. Duas áreas:
**solicitações de divulgação** (pedidos dos ministérios, com painel e acompanhamento
público) e **escalas de voluntários** (funções, indisponibilidade, geração automática por
rodízio, treinamento).

SPA React + Express empacotado em Lambda + DynamoDB, servidos por uma única distribuição
CloudFront. Interface e domínio em português.

## Comandos

```bash
npm run dev      # servidor de desenvolvimento (API + Vite) em http://localhost:5000
npm run check    # tsc — ÚNICO portão automatizado; rode sempre antes de concluir
npm run build    # cliente + bundles do servidor + dist/lambda.zip
npm start        # roda dist/index.cjs com NODE_ENV=production → DynamoDB REAL
npm run db:push  # ⚠️ NÃO USE — resquício do template Postgres; não há banco relacional
```

Não há testes automatizados. Em desenvolvimento o storage é em memória, com usuários
semeados e senha impressa no console (ou definida por `DEV_SEED_PASSWORD`).

## Estrutura

```
shared/schema.ts     Entidades, schemas Zod, constantes e REGRAS de negócio compartilhadas
server/routes.ts     Todas as rotas, rate limits e middlewares de auth
server/storage.ts    Interface IStorage + MemStorage (dev) + escolha da implementação
server/storage-dynamo.ts   DynamoStorage (produção)
server/index.ts      Entrypoint dev / npm start
server/lambda.ts     Entrypoint de produção (handler da Lambda)
client/src/lib/escalas.ts  Rodízio, carga mensal, roster de período
client/src/pages/    Uma página por rota (wouter com hash: /#/escalas)
infra/               Terraform (S3, CloudFront, API Gateway, Lambda, 7 tabelas, IAM)
docs/                Documentação SDD — specs, ADRs, arquitetura, guias
```

## Oito armadilhas

1. **`pgTable` não significa PostgreSQL.** O banco é DynamoDB. Sem migração, sem transação,
   sem constraint. `.notNull()`/`.unique()` são decorativos.
   ([ADR-0002](docs/decisions/ADR-0002-drizzle-como-fonte-de-tipos.md))
2. **Dois entrypoints de servidor.** Middleware adicionado só em `server/index.ts` **não
   existe em produção** — replique em `server/lambda.ts` ou coloque em `registerRoutes`.
3. **A ordem de `SCHEDULE_ROLES` é regra de negócio.** `treinamento` por último faz a geração
   automática preencher o aprendiz depois das funções operacionais.
4. **Roteamento por hash**, com dois padrões de query: o login lê `?next=` de
   `window.location.search`; o acompanhamento lê `?id=` de dentro do hash.
5. **`passport`, `express-session`, `pg`, `memorystore`, `ws` estão instalados e não são
   usados.** A autenticação é JWT em cookie (`server/tokens.ts`).
6. **Regra só no cliente é bug de segurança.** Cliente e servidor importam a *mesma* função
   de `shared/schema.ts`; o cliente avisa antes, o servidor recusa.
7. **Tabela nova exige três edições no Terraform:** recurso, variável de ambiente e policy
   IAM (`infra/dynamodb.tf` + `infra/lambda.tf`).
8. **Dependência de runtime nova precisa entrar no allowlist de `script/build.ts`**, senão
   fica externa e não vai no ZIP da Lambda.

## Regras inegociáveis

Extraídas de [`docs/constitution.md`](docs/constitution.md):

- Toda rota nova é **privada por padrão**; tornar pública é decisão documentada.
- Nenhuma resposta contém `password`. Autor/ator vem sempre da sessão, nunca do corpo.
- **Nunca** logar corpo de request ou de resposta (carregam senha e token).
- Nenhum segredo versionado. Em produção, sem `JWT_SECRET` de 32+ caracteres o app **não
  sobe** — de propósito.
- Acesso a dados só através de `IStorage`; método novo entra na interface e nas **duas**
  implementações.
- A trilha de auditoria é **append-only**, por contrato e por IAM.
- Campo novo é normalizado na leitura (`normalizeUser`), não migrado em massa.
- Comentários explicam o **porquê**; ao editar, preserve ou atualize a justificativa.
- Mensagens de usuário em português, claras e acionáveis.

## Antes de concluir

- [ ] `npm run check` passa
- [ ] A regra vale no servidor, não só no formulário
- [ ] Rota nova documentada em [`docs/architecture/api-contract.md`](docs/architecture/api-contract.md)
- [ ] Spec correspondente em [`docs/specs/`](docs/specs/) atualizada **no mesmo commit**
- [ ] Problema encontrado fora do escopo → registrado em [`docs/backlog.md`](docs/backlog.md),
      não "consertado" de passagem

## Não faça sem pedir

`npm run db:push` · `terraform apply` · `aws s3 sync` · trocar o `JWT_SECRET` (desloga todo
mundo) · apagar dados · comitar `user-admin.json`, `.env*`, `terraform.tfstate*` ou `dist/` ·
remover as dependências não usadas junto com outra mudança.
