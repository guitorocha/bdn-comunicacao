# 004 — Perfil do Membro

| | |
|---|---|
| **ID** | 004 |
| **Status** | Implementada |
| **Atores** | Membro da comunicação |
| **Depende de** | [003 — Autenticação](003-autenticacao-e-contas.md) |
| **Última revisão** | 2026-07-29 |

## Objetivo

Dar a cada membro um lugar para manter os próprios dados de contato e de célula, e para
trocar a própria senha — sem depender de um administrador e sem que ninguém edite os dados
de outra pessoa.

## Fora de escopo

- Foto de perfil / avatar.
- Alteração de `username` (imutável por decisão).
- Alteração das próprias `roles` — quem define funções é o admin ([spec 005](005-escalas-de-voluntarios.md)).
- Preferências de notificação (não há notificação).

## Histórias de usuário

**HU-1.** Como membro, quero manter meu telefone e e-mail atualizados, para que a liderança
consiga falar comigo.

**HU-2.** Como membro, quero registrar minha célula e sua liderança, para que a equipe saiba
de onde eu venho.

**HU-3.** Como membro, quero trocar minha senha sozinho, sabendo que as sessões abertas em
outros dispositivos serão encerradas.

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-PRF-001 | O membro DEVE poder editar `displayName`, `email`, `phone`, `cellName` e `cellLeaders` do próprio cadastro | HU-1, HU-2 |
| RF-PRF-002 | `displayName` DEVE ser obrigatório e não vazio | HU-1 |
| RF-PRF-003 | `email`, se informado, DEVE ser um e-mail válido; vazio é aceito | HU-1 |
| RF-PRF-004 | Campos de texto opcionais DEVEM ser limitados a 120 caracteres e ter espaços aparados | — |
| RF-PRF-005 | O sistema NÃO DEVE permitir alterar `username` | — |
| RF-PRF-006 | O sistema DEVE identificar o alvo da edição pela **sessão**, nunca por id na URL | — |
| RF-PRF-007 | O membro DEVE poder trocar a própria senha informando a senha atual | HU-3 |
| RF-PRF-008 | O sistema DEVE recusar (403) a troca se a senha atual estiver incorreta | HU-3 |
| RF-PRF-009 | A nova senha DEVE passar pela política de [003](003-autenticacao-e-contas.md) |  |
| RF-PRF-010 | A troca DEVE limpar `mustChangePassword` | HU-3 |
| RF-PRF-011 | A troca DEVE invalidar as sessões anteriores e **reemitir** o cookie de quem trocou | HU-3 |
| RF-PRF-012 | O cliente DEVE exigir confirmação da nova senha e avisar quando não conferirem | HU-3 |
| RF-PRF-013 | Membro com `mustChangePassword` DEVE ser levado a esta página e ver um aviso explicando por quê | [003](003-autenticacao-e-contas.md) |

## Regras de negócio

### RN-1 — Perfil nasce vazio
`email`, `phone`, `cellName` e `cellLeaders` começam `null` e são preenchidos pelo próprio
membro.
**Por quê:** o admin cria a conta com o mínimo (usuário, nome, senha). Pedir dados de contato
na criação atrasaria a entrada de gente nova e faria o admin digitar dado de terceiro.

### RN-2 — Só o dono edita
Não existe rota de admin para editar o perfil de outra pessoa.
**Por quê:** o dado é da pessoa. O admin já pode remover a conta, resetar a senha e definir
funções — editar telefone alheio não acrescenta nada e cria confusão sobre quem informou o
quê.

### RN-3 — Trocar a senha derruba as outras sessões
Efeito automático da impressão digital `pv` no token (RN-1 da [spec 003](003-autenticacao-e-contas.md)).
**Por quê:** é o comportamento certo quando alguém troca a senha por suspeita de
comprometimento. Reemitir o cookie de quem acabou de trocar evita o efeito colateral idiota
de deslogar justamente quem fez a coisa certa. A interface avisa isso ao usuário.

### RN-4 — A trava de senha provisória cobre só as áreas internas
`GATED_PATHS` = `/solicitacoes/painel`, `/escalas`, `/equipes`. As páginas públicas
(formulário, acompanhamento, home) continuam abertas.
**Por quê:** a trava é sobre o acesso interno; não faz sentido impedir que a pessoa veja a
landing page. Lembrando: a trava é de UI, não de API (RN-8 da [spec 003](003-autenticacao-e-contas.md)).

## Critérios de aceite

**CA-1** (RF-PRF-001, RF-PRF-006)
- **Dado** um membro autenticado
- **Quando** ele salvar o perfil
- **Então** apenas o **próprio** registro muda, e a resposta traz o `SafeUser` atualizado

**CA-2** (RF-PRF-003)
- **Quando** informar `email = "abc"`
- **Então** a API responde 400 com "E-mail inválido"; com `email = ""`, a gravação é aceita
  e o campo vira `null`

**CA-3** (RF-PRF-008)
- **Quando** trocar a senha informando a senha atual errada
- **Então** a API responde 403 "Senha atual incorreta" e nada muda

**CA-4** (RF-PRF-010, RF-PRF-011)
- **Dado** um membro com `mustChangePassword = true` logado também em outro dispositivo
- **Quando** trocar a senha
- **Então** a flag some, o outro dispositivo recebe 401 no próximo request e o dispositivo
  atual continua logado

**CA-5** (RF-PRF-013, RN-4)
- **Dado** um membro com `mustChangePassword = true`
- **Quando** tentar abrir `/#/escalas`
- **Então** é redirecionado para `/#/usuarios`, onde vê o aviso de troca obrigatória

**CA-6** (RF-PRF-012)
- **Quando** a confirmação não conferir com a nova senha
- **Então** o botão de envio fica desabilitado e aparece "As senhas não conferem."

## Contrato

`GET /api/users/me` 🔒 · `PATCH /api/users/me` 🔒 · `PATCH /api/users/me/password` 🔒 —
[`../architecture/api-contract.md`](../architecture/api-contract.md).

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| Schemas | [`shared/schema.ts`](../../shared/schema.ts) | `updateProfileSchema`, `changePasswordSchema` |
| API | [`server/routes.ts`](../../server/routes.ts) | rotas `── Perfil do próprio usuário ──` |
| Persistência | [`server/storage-dynamo.ts`](../../server/storage-dynamo.ts) | `updateUserProfile`, `updateUserPassword` |
| UI | [`client/src/pages/usuarios.tsx`](../../client/src/pages/usuarios.tsx) | `UsuariosPage`, `ProfileForm`, `PasswordForm` |
| Trava | [`client/src/App.tsx`](../../client/src/App.tsx) | `PasswordChangeGate` |
| Estado local | [`client/src/lib/auth.ts`](../../client/src/lib/auth.ts) | `updateUser` |

## Dívidas e lacunas

- O `displayName` é desnormalizado dentro de `schedules.assignments`; **alterá-lo não
  atualiza escalas já criadas** (comportamento intencional — ver
  [`../architecture/data-model.md`](../architecture/data-model.md) — mas pode confundir quem
  acabou de mudar o nome).
- Não há telefone/e-mail validados por formato brasileiro; são texto livre.

Ver [`../backlog.md`](../backlog.md).
