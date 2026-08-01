# Terraform — BDN Comunicação (AWS Low-Cost)

Infraestrutura para deploy da aplicação React + Express na AWS com custo mínimo.

## Arquitetura

```
Usuário → CloudFront → /api/* → API Gateway HTTP → Lambda (Express)
                    → /*      → S3 (React build)
                                        ↕
                                    DynamoDB (4 tabelas)
```

## Serviços e Custos Estimados

| Serviço          | Configuração                   | Custo estimado (uso de igreja) |
|------------------|--------------------------------|-------------------------------|
| S3               | Standard, ~10MB static files   | < $0.01/mês                   |
| CloudFront       | PriceClass_100, baixo tráfego  | < $0.01/mês                   |
| API Gateway      | HTTP API, ~1.000 req/mês       | < $0.01/mês                   |
| Lambda           | arm64, 256MB, ~1.000 invoc/mês | Free Tier                     |
| DynamoDB         | PAY_PER_REQUEST, < 25 WCU/RCU  | Free Tier                     |
| CloudWatch Logs  | 30 dias retenção               | ~$0.50/GB (quase zero)        |

**Total estimado: < $1/mês** (ou gratuito no Free Tier)

## Pré-requisitos

- Terraform >= 1.5.0
- AWS CLI configurado (`aws configure`)
- Node.js 20+ para o build

## Estrutura dos arquivos

```
infra/
├── main.tf           # Provider AWS + backend config
├── variables.tf      # Variáveis configuráveis
├── s3.tf             # Bucket S3 para frontend estático
├── cloudfront.tf     # Distribuição CloudFront (CDN + proxy API)
├── dynamodb.tf       # 7 tabelas DynamoDB (users, requests, subtasks, comments,
│                     #   schedules, unavailability, audit)
├── lambda.tf         # Lambda function + IAM role + CloudWatch
├── api_gateway.tf    # HTTP API Gateway + integração Lambda
└── outputs.tf        # URLs e nomes dos recursos criados
```

## Como usar

### 1. Build

Um único comando, na raiz do projeto, gera tudo que o deploy consome:

```bash
npm run build
```

O [`script/build.ts`](../script/build.ts) produz:

| Artefato              | Consumido por                                         |
| --------------------- | ------------------------------------------------------ |
| `dist/public/`        | Upload para o S3 (passo 3)                              |
| `dist/lambda.js`      | Bundle do backend (entrypoint `server/lambda.ts`)        |
| `dist/lembretes.js`   | Bundle da Lambda de lembretes (entrypoint `server/lembretes-handler.ts`) |
| `dist/lambda.zip`     | `aws_lambda_function.backend` **e** `.reminders` no Terraform |

Dentro do ZIP os bundles ficam em `dist/lambda.js` e `dist/lembretes.js`, casando
com os handlers `dist/lambda.handler` e `dist/lembretes.handler` configurados em
`lambda.tf`. As duas funções compartilham o mesmo ZIP — ver
[ADR-0008](../docs/decisions/ADR-0008-web-push-para-lembretes.md). O ZIP usa
timestamp fixo, então builds sem mudança de código geram hash idêntico e não
redeployam as Lambdas à toa.

> `dist/index.cjs` também é gerado — é o build do servidor para execução
> tradicional (`npm start`), não usado no deploy serverless.

### 2. Deploy da infraestrutura

O segredo de assinatura dos tokens nunca é versionado: passe por variável de
ambiente (mínimo 32 caracteres). Para gerar um novo, use `openssl rand -hex 32`.
Não passar o segredo somente causa um logout forçado de todos os usuários logados.

```bash
export TF_VAR_jwt_secret="<segredo>"   # PowerShell: $env:TF_VAR_jwt_secret = "<segredo>"
export TF_VAR_vapid_public_key="<public_key_vapid>"
export TF_VAR_vapid_private_key="<private_key_vapid"
# os valores vapid devem ser os mesmos do ultimo deploy, altera-los faz com que a notificação de todos seja desativada após o deploy e precise ser reativada novamente. 

cd infra/

# Inicializa os providers
terraform init

# Revisa o plano
terraform plan

# Aplica
terraform apply
```

`lambda_zip_path` já tem `../dist/lambda.zip` como default — só passe `-var` se o
artefato estiver em outro lugar. Se o plan falhar com `filebase64sha256 ... cannot
find the file`, o build do passo 1 não rodou.

**Lembretes de escala (opcional):** sem as chaves VAPID o `apply` funciona normalmente
e o resto da aplicação fica intacto — só os lembretes ficam desligados. Para ligá-los,
gere o par antes do `apply` com `npm run push:keys` (na raiz do projeto) e exporte
`TF_VAR_vapid_public_key` / `TF_VAR_vapid_private_key`. Trocar o par depois invalida
todas as inscrições já feitas — mesmo peso de trocar o `jwt_secret`.

### 3. Upload do frontend para S3

```bash
# Obtém o nome do bucket do output do Terraform
BUCKET=$(terraform output -raw s3_bucket_name)
CF_ID=$(terraform output -raw cloudfront_distribution_id)

# Faz o sync dos arquivos estáticos
aws s3 sync ../dist/public s3://$BUCKET --delete

# Invalida o cache do CloudFront
aws cloudfront create-invalidation \
  --distribution-id $CF_ID \
  --paths "/*"
```

```powershell
# Obtém o nome do bucket do output do Terraform
$env:BUCKET=$(terraform output -raw s3_bucket_name)
$env:CF_ID=$(terraform output -raw cloudfront_distribution_id)

# Faz o sync dos arquivos estáticos
aws s3 sync ../dist/public s3://$env:BUCKET --delete

# Invalida o cache do CloudFront
aws cloudfront create-invalidation --distribution-id $env:CF_ID --paths "/*"
```

## Storage

A implementação é escolhida em tempo de execução (`server/storage.ts`):

- **Produção** (`NODE_ENV=production`, na Lambda): `DynamoStorage`
  (`server/storage-dynamo.ts`), usando a IAM Role da função — sem credenciais
  em variável de ambiente.
- **Dev local**: `MemStorage`, em memória. Ele aborta se alguém tentar
  instanciá-lo com `NODE_ENV=production`.

Os nomes das 7 tabelas chegam pelas variáveis `TABLE_USERS`, `TABLE_REQUESTS`,
`TABLE_SUBTASKS`, `TABLE_COMMENTS`, `TABLE_SCHEDULES`, `TABLE_UNAVAILABILITY` e
`TABLE_AUDIT`, injetadas pelo `lambda.tf`. Ao adicionar uma tabela nova, atualize
os três pontos: `dynamodb.tf`, o bloco `environment` e a policy IAM em
`lambda.tf`.

## Variáveis importantes

| Variável               | Padrão          | Descrição                              |
|------------------------|-----------------|----------------------------------------|
| `aws_region`           | `us-east-1`     | Região AWS                             |
| `jwt_secret`           | — (obrigatória) | Segredo dos tokens; via `TF_VAR_jwt_secret` |
| `environment`          | `production`    | Nome do ambiente                       |
| `lambda_zip_path`      | `../dist/lambda.zip` | Caminho para o ZIP do backend     |
| `lambda_memory_size`   | `256`           | Memória da Lambda (MB)                 |
| `lambda_timeout`       | `30`            | Timeout da Lambda (segundos)           |
| `cloudfront_price_class` | `PriceClass_100` | Classe de preço CloudFront          |
