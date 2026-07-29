# ADR-0007 — Deploy serverless: CloudFront + S3 + API Gateway + Lambda

- **Status:** Aceita
- **Data:** 2026-03 (commit `584b50d infra+ajustes para prod`)
- **Relacionada:** [ADR-0001](ADR-0001-dynamodb-como-persistencia.md), [ADR-0003](ADR-0003-sessao-jwt-em-cookie-httponly.md)

## Contexto

O sistema precisava sair do ar de desenvolvimento e ir para produção com três restrições
duras:

1. **Custo próximo de zero.** Orçamento de uma igreja local.
2. **Zero operação.** Ninguém para aplicar patch em servidor, renovar certificado ou vigiar
   uptime.
3. **Tráfego baixo e irregular.** Picos nos dias de culto, quase nada no resto da semana.

A aplicação é um app Express + SPA React, escrita antes de qualquer decisão de deploy.

## Decisão

Uma única distribuição **CloudFront** com duas origens:

- `/*` → **S3** (bundle estático da SPA), acesso apenas via **OAC**, bucket privado;
- `/api/*` → **API Gateway HTTP v2** → **Lambda** (arm64, Node 20, 256 MB, timeout 30 s)
  rodando o mesmo app Express via `@vendia/serverless-express`;
- dados em **DynamoDB** ([ADR-0001](ADR-0001-dynamodb-como-persistencia.md)).

Tudo declarado em Terraform ([`infra/`](../../infra/)). O app Express não foi reescrito: a
Lambda monta o mesmo `registerRoutes` num entrypoint próprio
([`server/lambda.ts`](../../server/lambda.ts)), com o app cacheado entre invocações.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **EC2 / Lightsail com Node** | Custo fixo mensal; patch, monitoramento e certificado viram trabalho de alguém |
| **ECS Fargate** | Custo fixo por tarefa em execução; complexidade de VPC e balanceador |
| **Vercel / Netlify / Render** | Funcionaria e é mais simples, mas dispersaria a infraestrutura para fora da conta AWS que já hospeda os dados — mais um painel, mais um segredo, mais um fornecedor para a equipe entender |
| **Lambda Function URL sem CloudFront** | Domínio diferente do front → CORS com credenciais e `SameSite` frouxo; quebraria o modelo de sessão do [ADR-0003](ADR-0003-sessao-jwt-em-cookie-httponly.md) |
| **API Gateway REST (v1)** | ~3,5× mais caro por milhão de requisições que o HTTP API |
| **Lambda x86_64** | ~20% mais caro que arm64 (Graviton2), sem ganho aqui |

## Consequências

**Ganhos**
- Custo real: **< US$ 1/mês**, majoritariamente dentro do Free Tier.
- Zero servidor para operar; HTTPS e certificado por conta do CloudFront.
- Escala automática nos picos de domingo.
- **Same-origin** entre front e API — o que viabiliza `SameSite=strict` e dispensa CORS.

**Custos aceitos**
- **Cold start.** Mitigado com arm64, bundle único (esbuild com allowlist, reduz `openat(2)`)
  e app Express cacheado entre invocações.
- **Dois entrypoints de servidor.** `index.ts` (dev/`npm start`) e `lambda.ts` (produção)
  montam cada um o seu app. **Middleware adicionado em um não existe no outro** — a
  armadilha nº 2 do repositório.
- **Prefixo de stage na URL.** A Lambda remove `/${STAGE}` manualmente do `req.url`.
- **Rate limit em memória por container.** O limite efetivo é maior que o configurado com
  várias instâncias quentes — motivo pelo qual o bloqueio de conta
  ([ADR-0004](ADR-0004-bloqueio-permanente-de-conta.md)) é persistido.
- **Deploy em três passos manuais** (build → `terraform apply` → `s3 sync` + invalidação),
  sem CI/CD.
- **Estado do Terraform local.** O backend S3 está comentado em
  [`infra/main.tf`](../../infra/main.tf) — perder a máquina significa reimportar recursos.
  Item prioritário do [`../backlog.md`](../backlog.md).

**Regras que passaram a valer**
- O ZIP da Lambda precisa conter o bundle em `dist/lambda.js` (o handler é
  `dist/lambda.handler`), com timestamp fixo para não redeployar à toa.
- Dependência de runtime nova precisa entrar no allowlist de
  [`script/build.ts`](../../script/build.ts), senão fica externa e **não vai no ZIP**.
- Tabela nova exige atualizar recurso, variável de ambiente e policy IAM.
- Nada de recurso com custo fixo (NAT Gateway, RDS, ALB, ElastiCache) sem novo ADR.

## Quando revisitar

Se o cold start incomodar de verdade (usuário reclamando de lentidão no primeiro acesso do
dia), a saída barata é aumentar a memória da Lambda — não trocar o modelo. Provisioned
concurrency tem custo fixo e contraria o [Artigo I](../constitution.md).
