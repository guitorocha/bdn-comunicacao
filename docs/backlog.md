# Backlog — Lacunas, Dívidas e Próximos Passos

Inventário do que se sabe estar faltando ou torto, levantado na documentação inicial
(2026-07-29) a partir da leitura do código e atualizado a cada funcionalidade nova
(B-29 a B-31 vieram dos lembretes de escala, 2026-07-31). **Nada aqui foi corrigido** —
este documento é o registro, não a correção.

Cada item traz: o que é, por que importa, e onde mexer. Prioridade é sugestão, não decisão.

---

## Prioridade alta

### B-01 — Estado do Terraform é local
O backend S3 está comentado em [`infra/main.tf`](../infra/main.tf); o estado vive em
`infra/terraform.tfstate` na máquina de quem aplicou.
**Risco:** perder a máquina significa reimportar todos os recursos à mão; duas pessoas
aplicando de máquinas diferentes divergem sem aviso.
**Correção:** bucket S3 dedicado + tabela DynamoDB de trava, `terraform init -migrate-state`.

### B-02 — CSP desligada
`helmet({ contentSecurityPolicy: false })` nos dois entrypoints.
**Risco:** sem Content-Security-Policy, um XSS tem liberdade total na página. O cookie
`HttpOnly` protege a sessão, mas não impede exfiltração de dados exibidos na tela.
**Correção:** afinar a política contra o bundle do Vite (atenção às fontes do Google
carregadas em [`client/index.html`](../client/index.html)) e testar no bundle de produção,
não só em dev.

### B-03 — Trava de senha provisória é só de UI
`PasswordChangeGate` redireciona no cliente; a API continua aceitando todas as operações de
um usuário com `mustChangePassword`.
**Risco:** a proteção que a documentação de segurança poderia sugerir não existe de fato —
uma chamada direta à API ignora a trava.
**Correção:** no `requireUser`, recusar (403) rotas que não sejam
`GET/PATCH /api/users/me*`, `GET /api/auth/me` e `POST /api/auth/logout` enquanto
`mustChangePassword` for verdadeiro. Atualizar [spec 003](specs/003-autenticacao-e-contas.md)
RN-8 e [`architecture/security.md`](architecture/security.md).

### B-04 — Nenhuma tela lê a trilha de auditoria
`GET /api/audit` e `AUDIT_ACTION_LABELS` existem; nenhum arquivo do cliente os usa.
**Risco:** a trilha só é consultável por chamada direta ou console do DynamoDB — na prática,
não é consultada.
**Correção:** página `/#/auditoria` restrita a admin. Esboço em
[spec 007](specs/007-trilha-de-auditoria.md).

### B-05 — Sem backup nas tabelas de dados
Só `audit` tem *point-in-time recovery*.
**Risco:** um `delete` errado em `users` ou `schedules` é irreversível.
**Correção:** habilitar PITR nas outras seis tabelas em
[`infra/dynamodb.tf`](../infra/dynamodb.tf). Custo baixo.

### B-06 — Sem testes automatizados
Não há framework nem suíte; `npm run check` (tsc) é o único portão.
**Risco:** as regras mais delicadas — rodízio, conflito de treinamento, carga mensal,
absorção de indisponibilidade — não têm rede de proteção, e são exatamente as que uma IA
tende a "otimizar".
**Correção:** Vitest cobrindo primeiro as funções puras: `autoGenerateSchedules`,
`trainingConflicts`, `monthlyLoadByVolunteer`, `overloadedMonths`, `periodOfTime`,
`blocksPeriod`, `passwordIssue`. Nenhuma delas precisa de mock.

---

## Prioridade média

### B-07 — Admin pode revogar o próprio `isAdmin` pela API
A UI desabilita o switch do próprio usuário; `PATCH /api/users/:id/admin` não impede.
**Risco:** é possível ficar sem nenhum admin além da conta raiz.
**Correção:** 403 quando `target.id === actor.id && isAdmin === false`.

### B-08 — `username` `admin` não é reservado na criação
`POST /api/users` aceita criar alguém com `username = "admin"` se a conta raiz não existir —
e essa pessoa herda os privilégios de raiz.
**Correção:** recusar `isRootAdmin({ username })` em `POST /api/users`.

### B-09 — Exclusão de usuário não faz limpeza
`DELETE /api/users/:id` remove só o item de `users`. Ficam órfãs as indisponibilidades e as
escalações futuras com o nome da pessoa.
**Correção:** apagar as indisponibilidades do usuário e decidir o que fazer com escalas
futuras (remover a escalação, ou manter e sinalizar). Decisão de produto — precisa de spec.

### B-10 — `POST /api/schedules/bulk` não é transacional
Um conflito no item 5 devolve 400 com os itens 1–4 já persistidos.
**Correção:** validar **todos** os itens antes de gravar qualquer um (o conflito de
treinamento já é calculável sobre o lote inteiro sem escrever nada).

### B-11 — Domínios não validados por Zod
`eventType` e `promotionType` de `requests` e `eventType` de `schedules` são `text` livre; só
o formulário restringe. `status` é validado por lista literal na rota.
**Correção:** `z.enum` nos `insert*Schema` de [`shared/schema.ts`](../shared/schema.ts).

### B-12 — Fallback `Authorization: Bearer` ainda ativo
`readToken` em [`server/routes.ts`](../server/routes.ts) aceita o header, resquício da
migração para cookie.
**Risco:** amplia a superfície de autenticação sem necessidade; um token vazado por outro
canal continua utilizável.
**Correção:** remover, agora que a migração já ocorreu.

### B-13 — `PATCH /api/users/:id/roles` não é auditado
Muda o que a pessoa pode fazer nas escalas e não deixa rastro.
**Correção:** nova ação em `AUDIT_ACTIONS` (ex.: `user.roles`) e chamada a `recordAudit`.

### B-14 — Rate limit em memória por container Lambda
`express-rate-limit` guarda o estado no processo; com várias instâncias quentes o limite
efetivo é maior que o configurado.
**Mitigação existente:** o bloqueio de conta é persistido no DynamoDB.
**Correção possível:** store compartilhado no DynamoDB — avalie se o ganho justifica a
leitura/escrita extra por request.

### B-15 — Divergências entre `infra/README.md` e o código
1. Diz `aws_region = us-east-1`; o `variables.tf` traz `sa-east-1`.
2. Cita `scripts/build-lambda.sh`, que não existe (é `npm run build`).
3. O output `dynamodb_tables` lista 4 das 7 tabelas.
**Correção:** alinhar os três pontos.

### B-16 — `GET /health` existe no API Gateway e não no Express
A rota está declarada em [`infra/api_gateway.tf`](../infra/api_gateway.tf) e cai no 404 do
Express.
**Correção:** implementar o handler (útil para monitoramento) ou remover a rota.

---

## Prioridade baixa

### B-17 — Dependências não usadas
`passport`, `passport-local`, `express-session`, `connect-pg-simple`, `memorystore`, `pg`,
`ws` (e os `@types` correspondentes) não são importados por nenhum arquivo.
**Risco:** superfície de supply chain e confusão sobre o mecanismo real de autenticação.
**Correção:** remover em um commit próprio, rodando `npm run check` e `npm run build`
depois. **Não** faça junto com outra mudança.

### B-18 — Sair do Drizzle
Ver [ADR-0002](decisions/ADR-0002-drizzle-como-fonte-de-tipos.md). Remover
`drizzle.config.ts`, o script `db:push` e as declarações `pgTable`, substituindo por objetos
Zod. Tarefa grande, de valor sobretudo em clareza. Faça só quando houver folga — o arquivo é
a espinha dorsal do projeto.

### B-19 — Imports mortos em `shared/schema.ts`
`varchar` e `timestamp` são importados e não usados.

### B-20 — Tratamento do 409 no cliente é frágil
[`client/src/pages/solicitacoes.tsx`](../client/src/pages/solicitacoes.tsx) detecta o
conflito com `msg.includes("409")` e tenta reparsear a mensagem.
**Correção:** fazer `apiRequest` propagar `status` e corpo estruturado no erro.

### B-21 — Um voluntário por função e por evento
`ScheduleFormDialog` indexa a seleção por função (`Record<ScheduleRole, string>`), então dois
fotógrafos no mesmo culto não são representáveis — embora o modelo de dados suporte.
**Correção:** só se o ministério pedir. Precisa de spec.

### B-22 — Carga do rodízio sem janela temporal
`autoGenerateSchedules` conta **todas** as escalas existentes, sem recorte de período. Alguém
com muitas escalas antigas continua "pesado" indefinidamente.
**Correção:** considerar apenas os últimos N meses. Hoje não aparece porque a base é nova.

### B-23 — Concorrência sem detecção
Dois admins editando a mesma escala: o último `PUT` vence, silenciosamente. Sem `ConditionExpression`
nem versão otimista.
**Correção:** `ConditionExpression` sobre um campo de versão, se o problema aparecer na
prática.

### B-24 — IDs de solicitação enumeráveis com dados pessoais
`GET /api/requests/:id` é público e devolve `requesterName` e a descrição do evento.
**Correção (se o conteúdo ficar sensível):** token opaco de acompanhamento por solicitação.
Ver [spec 002](specs/002-acompanhamento-publico.md) RN-2.

### B-25 — `environment != "production"` quebra a Lambda
`NODE_ENV` recebe `var.environment`; com `staging`, o código instancia `MemStorage`, que
lança em produção.
**Correção:** desacoplar `NODE_ENV` (sempre `production` na Lambda) do nome do ambiente.

### B-26 — Sem pipeline de CI
Nem `npm run check` roda automaticamente.
**Correção:** GitHub Actions com `npm ci && npm run check` (e os testes de B-06, quando
existirem) em PR.

### B-27 — Metadados de terceiro no HTML
[`client/index.html`](../client/index.html) traz `<meta name="generator" content="Perplexity Computer">`
e links relacionados, herdados da geração inicial. Também há um componente chamado
`PerplexityAttribution` que, na verdade, renderiza o rodapé com o endereço da igreja — o nome
não corresponde ao conteúdo.
**Correção:** limpar os metadados e renomear o componente para algo como `SiteFooter`.

### B-28 — Polling em vez de tempo real
Painel de solicitações a cada 5 s; escalas a cada 10 s.
**Correção:** aceitável no volume atual; só reveja se o custo de invocação incomodar.

### B-29 — Lembrete que não chega não avisa ninguém
Se todos os envios de um voluntário falharem, o job conta a falha no log da Lambda e segue.
Não há tela, alerta nem e-mail — e a marca de idempotência já foi gravada, então aquele
lembrete não é retentado ([spec 008](specs/008-lembretes-de-escala.md), RN-3).
**Risco:** alguém deixa de ser avisado e ninguém percebe até o culto.
**Correção:** um `aws_cloudwatch_metric_alarm` sobre `Errors` da função
`${app_name}-reminders` — barato agora que o job tem função e log group próprios
([ADR-0008](decisions/ADR-0008-web-push-para-lembretes.md)). Para as falhas parciais (envio
que não completa, sem a função quebrar), expor o resultado dos últimos disparos numa tela
de admin.

### B-30 — Push no iPhone exige instalar o app na Tela de Início
Limitação da Apple, não do projeto: o Safari só entrega notificação para web app instalado.
A tela explica o passo a passo, mas quem não fizer não recebe lembrete nenhum.
**Correção:** não há, do lado do código. Se a adesão ficar baixa, a saída documentada é
migrar o canal para a Cloud API do WhatsApp com um segundo número
([ADR-0008](decisions/ADR-0008-web-push-para-lembretes.md)).

### B-31 — `terraform fmt` desalinhado em quatro arquivos
`api_gateway.tf`, `cloudfront.tf`, `lambda.tf` e `outputs.tf` não passam em
`terraform fmt -check` — anterior a este backlog, cosmético.
**Correção:** rodar `terraform fmt` num commit isolado, para o diff não se misturar a
mudança de comportamento.

---

## Ideias de produto (sem decisão)

Registradas para não se perderem — nenhuma foi pedida:

- Confirmação de presença do voluntário na escala.
- Troca de escala entre voluntários (swap com aprovação do admin).
- Exportação da escala do mês (imagem ou PDF) para postar no grupo.
- Histórico "quantas vezes servi este ano" na visão do voluntário.

> O lembrete automático **saiu desta lista**: foi implementado por notificação push na
> [spec 008](specs/008-lembretes-de-escala.md), com a escolha do canal registrada no
> [ADR-0008](decisions/ADR-0008-web-push-para-lembretes.md). Envio por WhatsApp continua
> fora de escopo.
