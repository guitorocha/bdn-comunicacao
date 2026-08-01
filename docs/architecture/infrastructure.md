# Infraestrutura

Tudo em [`infra/`](../../infra/), com Terraform ≥ 1.5 e provider AWS `~> 5.0`.
Complementa (não substitui) o [`infra/README.md`](../../infra/README.md), que traz os
comandos passo a passo.

## Topologia

```
Usuário
  │ https
  ▼
CloudFront  (distribuição única, PriceClass_100, certificado padrão *.cloudfront.net)
  ├── /*      → S3 (OAC)              cache: TTL padrão 1 dia, máx 7 dias
  └── /api/*  → API Gateway HTTP v2   cache: desligado (TTL 0), encaminha cookies e headers
                    │
                    ▼
              Lambda backend                    EventBridge Scheduler
              (arm64, 256 MB, 30 s)                     │ seg 09h / diário 07h
              handler: dist/lambda.handler              ▼
                    │                           Lambda lembretes
                    │                           (arm64, 512 MB, 120 s)
                    │                           handler: dist/lembretes.handler
                    ▼                                   │
              DynamoDB (7 tabelas, PAY_PER_REQUEST) ◄───┘
```

São **duas funções com o mesmo ZIP**, mudando só o handler — um artefato só, então elas
nunca ficam em versões diferentes do código. Separadas porque o timeout do job não pode
virar teto de faturamento do request HTTP, porque assim dá para alarmar sobre a métrica de
erro do job sem que um 500 da API dispare junto, e porque a role do job alcança só `users` e
`schedules` ([ADR-0008](../decisions/ADR-0008-web-push-para-lembretes.md)).

`custom_error_response` mapeia 403 e 404 do S3 para `/index.html` com status 200 — rede de
segurança para a SPA (que, por usar roteamento por hash, raramente precisa disso).

## Recursos por arquivo

| Arquivo | Cria |
|---|---|
| [`main.tf`](../../infra/main.tf) | Providers (região principal + alias `us_east_1` para ACM), `default_tags` |
| [`variables.tf`](../../infra/variables.tf) | Todas as variáveis, com validação de `jwt_secret` e `cors_allowed_origins` |
| [`s3.tf`](../../infra/s3.tf) | Bucket do frontend (sufixo aleatório), *public access block*, policy para o OAC |
| [`cloudfront.tf`](../../infra/cloudfront.tf) | OAC, distribuição, dois behaviors, respostas de erro |
| [`api_gateway.tf`](../../infra/api_gateway.tf) | HTTP API, stage com auto-deploy, integração AWS_PROXY, rotas, throttling, log group, permissão de invocação |
| [`dynamodb.tf`](../../infra/dynamodb.tf) | 7 tabelas e seus GSIs |
| [`lambda.tf`](../../infra/lambda.tf) | **Duas** funções (backend e lembretes), cada uma com sua IAM role, sua policy DynamoDB e seu log group |
| [`eventbridge.tf`](../../infra/eventbridge.tf) | Dois `aws_scheduler_schedule` (lembrete da semana e do dia) + role que só pode invocar a Lambda de lembretes |
| [`outputs.tf`](../../infra/outputs.tf) | URL do CloudFront, ID da distribuição, bucket, URL da API, nome da Lambda, tabelas |

## Variáveis

| Variável | Padrão | Nota |
|---|---|---|
| `aws_region` | `sa-east-1` | ⚠️ O [`infra/README.md`](../../infra/README.md) diz `us-east-1` na tabela de variáveis — **a fonte da verdade é o `variables.tf`** |
| `environment` | `production` | Vira o nome do stage do API Gateway e o `NODE_ENV` da Lambda |
| `app_name` | `bdn-comunicacao` | Prefixo de todos os nomes de recurso |
| `lambda_zip_path` | `../dist/lambda.zip` | Gerado por `npm run build` |
| `lambda_memory_size` | `256` | MB |
| `lambda_timeout` | `30` | Segundos, função do backend |
| `reminders_timeout` / `reminders_memory_size` | `120` / `512` | Função de lembretes — o job varre escalas e envia em sequência |
| `jwt_secret` | — **obrigatória** | Via `TF_VAR_jwt_secret`; validação exige ≥ 32 caracteres |
| `vapid_public_key` / `vapid_private_key` | `""` | Gere com `npm run push:keys`; a privada vai por `TF_VAR_vapid_private_key`. Vazias = lembretes desligados, resto da aplicação intacto |
| `vapid_subject` | `mailto:comunicacao@boladeneve.com` | Contato que os serviços de push usam para avisar sobre entrega |
| `reminders_enabled` | `true` | `false` remove os dois agendamentos sem mexer no resto |
| `cors_allowed_origins` | `[]` | Validação **rejeita `"*"`** |
| `cloudfront_price_class` | `PriceClass_100` | EUA/Europa — mais barato |

> `NODE_ENV` da Lambda recebe o valor de `var.environment`. Como o código decide o storage
> com `NODE_ENV === "production"`, **usar `environment = "staging"` faria a Lambda tentar
> instanciar `MemStorage`, que lança em produção.** Um ambiente novo exige tratar isso —
> ver [`backlog.md`](../backlog.md).

## Variáveis de ambiente da Lambda

Injetadas por [`lambda.tf`](../../infra/lambda.tf):

| Variável | Origem |
|---|---|
| `NODE_ENV` | `var.environment` |
| `JWT_SECRET` | `var.jwt_secret` |
| `DYNAMODB_REGION` | `var.aws_region` |
| `TABLE_USERS`, `TABLE_REQUESTS`, `TABLE_SUBTASKS`, `TABLE_COMMENTS`, `TABLE_SCHEDULES`, `TABLE_UNAVAILABILITY`, `TABLE_AUDIT` | Nomes das tabelas |
| `STAGE` | Nome do stage — o `lambda.ts` usa para remover o prefixo (`/production`) da URL |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Par de chaves das notificações push e contato do remetente. O backend também assina envio, na rota `/api/push/teste` |

A função de **lembretes** recebe um conjunto menor: `NODE_ENV`, `DYNAMODB_REGION`,
`TABLE_USERS`, `TABLE_SCHEDULES` e as três `VAPID_*`. **Não** recebe `JWT_SECRET` — o bundle
dela não importa `tokens.ts`, então não há segredo de sessão a guardar ali.

Não há credencial AWS em variável de ambiente: as Lambdas usam a **IAM role** de execução.

> **A chave privada VAPID fica em texto claro na configuração da Lambda**, como o
> `JWT_SECRET` — não há KMS nem Secrets Manager neste projeto. Quem tiver
> `lambda:GetFunctionConfiguration` lê as duas. Trocar o par VAPID invalida todas as
> inscrições e obriga cada pessoa a reativar as notificações.

## Agendamentos

| Agendamento | Quando | Evento enviado |
|---|---|---|
| `${app_name}-lembrete-semana` | Segunda, 09h `America/Sao_Paulo` | `{"tipo":"semana"}` |
| `${app_name}-lembrete-dia` | Todo dia, 07h `America/Sao_Paulo` | `{"tipo":"dia"}` |

Ambos invocam `${app_name}-reminders`. Payload com `tipo` desconhecido faz a função lançar,
de propósito: é erro de configuração do Terraform e precisa aparecer na métrica de erro.

O EventBridge **Scheduler** foi escolhido no lugar do `aws_cloudwatch_event_rule` clássico
por aceitar `schedule_expression_timezone`: a regra clássica só entende UTC, o que obrigaria
a escrever 12:00 para dizer 09:00 e a corrigir tudo à mão se o Brasil voltar ao horário de
verão. `flexible_time_window` fica em `OFF` — lembrete que chega atrasado é pior que
lembrete nenhum. Duas retentativas, seguras porque a marca de idempotência é gravada antes
do envio ([spec 008](../specs/008-lembretes-de-escala.md), RN-3).

## Build e artefatos

[`script/build.ts`](../../script/build.ts), acionado por `npm run build`:

| Artefato | Origem | Consumido por |
|---|---|---|
| `dist/public/` | `vite build` | `aws s3 sync` → bucket do frontend |
| `dist/index.cjs` | esbuild de `server/index.ts` | `npm start` (servidor tradicional) — **não usado no deploy serverless** |
| `dist/lambda.js` | esbuild de `server/lambda.ts` | Empacotado no ZIP (~1,1 MB) |
| `dist/lembretes.js` | esbuild de `server/lembretes-handler.ts` | Empacotado no ZIP (~226 KB) |
| `dist/lambda.zip` | adm-zip | `aws_lambda_function.backend` **e** `.reminders` |

Detalhes que importam:

- **Os dois bundles ficam sob `dist/` dentro do ZIP**, casando com os handlers
  `dist/lambda.handler` e `dist/lembretes.handler`. Colocá-los na raiz do ZIP quebra o
  deploy com `Cannot find module`.
- **São dois entrypoints, não dois `export` do mesmo arquivo.** O bundle dos lembretes não
  arrasta Express nem `tokens.ts` — que exigiria `JWT_SECRET` já na importação
  ([ADR-0008](../decisions/ADR-0008-web-push-para-lembretes.md)).
- **Timestamp fixo (1980-01-01)** em todas as entradas do ZIP. Sem isso, o `mtime` entra no
  arquivo, o `source_code_hash` muda a cada build e o Terraform redeploya a Lambda mesmo
  com bundle byte a byte idêntico.
- **`external`:** só um *allowlist* de dependências é embutido (reduz `openat(2)` e melhora
  cold start). Os SDKs `@aws-sdk/client-dynamodb` e `@aws-sdk/lib-dynamodb` ficam de fora —
  já vêm pré-instalados no ambiente Lambda do Node 20.
- **`@vendia/serverless-express`** é explicitamente reinserido no bundle da Lambda.

> ⚠️ Uma dependência de runtime nova que **não** esteja no `allowlist` de `script/build.ts`
> é marcada como externa e **não vai no ZIP** — o erro aparece só em produção. Ao adicionar
> uma dependência usada pelo servidor, acrescente-a ao allowlist.

## Deploy

Sequência resumida (comandos completos em [`../guides/deployment.md`](../guides/deployment.md)):

```bash
npm run build
cd infra && terraform apply          # com TF_VAR_jwt_secret no ambiente
aws s3 sync ../dist/public s3://$(terraform output -raw s3_bucket_name) --delete
aws cloudfront create-invalidation --distribution-id $(terraform output -raw cloudfront_distribution_id) --paths "/*"
```

Não há pipeline de CI/CD: o deploy é manual, de uma máquina com AWS CLI configurado.

## Estado do Terraform

O backend S3 está **comentado** em [`main.tf`](../../infra/main.tf) — o estado é **local**,
em `infra/terraform.tfstate`, e está no `.gitignore`.

> ⚠️ **Consequência séria:** o estado vive na máquina de quem aplicou. Perdê-lo significa
> reimportar todos os recursos à mão. Duas pessoas aplicando de máquinas diferentes
> divergem sem aviso. Migrar para backend S3 + trava em DynamoDB é o item de infraestrutura
> mais valioso do [`backlog.md`](../backlog.md).

## Custos

Estimativa para o volume real (dezenas de usuários, centenas de registros):

| Serviço | Configuração | Custo/mês |
|---|---|---|
| S3 | ~10 MB estáticos | < US$ 0,01 |
| CloudFront | PriceClass_100, tráfego baixo | < US$ 0,01 |
| API Gateway HTTP | ~1.000 req | < US$ 0,01 |
| Lambda | arm64, 256 MB, ~1.000 invocações | Free Tier |
| DynamoDB | PAY_PER_REQUEST | Free Tier |
| CloudWatch Logs | 30 dias de retenção | ~US$ 0,50/GB (quase nada) |
| EventBridge Scheduler | ~40 execuções (31 diárias + 4 semanais) | Free Tier |
| Notificações push | Qualquer volume | **US$ 0,00** — sem intermediário ([ADR-0008](../decisions/ADR-0008-web-push-para-lembretes.md)) |

**Total: < US$ 1/mês.** Manter isso é requisito ([Artigo I da constituição](../constitution.md)):
qualquer recurso novo com custo fixo (NAT Gateway, RDS, ALB, ElastiCache) precisa de ADR.

## Limites operacionais configurados

| Limite | Valor | Onde |
|---|---|---|
| Throttle do API Gateway | 20 rps, burst 50 | `default_route_settings` |
| Timeout da Lambda | 30 s | `var.lambda_timeout` |
| Memória da Lambda | 256 MB | `var.lambda_memory_size` |
| Retenção de log | 30 dias | Ambos os log groups |
| TTL do cookie de sessão | 12 h | `server/tokens.ts` |
| TTL de cache do front | 1 dia (máx. 7) | `default_cache_behavior` |

## Divergências conhecidas entre docs e código

Corrigir ou registrar — não deixar apodrecer:

1. `infra/README.md` diz que `aws_region` tem padrão `us-east-1`; o `variables.tf` diz
   `sa-east-1`.
2. O output `dynamodb_tables` lista apenas 4 das 7 tabelas
   ([`outputs.tf`](../../infra/outputs.tf)).
3. `infra/README.md` cita `scripts/build-lambda.sh`, que não existe — o build é
   `npm run build` → [`script/build.ts`](../../script/build.ts).
4. A rota `GET /health` existe no API Gateway e não no Express.
