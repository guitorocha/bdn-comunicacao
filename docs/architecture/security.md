# Modelo de Segurança

> Este documento existe porque as decisões de segurança deste projeto **não são as óbvias**,
> e cada uma foi tomada contra uma alternativa concreta. Antes de "simplificar" qualquer
> coisa aqui, leia o porquê.

## O que estamos protegendo

| Ativo | Impacto se comprometido |
|---|---|
| Dados pessoais dos voluntários (nome, e-mail, telefone, célula) | Vazamento de dados de membros da igreja (LGPD) |
| Contas de administrador | Controle total: criar contas, apagar usuários, alterar escalas |
| Trilha de auditoria | Sem ela, um incidente vira especulação |
| Solicitações de divulgação | Baixo — informação de eventos públicos da igreja |

## De quem

| Adversário | Capacidade | Defesa principal |
|---|---|---|
| Curioso da internet | Descobre a URL, tenta senhas | Rate limit + bloqueio de conta + política de senha |
| Atacante distribuído | Muitos IPs, palpites lentos contra uma conta | Limite **por conta** + bloqueio permanente em 8 erros |
| XSS (dependência comprometida, script de terceiro) | Executa JS na página | Sessão em cookie `HttpOnly` — inalcançável por script |
| CSRF de outro site | Induz o navegador a chamar a API | Cookie `SameSite=strict` |
| Conta de admin comprometida | Tudo que um admin faz | Auditoria append-only + proteções da conta raiz |
| Quem tem acesso aos logs | Lê o CloudWatch | Log só de metadados; nunca corpo de request/resposta |

**Fora do escopo:** insider com acesso ao console AWS, ataque à cadeia de suprimentos do
npm, comprometimento físico do dispositivo do usuário.

## Autenticação e sessão

Implementação: [`server/tokens.ts`](../../server/tokens.ts) e o middleware de
[`server/routes.ts`](../../server/routes.ts).

```
login OK → JWT HS256 { sub: <id>, pv: <fingerprint da senha> }, iss "bdn-comunicacao", exp 12h
        → cookie bdn_session: HttpOnly, Secure (prod), SameSite=strict, Path=/, maxAge 12h
```

A cada request autenticado:

1. lê o cookie (fallback legado: header `Bearer`);
2. `jwt.verify` com `algorithms: ["HS256"]` — fecha a porta para `alg: none` e confusão de
   algoritmo — e `issuer` fixo;
3. **recarrega o usuário do banco** pelo `sub`;
4. compara `pv` com a impressão digital da senha atual → token emitido antes de uma troca
   de senha deixa de valer, sem lista de revogação;
5. recusa se `isLocked(user)` — **bloquear a conta derruba as sessões abertas**, senão a
   sessão do atacante sobreviveria justamente ao bloqueio causado por ele.

### Por que cookie `HttpOnly` e não `localStorage`

O token já ficou em `localStorage`. Qualquer script na página o alcançava — um XSS levaria a
sessão embora. Hoje o token é invisível para o JavaScript da própria aplicação, e o cliente
guarda em `localStorage` apenas **dados de exibição** (`bdn-auth-user-v2`), que não concedem
acesso a nada: falsificá-los muda a UI, não a autorização. Chaves antigas são removidas na
carga do app.

> **Consequência:** o cliente **precisa** enviar `credentials: "include"` em todo fetch. Já é
> o padrão em [`client/src/lib/queryClient.ts`](../../client/src/lib/queryClient.ts) —
> `fetch` cru feito em componente novo esquece isso e recebe 401.

### `JWT_SECRET`

- Produção: obrigatório, mínimo 32 caracteres. Sem ele, `resolveSecret` **lança** e a Lambda
  não sobe (falha fechada).
- Desenvolvimento: segredo efêmero aleatório, com aviso no console. Reiniciar o servidor
  invalida as sessões locais — comportamento esperado.
- Injetado pelo Terraform via `TF_VAR_jwt_secret`. **Nunca versionado.** Trocar o segredo
  desloga todo mundo — é a forma de revogação em massa.

## Senhas

[`server/password.ts`](../../server/password.ts) e `passwordIssue` em
[`shared/schema.ts`](../../shared/schema.ts).

- **Hash:** `scrypt` do Node, formato `scrypt:<salt hex 16B>:<derivado hex 64B>`.
  Comparação com `timingSafeEqual`. Escolhido em vez de bcrypt/argon2 por não exigir
  dependência nativa — o bundle da Lambda fica leve e o cold start, curto.
- **Política:** mínimo 10 caracteres; recusa uma lista de senhas óbvias já vistas por aqui
  (`bdn2026`, `senha123`, `admin`…); recusa senha igual ao nome de usuário.
  **Comprimento vale mais que regras de caractere** — uma frase longa é melhor que `S3nh@!`.
- **Legado em texto puro:** `verifyPassword` aceita comparação direta quando o valor
  armazenado não tem o prefixo `scrypt:`; o login regrava como hash na hora. É migração
  automática, não permissão para gravar texto puro.

### Senha provisória

Toda senha definida por um admin (criação de conta ou reset) marca
`mustChangePassword: true`. O cliente prende o usuário em `/#/usuarios` até a troca
(`PasswordChangeGate` em [`client/src/App.tsx`](../../client/src/App.tsx)).

> ⚠️ **A trava é só de UI.** A API continua aceitando as demais operações de um usuário com
> senha provisória. É um empurrão, não um controle de segurança — e não deve ser descrito
> como tal. Ver [`backlog.md`](../backlog.md).

## Bloqueio de conta

`MAX_FAILED_LOGINS = 8` senhas erradas **consecutivas** bloqueiam a conta em definitivo.
Não há prazo que destrave sozinho: um bloqueio temporário devolveria ao atacante a chance de
voltar quando a janela virasse. O acerto da senha zera o contador, então quem só erra de vez
em quando nunca chega perto do limite.

Saídas do bloqueio: `POST /api/users/:id/unlock` (qualquer admin, inclusive sobre a raiz) ou
um reset de senha, que também destrava.

**A mensagem de conta bloqueada revela que a conta existe.** É deliberado: quem está
trancado do lado de fora precisa saber por quê e a quem pedir. O bloqueio em si já tira o
valor da enumeração — a conta não abre de qualquer forma. Já a falha comum de login usa
mensagem única (`"Credenciais inválidas"`) para usuário inexistente e senha errada.

## Rate limiting

[`server/routes.ts`](../../server/routes.ts), com `express-rate-limit`. Janela de 15 minutos:

| Limitador | Chave | Limite | Razão |
|---|---|---|---|
| `loginIpLimiter` | IP | 30, **só falhas contam** | A equipe sai de um IP só depois do NAT; login certo de um não pode gastar a cota do outro |
| `loginUserLimiter` | `username` do corpo | 10, só falhas | Fecha o ataque distribuído que passa pelo limite de IP |
| `apiLimiter` | IP | 600 | Teto geral contra script abusivo |

Custo também é motivo: cada tentativa roda um `scrypt` (~70 ms de Lambda).

> ⚠️ **Limitação real:** o estado do `express-rate-limit` é **em memória, por container
> Lambda**. Com várias instâncias quentes, o limite efetivo é maior que o configurado. O
> bloqueio permanente de conta (persistido no DynamoDB) é a defesa que **não** tem esse
> furo — é por isso que ele existe.

`app.set("trust proxy", 1)` está ligado nos dois entrypoints. Sem isso, atrás do
CloudFront/API Gateway o `req.ip` seria o proxy e todos os usuários contariam como um só
cliente — e a auditoria registraria o IP errado.

## Autorização

Dois middlewares, sem meio-termo: `requireUser` e `requireAdmin`. Não há RBAC granular —
`roles` são funções de escala, **não permissões**.

**Regras de propriedade** (verificadas no handler, não no middleware):

- `DELETE /api/unavailability/:id` — só o dono ou um admin.
- `POST /api/requests/:id/comments` — `authorName` vem da sessão. Ninguém comenta como
  outra pessoa.
- `PATCH /api/users/me*` — sempre o usuário da sessão; o `id` não vem da URL.

### A conta raiz `admin`

É a via de recuperação quando tudo mais falha. Protegida contra os três caminhos de tomada:

| Ataque | Bloqueio |
|---|---|
| Admin comprometido reseta a senha da raiz | 403 — só a raiz redefine a própria senha |
| Admin comprometido rebaixa a raiz | 403 — a raiz não pode deixar de ser admin |
| Admin comprometido apaga e recria a raiz | 403 — a raiz não pode ser removida |

Exceção intencional: **qualquer admin pode desbloquear a raiz**. Sem isso, oito palpites
errados em `@admin` trancariam a recuperação do sistema e a única saída seria editar o
DynamoDB na mão. Se a senha da raiz for perdida, essa é de fato a saída.

`isRootAdmin` compara o `username` com `"admin"` (trim + lowercase) — não o `id`.

## Auditoria

Ver [spec 007](../specs/007-trilha-de-auditoria.md).

Defesa em profundidade em duas camadas:

1. **Aplicação:** não existe rota que altere ou apague uma entrada.
2. **IAM:** a policy `DynamoDBAuditAppendOnly` em
   [`infra/lambda.tf`](../../infra/lambda.tf) concede à Lambda apenas
   `PutItem`/`GetItem`/`Query`/`Scan` sobre a tabela `audit` — **sem** `UpdateItem` e **sem**
   `DeleteItem`. Mesmo um bug ou um RCE na aplicação não reescreve a trilha.

A tabela tem *point-in-time recovery* ligado. A gravação nunca derruba a operação que
registra: `recordAudit` engole o erro e loga (`server/audit.ts`) — um DynamoDB indisponível
não pode impedir alguém de fazer login.

**Nunca gravar na trilha:** senha, hash, token, corpo de request.

## Cabeçalhos e transporte

- `helmet()` nos dois entrypoints: HSTS, `X-Content-Type-Options`, `Referrer-Policy` etc.
- **CSP desligada** (`contentSecurityPolicy: false`). Precisa ser afinada contra o bundle do
  Vite e testada em produção, não só em dev. É a lacuna de segurança mais concreta hoje —
  registrada no [`backlog.md`](../backlog.md).
- CloudFront: `viewer_protocol_policy = redirect-to-https` em ambos os behaviors.
- S3: acesso público bloqueado; leitura só pelo CloudFront via OAC com `AWS:SourceArn`.

## CORS

`cors_allowed_origins = []` por padrão. O app chama `/api` pelo próprio domínio do
CloudFront — **é same-origin e não precisa de CORS**. `allow_credentials` liga apenas se a
lista tiver origens, e o Terraform **rejeita `"*"`** por validação
([`infra/variables.tf`](../../infra/variables.tf)): `"*"` liberaria a API para qualquer site.

Só preencha a lista se algum cliente for bater direto no API Gateway — e, se fizer isso,
revise `SameSite=strict`, que impede o envio do cookie cross-site.

## Log

[`server/index.ts`](../../server/index.ts) loga **só metadados**: método, caminho, status,
duração. O corpo da resposta já foi para o CloudWatch um dia — e ele carrega o token de
sessão no login e e-mails/telefones em `/api/users`. Corpo de request também nunca entra:
contém senha.

> ⚠️ Ao depurar, **não** adicione `console.log(req.body)` nem do corpo da resposta em
> código que possa ser commitado.

Retenção: 30 dias, na Lambda e no API Gateway.

## Checklist para mudanças sensíveis

Passe por esta lista ao mexer em auth, sessão, senha, permissão ou dado pessoal:

- [ ] A rota nova é privada por padrão? Se é pública, está justificada no
      [contrato da API](api-contract.md)?
- [ ] O `password` foi removido de toda resposta?
- [ ] A identidade do autor vem da sessão, não do corpo?
- [ ] A regra também é imposta no **servidor**, e não só avisada no cliente?
- [ ] Nenhum segredo, token ou corpo de request entrou em log?
- [ ] A ação merece entrada de auditoria? Se sim, foi adicionada a `AUDIT_ACTIONS`?
- [ ] Se mexeu em cookie/token: a sessão continua caindo em troca de senha, bloqueio e
      remoção de conta?
- [ ] Se adicionou tabela: a policy IAM da Lambda foi atualizada?
