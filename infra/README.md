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
terraform/
├── main.tf           # Provider AWS + backend config
├── variables.tf      # Variáveis configuráveis
├── s3.tf             # Bucket S3 para frontend estático
├── cloudfront.tf     # Distribuição CloudFront (CDN + proxy API)
├── dynamodb.tf       # 4 tabelas DynamoDB (users, requests, subtasks, comments)
├── lambda.tf         # Lambda function + IAM role + CloudWatch
├── api_gateway.tf    # HTTP API Gateway + integração Lambda
└── outputs.tf        # URLs e nomes dos recursos criados
```

## Como usar

### 1. Build do Lambda

O backend Express precisa ser empacotado como uma função Lambda.
Instale o adaptador:

```bash
npm install @vendia/serverless-express
```

Crie o entrypoint `server/lambda.ts`:

```typescript
import serverlessExpress from "@vendia/serverless-express";
import { createApp } from "./app"; // sua função que cria o Express app

let handler: any;

export const handler = async (event: any, context: any) => {
  if (!handler) {
    const { app } = await createApp();
    handler = serverlessExpress({ app });
  }
  return handler(event, context);
};
```

Adicione o script de build para Lambda em `package.json`:

```bash
# Build do backend para Lambda
esbuild server/lambda.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --outfile=dist/lambda.js \
  --format=cjs \
  --external:@aws-sdk/*

# Gera o ZIP para o Terraform
cd dist && zip -r lambda.zip lambda.js && cd ..
```

### 2. Build do Frontend

```bash
# Gera os arquivos estáticos do React na pasta dist/public
vite build --outDir dist/public
```

### 3. Deploy da infraestrutura

```bash
cd terraform/

# Inicializa os providers
terraform init

# Revisa o plano
terraform plan -var="lambda_zip_path=../dist/lambda.zip"

# Aplica
terraform apply -var="lambda_zip_path=../dist/lambda.zip"
```

### 4. Upload do frontend para S3

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

## Migração do Storage (MemStorage → DynamoDB)

O código atual usa `MemStorage` (em memória). Para usar DynamoDB, crie
`server/storage-dynamo.ts` implementando a interface `IStorage` com o
`@aws-sdk/client-dynamodb` ou `@aws-sdk/lib-dynamodb`. As variáveis de
ambiente `TABLE_USERS`, `TABLE_REQUESTS`, `TABLE_SUBTASKS` e `TABLE_COMMENTS`
são injetadas automaticamente pela Lambda.

## Variáveis importantes

| Variável               | Padrão          | Descrição                              |
|------------------------|-----------------|----------------------------------------|
| `aws_region`           | `us-east-1`     | Região AWS                             |
| `environment`          | `production`    | Nome do ambiente                       |
| `lambda_zip_path`      | `../dist/lambda.zip` | Caminho para o ZIP do backend     |
| `lambda_memory_size`   | `256`           | Memória da Lambda (MB)                 |
| `lambda_timeout`       | `30`            | Timeout da Lambda (segundos)           |
| `cloudfront_price_class` | `PriceClass_100` | Classe de preço CloudFront          |
