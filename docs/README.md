# Documentação — BDN Comunicação

Documentação **Spec-Driven Development (SDD)** do sistema de gestão do Ministério de
Comunicação da Igreja Bola de Neve Nação.

> **Se você é um agente de IA (Claude, Devin, GPT, Cursor…), comece por
> [`guides/ai-agent-playbook.md`](guides/ai-agent-playbook.md).** Ele diz em que ordem ler,
> onde a intenção está registrada e quais armadilhas deste repositório já custaram tempo.

---

## Como esta documentação funciona

A regra do SDD aqui é simples: **a especificação é a fonte da verdade sobre o *que* e o
*porquê*; o código é a fonte da verdade sobre o *como*.** Quando os dois divergem, um dos
dois está errado — e o time decide qual, explicitamente, em vez de deixar a divergência
apodrecer.

O fluxo de qualquer mudança:

```
constitution.md  →  specs/NNN-*.md  →  decisions/ADR-*.md  →  código  →  spec atualizada
   (princípios)      (comportamento)      (escolha técnica)              (fecha o ciclo)
```

1. **Antes de codar:** encontre (ou escreva) a spec do comportamento em [`specs/`](specs/).
2. **Se a mudança envolve uma escolha técnica com alternativas reais:** registre um ADR em
   [`decisions/`](decisions/).
3. **Depois de codar:** atualize a spec no mesmo commit. Spec desatualizada é pior que
   spec ausente — ela mente com autoridade.

## Mapa dos documentos

| Documento | Responde a pergunta | Leia quando |
|---|---|---|
| [`constitution.md`](constitution.md) | Que regras nenhuma mudança pode quebrar? | **Sempre, primeiro.** |
| [`product/overview.md`](product/overview.md) | Para quem é isso e por quê? Quem são os atores? Que palavra significa o quê? | Antes de qualquer spec |
| [`specs/`](specs/) | Como cada funcionalidade deve se comportar? | Ao mudar comportamento |
| [`architecture/overview.md`](architecture/overview.md) | Como as peças se encaixam? | Ao mexer em mais de uma camada |
| [`architecture/data-model.md`](architecture/data-model.md) | Quais entidades existem e como são persistidas? | Ao mudar dados |
| [`architecture/api-contract.md`](architecture/api-contract.md) | Que endpoints existem, com que contrato e que autorização? | Ao mudar a API |
| [`architecture/security.md`](architecture/security.md) | O que estamos defendendo, contra quem, e como? | Ao mexer em auth, sessão, senha, permissão |
| [`architecture/infrastructure.md`](architecture/infrastructure.md) | Onde isso roda e quanto custa? | Ao mexer em deploy/Terraform |
| [`decisions/`](decisions/) | Por que foi feito assim, e não do jeito óbvio? | Antes de "melhorar" algo estranho |
| [`guides/development.md`](guides/development.md) | Como rodo e como escrevo código aqui? | No primeiro dia |
| [`guides/deployment.md`](guides/deployment.md) | Como coloco em produção? | Antes de publicar |
| [`guides/ai-agent-playbook.md`](guides/ai-agent-playbook.md) | Como um agente de IA trabalha neste repo sem quebrar nada? | Sempre, se você é IA |
| [`backlog.md`](backlog.md) | O que se sabe que está faltando ou torto? | Ao planejar o próximo passo |

## Índice das especificações

| ID | Spec | Status |
|---|---|---|
| 001 | [Solicitações de divulgação](specs/001-solicitacoes-de-divulgacao.md) | Implementada |
| 002 | [Acompanhamento público de solicitação](specs/002-acompanhamento-publico.md) | Implementada |
| 003 | [Autenticação, contas e permissões](specs/003-autenticacao-e-contas.md) | Implementada |
| 004 | [Perfil do membro](specs/004-perfil-do-membro.md) | Implementada |
| 005 | [Escalas de voluntários](specs/005-escalas-de-voluntarios.md) | Implementada |
| 006 | [Geração automática de escalas](specs/006-geracao-automatica-de-escalas.md) | Implementada |
| 007 | [Trilha de auditoria](specs/007-trilha-de-auditoria.md) | Implementada (sem UI) |

Nova spec? Copie [`specs/_template.md`](specs/_template.md) e use o próximo número livre.

## Índice das decisões (ADRs)

| ADR | Decisão | Status |
|---|---|---|
| [0001](decisions/ADR-0001-dynamodb-como-persistencia.md) | DynamoDB como banco, com `IStorage` como fronteira | Aceita |
| [0002](decisions/ADR-0002-drizzle-como-fonte-de-tipos.md) | Schema Drizzle/Postgres usado só como fonte de tipos | Aceita (com dívida) |
| [0003](decisions/ADR-0003-sessao-jwt-em-cookie-httponly.md) | Sessão em JWT dentro de cookie HttpOnly | Aceita |
| [0004](decisions/ADR-0004-bloqueio-permanente-de-conta.md) | Bloqueio permanente após 8 senhas erradas | Aceita |
| [0005](decisions/ADR-0005-conta-raiz-admin.md) | Conta raiz `admin` com privilégios especiais | Aceita |
| [0006](decisions/ADR-0006-treinamento-como-funcao-de-escala.md) | "Treinamento" como função de escala, não como flag | Aceita |
| [0007](decisions/ADR-0007-serverless-cloudfront-lambda.md) | CloudFront + S3 + API Gateway + Lambda + DynamoDB | Aceita |

## Convenções desta documentação

- **Idioma:** português. O código é bilíngue por herança (identificadores em inglês,
  comentários e domínio em português) — a documentação padroniza em português.
- **IDs de requisito:** `RF-<ÁREA>-<NNN>` (funcional) e `RNF-<ÁREA>-<NNN>` (não funcional).
  Eles são âncoras estáveis: cite-os em commits, PRs e prompts.
- **Critérios de aceite:** formato Dado/Quando/Então, verificáveis sem ambiguidade.
- **Referências ao código:** apontam para arquivo + símbolo (função, constante), nunca para
  número de linha — linha muda, símbolo raramente.
- **Status de spec:** `Rascunho` · `Aprovada` · `Implementada` · `Parcial` · `Obsoleta`.
