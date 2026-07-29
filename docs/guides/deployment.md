# Guia de Deploy

Deploy é **manual**, em três passos, de uma máquina com AWS CLI configurado. Não há CI/CD.
Detalhes de recursos e custos em
[`../architecture/infrastructure.md`](../architecture/infrastructure.md); os comandos
originais estão em [`infra/README.md`](../../infra/README.md).

## Pré-requisitos

- Node.js 20+, Terraform ≥ 1.5, AWS CLI autenticado com permissão para S3, CloudFront,
  API Gateway, Lambda, DynamoDB, IAM e CloudWatch.
- O segredo de assinatura de sessão em mãos.

> ⚠️ **O estado do Terraform é local** (`infra/terraform.tfstate`, fora do git). Só aplique
> a partir da máquina que já tem o estado, ou você criará recursos duplicados. Ver
> [`../backlog.md`](../backlog.md).

## Passo 1 — Build

```bash
npm run build
```

Produz:

| Artefato | Destino |
|---|---|
| `dist/public/` | S3 (passo 3) |
| `dist/lambda.zip` | Terraform (passo 2) |
| `dist/lambda.js` | Conteúdo do ZIP |
| `dist/index.cjs` | Servidor tradicional — **não usado no deploy serverless** |

Se o `terraform plan` falhar com `filebase64sha256 ... cannot find the file`, o build não
rodou.

## Passo 2 — Infraestrutura

O segredo nunca é versionado. Gere um novo com `openssl rand -hex 32`.

```bash
export TF_VAR_jwt_secret="<segredo de 32+ caracteres>"
cd infra
terraform init
terraform plan
terraform apply
```
```powershell
$env:TF_VAR_jwt_secret = "<segredo de 32+ caracteres>"
cd infra
terraform init; terraform plan; terraform apply
```

> **Trocar o `JWT_SECRET` desloga todo mundo.** Não é falha — é a forma de revogação em
> massa. Se não passar a variável, o `apply` falha na validação (mínimo 32 caracteres).

## Passo 3 — Frontend e invalidação

```bash
BUCKET=$(terraform output -raw s3_bucket_name)
CF_ID=$(terraform output -raw cloudfront_distribution_id)

aws s3 sync ../dist/public s3://$BUCKET --delete
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```
```powershell
$env:BUCKET = $(terraform output -raw s3_bucket_name)
$env:CF_ID  = $(terraform output -raw cloudfront_distribution_id)

aws s3 sync ../dist/public s3://$env:BUCKET --delete
aws cloudfront create-invalidation --distribution-id $env:CF_ID --paths "/*"
```

**A invalidação não é opcional:** o behavior padrão do CloudFront tem TTL de 1 dia (máx. 7).
Sem ela, os usuários continuam recebendo o bundle antigo.

## Passo 4 — Verificação

```bash
terraform output cloudfront_url
```

Abra a URL e confirme:

- [ ] A landing page carrega (front atualizado no S3).
- [ ] Login funciona e o cookie `bdn_session` aparece com `HttpOnly`, `Secure` e
      `SameSite=Strict`.
- [ ] Uma rota autenticada responde (ex.: `/#/escalas` lista escalas).
- [ ] O formulário público cria uma solicitação de teste — e a apague depois, se criar.
- [ ] O log da Lambda não traz `JWT_SECRET ausente` nem `AccessDeniedException`.

```bash
aws logs tail /aws/lambda/bdn-comunicacao-backend --since 10m --follow
```

## Semear a conta raiz (primeira instalação)

A conta `admin` é criada manualmente no DynamoDB. Modelo em
[`user-admin.example.json`](../../user-admin.example.json):

```bash
cp user-admin.example.json user-admin.json     # já está no .gitignore
# edite: troque CHANGE_ME por uma senha longa e única, remova o campo "_comment"
aws dynamodb put-item \
  --table-name bdn-comunicacao-users \
  --item file://user-admin.json
```

A senha entra em **texto puro** e vira hash `scrypt` no primeiro login. Faça o login logo
depois e troque a senha pela interface. **Nunca comite `user-admin.json`.**

Depois disso, crie os demais usuários pelo próprio app (`/#/equipes`) — eles já nascem com
senha hasheada e `mustChangePassword`.

## Recuperação: senha da conta raiz perdida

Nenhum outro admin pode redefinir a senha da raiz
([ADR-0005](../decisions/ADR-0005-conta-raiz-admin.md)). A saída é o DynamoDB:

```bash
# 1. Descubra o id da conta admin
aws dynamodb query --table-name bdn-comunicacao-users \
  --index-name username-index \
  --key-condition-expression "username = :u" \
  --expression-attribute-values '{":u":{"S":"admin"}}'

# 2. Grave uma senha provisória EM TEXTO PURO (o login a converte em hash)
aws dynamodb update-item --table-name bdn-comunicacao-users \
  --key '{"id":{"N":"<ID>"}}' \
  --update-expression "SET #p = :p, mustChangePassword = :m, failedLoginCount = :z REMOVE lockedAt" \
  --expression-attribute-names '{"#p":"password"}' \
  --expression-attribute-values '{":p":{"S":"<senha provisoria longa>"},":m":{"BOOL":true},":z":{"N":"0"}}'
```

Entre com a senha provisória e troque imediatamente pela interface.

## Rollback

Não há versionamento de artefato. O caminho é reconstruir a partir do commit anterior:

```bash
git checkout <commit anterior>
npm run build
cd infra && terraform apply
aws s3 sync ../dist/public s3://$BUCKET --delete
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

Front e backend são independentes: dá para reverter só o S3 (front) ou só a Lambda
(backend). Cuidado com incompatibilidade de contrato entre os dois.

> O ZIP usa timestamp fixo, então um build sem mudança de código gera o mesmo
> `source_code_hash` e o Terraform **não** redeploya a Lambda à toa.

## Diagnóstico rápido

| Sintoma | Provável causa |
|---|---|
| 500 em toda rota autenticada | `JWT_SECRET` ausente ou < 32 caracteres — a Lambda lança no boot |
| `AccessDeniedException` do DynamoDB | Tabela nova sem ARN na policy IAM de [`infra/lambda.tf`](../../infra/lambda.tf) |
| `Cannot find module` na Lambda | Dependência fora do allowlist de [`script/build.ts`](../../script/build.ts), ou bundle na raiz do ZIP em vez de `dist/` |
| 401 em tudo, logo após o deploy | `JWT_SECRET` mudou — comportamento esperado, todos precisam relogar |
| Front antigo continua aparecendo | Faltou a invalidação do CloudFront |
| Rate limit disparando cedo demais | `trust proxy` desativado faria todos contarem como um IP — confira que está ligado nos **dois** entrypoints |
| `GET /health` retorna 404 | Esperado: a rota existe no API Gateway e não no Express. Ver [`../backlog.md`](../backlog.md) |

## Backup

- **`audit`** tem *point-in-time recovery* habilitado.
- **As demais tabelas não têm.** Não há rotina de backup nem exportação. Habilitar PITR nas
  tabelas restantes custa pouco e está no [`../backlog.md`](../backlog.md).
