# NNN — <Nome da funcionalidade>

| | |
|---|---|
| **ID** | NNN |
| **Status** | Rascunho \| Aprovada \| Implementada \| Parcial \| Obsoleta |
| **Atores** | <quem usa> |
| **Depende de** | <specs relacionadas> |
| **Última revisão** | AAAA-MM-DD |

## Objetivo

Uma ou duas frases: que problema real isto resolve, para quem. Sem jargão técnico.

## Fora de escopo

O que esta funcionalidade **deliberadamente não faz**, para impedir que alguém "complete"
o que foi decidido não fazer.

## Histórias de usuário

**HU-1.** Como `<ator>`, quero `<ação>`, para que `<benefício>`.

## Requisitos

Formato: `RF-<ÁREA>-<NNN>` para funcionais, `RNF-<ÁREA>-<NNN>` para não funcionais.
Um requisito por linha, testável, sem "e" escondendo dois requisitos.

| ID | Requisito | Origem |
|---|---|---|
| RF-XXX-001 | O sistema DEVE … | HU-1 |

Use **DEVE** (obrigatório), **NÃO DEVE** (proibido), **PODE** (opcional).

## Regras de negócio

Regras nomeadas, com o **porquê**. É a parte mais valiosa da spec: o requisito diz o quê,
a regra diz por que não é do jeito óbvio.

### RN-1 — <nome da regra>
Enunciado.
**Por quê:** a alternativa considerada e o motivo da rejeição.

## Critérios de aceite

**CA-1** (RF-XXX-001)
- **Dado** …
- **Quando** …
- **Então** …

## Estados e transições

Se houver máquina de estados, diagrama ou tabela.

## Contrato

Endpoints envolvidos, com link para [`../architecture/api-contract.md`](../architecture/api-contract.md).

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| Regra compartilhada | `shared/schema.ts` | `…` |
| API | `server/routes.ts` | `…` |
| Persistência | `server/storage*.ts` | `…` |
| UI | `client/src/…` | `…` |

## Dívidas e lacunas

Divergências conhecidas entre esta spec e o código, com link para [`../backlog.md`](../backlog.md).
