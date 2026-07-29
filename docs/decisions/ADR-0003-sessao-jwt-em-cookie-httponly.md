# ADR-0003 — Sessão como JWT em cookie HttpOnly, com impressão digital da senha

- **Status:** Aceita
- **Data:** 2026-07 (commits `9326214 security updates` e `5a953d4 ajustes de segurança`)
- **Relacionada:** [ADR-0007](ADR-0007-serverless-cloudfront-lambda.md), [spec 003](../specs/003-autenticacao-e-contas.md)

## Contexto

A versão anterior guardava o token de sessão em `localStorage` e o enviava no header
`Authorization`. Isso tem duas consequências ruins:

1. **Qualquer script na página alcança o token.** Um XSS — vindo de dependência
   comprometida ou script de terceiro — leva a sessão embora.
2. **Não havia revogação.** Trocar a senha, remover o admin ou apagar a conta não invalidava
   tokens já emitidos, que continuavam valendo até expirar.

Restrição do ambiente: a aplicação roda em **Lambda**, sem memória compartilhada entre
invocações. Sessão com estado em memória não funciona; sessão com estado em banco custa uma
leitura extra e um mecanismo de expurgo.

## Decisão

Sessão **sem estado no servidor**, em três partes:

1. **JWT HS256** com `sub` (id do usuário), `pv` (impressão digital da senha atual), issuer
   fixo `bdn-comunicacao` e validade de 12 h.
2. Entregue em **cookie `bdn_session`**: `HttpOnly`, `SameSite=strict`, `Secure` em produção,
   `Path=/`. **O token não vai no corpo da resposta.**
3. A cada request autenticado, o usuário é **recarregado do banco** e o `pv` é comparado com
   a impressão digital da senha atual; conta bloqueada é recusada.

`pv = sha256(hash_da_senha).slice(0, 16)`.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Manter token em `localStorage`** | Alcançável por qualquer script — o problema que motivou a mudança |
| **Sessão com estado (tabela de sessões)** | Uma leitura extra por request e expurgo para manter; o recarregamento do usuário já dá o mesmo efeito de revogação |
| **JWT sem recarregar o usuário** | Rápido, mas revogação passa a ser impossível: remover admin ou bloquear conta não teria efeito até a expiração |
| **Lista de revogação (denylist)** | Precisa de armazenamento compartilhado e de expurgo; o `pv` resolve o caso real (troca de senha) sem estado |
| **`SameSite=lax`** | Menos proteção contra CSRF sem ganho — o app é same-origin |

## Consequências

**Ganhos**
- XSS não rouba mais a sessão: o token é invisível ao JavaScript da página.
- CSRF fechado por `SameSite=strict`, sem token anti-CSRF.
- Revogação imediata e sem estado: troca de senha, bloqueio, remoção de admin e exclusão de
  conta valem no request seguinte.
- Funciona bem em Lambda: nada compartilhado entre invocações.

**Custos aceitos**
- **Uma leitura do usuário por request autenticado.** Trivial no volume atual.
- **O cliente precisa de `credentials: "include"` em todo fetch.** Já é padrão em
  [`client/src/lib/queryClient.ts`](../../client/src/lib/queryClient.ts); `fetch` cru feito
  em componente novo esquece isso e recebe 401.
- **Front e API precisam ser same-origin.** É o CloudFront que garante isso. Servir a API
  em outro domínio exigiria abrir CORS com credenciais e revisar o `SameSite`.
- **Trocar a senha derruba as sessões em outros dispositivos.** É o comportamento desejado;
  o cookie de quem trocou é reemitido para não deslogar quem fez a coisa certa.
- **`JWT_SECRET` vira segredo crítico.** Trocá-lo desloga todo mundo — o que também é a
  forma de revogação em massa. Em produção, ausência do segredo **impede o boot**.

**Passou a ser proibido**
- Devolver o token no corpo de qualquer resposta.
- Gravar token em `localStorage` (as chaves antigas são apagadas na carga do app).
- Logar corpo de request ou de resposta — o corpo do login já carregou token um dia
  ([`server/index.ts`](../../server/index.ts)).

## Dívida

O fallback de migração que aceita `Authorization: Bearer` (`readToken` em
[`server/routes.ts`](../../server/routes.ts)) existe apenas para abas antigas ainda abertas.
**Deve ser removido** quando todos tiverem relogado — registrado em
[`../backlog.md`](../backlog.md).
