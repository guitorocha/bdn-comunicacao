# Guia de Desenvolvimento

## Pré-requisitos

- **Node.js 20+** (a Lambda roda `nodejs20.x`; use a mesma major para não descobrir
  diferença só em produção)
- npm
- Para deploy: AWS CLI configurado e Terraform ≥ 1.5

Nenhum banco local é necessário — em desenvolvimento o sistema usa armazenamento em memória.

## Subir o ambiente

```bash
npm install
npm run dev
```

Isso sobe **um único processo** em `http://localhost:5000` servindo a API e o front (Vite em
middleware, com HMR). Abra `http://localhost:5000/#/`.

### Usuários de desenvolvimento

`MemStorage` semeia seis contas na inicialização:

| Usuário | Nome | Admin | Funções |
|---|---|---|---|
| `admin` | Administrador | ✅ | — |
| `comunicacao` | Equipe Comunicação | | projeção |
| `lucas` | Lucas Almeida | | fotografia, filmmaker |
| `mariana` | Mariana Souza | | fotografia |
| `pedro` | Pedro Santos | | projeção, transmissão |
| `gabriel` | Gabriel Costa | | transmissão, filmmaker |

**A senha não está no código.** Todas compartilham `DEV_SEED_PASSWORD`; se a variável não
estiver definida, uma senha aleatória é sorteada e **impressa no console**:

```
[seed] senha dos usuários de desenvolvimento: 3f9c2a…
```

Para uma senha estável entre reinícios (lembre do mínimo de 10 caracteres):

```bash
# bash
DEV_SEED_PASSWORD=desenvolvimento123 npm run dev
```
```powershell
# PowerShell
$env:DEV_SEED_PASSWORD = "desenvolvimento123"; npm run dev
```

> **Os dados são em memória.** Reiniciar o servidor apaga tudo e ressemeia. Isso é
> proposital: nenhum dado de desenvolvimento pode encostar em produção, e `MemStorage`
> **lança exceção** se instanciada com `NODE_ENV=production`.

### Variáveis de ambiente

| Variável | Dev | Produção |
|---|---|---|
| `NODE_ENV` | `development` (definida pelo script) | `production` — **decide o storage** |
| `PORT` | opcional, padrão 5000 | n/a |
| `DEV_SEED_PASSWORD` | opcional | ignorada |
| `JWT_SECRET` | opcional (gera efêmero e avisa) | **obrigatória**, ≥ 32 caracteres |
| `DYNAMODB_REGION`, `TABLE_*` | não usadas | injetadas pelo Terraform |

Não existe `.env` versionado; o `.gitignore` cobre `.env*`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (API + Vite/HMR) na porta 5000 |
| `npm run check` | `tsc` — verificação de tipos, sem emissão. **É o portão de qualidade do projeto** |
| `npm run build` | Build completo: cliente + `dist/index.cjs` + `dist/lambda.js` + `dist/lambda.zip` |
| `npm start` | Roda `dist/index.cjs` com `NODE_ENV=production` — **usa DynamoDB de verdade** |
| `npm run db:push` | ⚠️ **Não use.** Resquício do template Postgres; não há banco relacional. Ver [ADR-0002](../decisions/ADR-0002-drizzle-como-fonte-de-tipos.md) |

> `npm start` não é "rodar em produção localmente de forma segura": ele conecta no DynamoDB
> real com as credenciais do seu AWS CLI.

## Como validar uma mudança

Não há suíte de testes automatizados neste repositório. O ciclo mínimo:

1. **`npm run check`** — obrigatório. Não deixe erro de tipo passar.
2. **Exercite o fluxo no navegador** com o usuário certo (comum vs admin) — muitas regras só
   aparecem para um dos dois.
3. **Verifique o servidor também.** Se a regra também vale na API, teste com `curl`/Postman
   — o formulário pode estar mascarando a ausência da validação no servidor
   ([Artigo III](../constitution.md)).
4. **Atualize a spec** correspondente em [`../specs/`](../specs/) no mesmo commit.

Para lógica pura (rodízio, conflito de treinamento, carga mensal), um script isolado é o
caminho mais rápido:

```bash
npx tsx caminho/do/script.ts   # importa de shared/schema.ts e client/src/lib/escalas.ts
```

## Onde mexer em quê

| Quero… | Mexa em |
|---|---|
| Mudar uma regra que vale nos dois lados | [`shared/schema.ts`](../../shared/schema.ts) |
| Adicionar/alterar endpoint | [`server/routes.ts`](../../server/routes.ts) + [`api-contract.md`](../architecture/api-contract.md) |
| Adicionar operação de dados | `IStorage` em [`server/storage.ts`](../../server/storage.ts) + `MemStorage` + [`storage-dynamo.ts`](../../server/storage-dynamo.ts) |
| Mudar a lógica de escalas na UI | [`client/src/lib/escalas.ts`](../../client/src/lib/escalas.ts) |
| Mudar tela | `client/src/pages/` e `client/src/components/` |
| Mudar autenticação/sessão | [`server/tokens.ts`](../../server/tokens.ts), [`server/routes.ts`](../../server/routes.ts) e [`security.md`](../architecture/security.md) |
| Mudar infraestrutura | [`infra/`](../../infra/) + [`infrastructure.md`](../architecture/infrastructure.md) |
| Mudar o build | [`script/build.ts`](../../script/build.ts) |

## Convenções

### Nomes e idioma
Identificadores em inglês; comentários, mensagens de UI e termos de domínio em português
(`escala`, `voluntário`, `indisponibilidade`, `solicitação`). Mantenha o padrão do arquivo
que você está editando.

### Comentários
Comente o **porquê**, não o quê ([Artigo VII](../constitution.md)). Ao editar um trecho
comentado, preserve ou atualize a justificativa — apagá-la para "limpar" destrói informação
que não está em lugar nenhum.

### Componentes de UI
`client/src/components/ui/` é shadcn/ui gerado sobre Radix. **Não edite** esses arquivos
para resolver um caso específico; componha por cima. Se precisar de um componente novo do
shadcn, adicione-o seguindo o padrão dos existentes (o [`components.json`](../../components.json)
guarda a configuração).

### `data-testid`
Elementos interativos têm `data-testid` em kebab-case (`button-create-user`,
`input-new-password`, `card-schedule-<id>`). Mantenha ao editar e acrescente em elementos
novos — a convenção prepara o terreno para testes de UI.

### Formulários e erros
- Validação com Zod, reaproveitando os schemas de `@shared/schema` quando existirem.
- Feedback por `useToast`.
- Erros de API chegam como `Error` cuja `message` já é a mensagem em português da API — use
  `err.message` no toast, não uma string genérica.

### Chamadas HTTP
Use `apiRequest` / `getQueryFn` de
[`client/src/lib/queryClient.ts`](../../client/src/lib/queryClient.ts). `fetch` cru esquece
`credentials: "include"` e recebe 401.

Chaves de query são o caminho da API: `["/api/schedules"]`, `["/api/requests", id]`. Após
mutação, invalide a chave correspondente.

### Datas
Strings, sempre: `YYYY-MM-DD` e `HH:mm`. Comparação e ordenação lexicográficas são
intencionais. Formatação para exibição com `date-fns` + locale `ptBR`
(`formatScheduleDate`, `formatMonthLabel`).

## Armadilhas do repositório

1. **`pgTable` não significa PostgreSQL.** O banco é DynamoDB.
   [ADR-0002](../decisions/ADR-0002-drizzle-como-fonte-de-tipos.md).
2. **Dois entrypoints de servidor.** Middleware adicionado em `server/index.ts` **não existe
   em produção** — replique em `server/lambda.ts` ou coloque dentro de `registerRoutes`.
3. **Roteamento por hash.** URLs são `/#/rota`. A query string do navegador fica em
   `window.location.search`, **fora** do hash — mas a página de acompanhamento lê o `?id=`
   de dentro do hash. Confira qual padrão se aplica.
4. **A ordem de `SCHEDULE_ROLES` é regra de negócio** — `treinamento` por último faz a
   geração automática preencher o aprendiz depois das funções operacionais.
5. **Dependência de runtime nova precisa entrar no allowlist** de
   [`script/build.ts`](../../script/build.ts), senão não vai no ZIP da Lambda e o erro só
   aparece em produção.
6. **Tabela nova exige três edições no Terraform:** recurso, variável de ambiente e policy
   IAM.
7. **Nunca logue corpo de request ou resposta** — carrega senha e token.
8. **Dependências não usadas:** `passport`, `express-session`, `connect-pg-simple`,
   `memorystore`, `pg`, `ws`. Vieram do template. **Não são o mecanismo de autenticação** —
   não parta delas para entender a sessão. Ver [`../backlog.md`](../backlog.md).

## Git

- Branch principal de trabalho: `develop`. Branch de produção: `master`.
- Mensagens seguem Conventional Commits de forma aproximada (`feat:`, `chore:`), em
  português ou inglês — siga o estilo recente do histórico.
- **Nunca comite:** `user-admin.json`, `.env*`, `infra/terraform.tfstate*`, `*.tfvars`,
  `dist/`, binários de provider do Terraform. Todos já estão no `.gitignore`.
