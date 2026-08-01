# ADR-0006 — Modelar "treinamento" como uma função de escala, não como flag

- **Status:** Aceita
- **Data:** 2026-07 (commit `7d26706`)
- **Relacionada:** [spec 005](../specs/005-escalas-de-voluntarios.md), [spec 006](../specs/006-geracao-automatica-de-escalas.md)

## Contexto

Pessoas novas na equipe aprendem acompanhando quem já sabe: assistem a um culto ao lado do
fotógrafo ou do operador de projeção. Isso precisava aparecer na escala — quem está indo, em
que culto — mas **não** é um posto de trabalho: o aprendiz não é responsável por nada.

O erro concreto que a escala manual cometia: colocar a pessoa em treinamento **e** na
projeção do mesmo culto, o que anula o treinamento (ela vira responsável e não acompanha
ninguém).

Complicação: domingo tem dois cultos, manhã e noite. Quem treina de manhã continua livre
para servir à noite.

## Decisão

Modelar o treinamento como um valor a mais em `SCHEDULE_ROLES`:

```ts
export const SCHEDULE_ROLES = ["fotografia","filmmaker","projecao","transmissao","treinamento"];
export const TRAINING_ROLE = "treinamento";
export const OPERATIONAL_ROLES = SCHEDULE_ROLES.filter(r => r !== TRAINING_ROLE);
```

Com três regras que acompanham a modelagem:

1. **Exclusividade por período:** quem está em treinamento não pode ocupar outra função no
   mesmo período do mesmo dia — e vice-versa (`trainingConflicts`).
2. **Ordem importa:** `treinamento` é o **último** de `SCHEDULE_ROLES`, e a geração
   automática itera nessa ordem. As funções que cobrem o culto escolhem primeiro; sobra para
   o aprendiz quem não está cobrindo posto nenhum.
3. **Fora do padrão da geração:** `makeScheduleSlot` traz apenas `OPERATIONAL_ROLES`
   marcadas — a vaga de treinamento é ocasional, marcada à mão.

A restrição é imposta na API (criação, edição e lote) e antecipada no formulário, usando as
**mesmas funções** de `shared/schema.ts` ([Artigo III](../constitution.md)).

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| **Flag `isTraining` na escalação** | `{ role: "projecao", isTraining: true }` significaria "está na projeção, mas treinando" — ambíguo justamente no ponto que a regra precisa desambiguar, e exigiria tratar a flag em todo lugar que lê `role` |
| **Entidade separada `trainings`** | Mais uma tabela, mais uma consulta e a mesma regra de exclusividade teria que cruzar duas coleções |
| **Campo `traineeId` na escala** | Limitaria a um aprendiz por culto e duplicaria a lógica de indisponibilidade e de carga |
| **Bloquear o dia inteiro** | Tiraria de circulação quem treina de manhã e poderia servir à noite — perda real de gente num time pequeno |
| **Só avisar, sem bloquear** | O erro que motivou a regra é silencioso e passa despercebido; aqui, ao contrário da sobrecarga, bloquear é barato |

## Consequências

**Ganhos**
- Zero campo novo no modelo de dados: `assignments` continua sendo `(role, id, nome)`.
- Toda a maquinaria existente — geração automática, indisponibilidade, contagem de carga,
  badges, formulário — funciona sem caso especial.
- A regra tem **uma** implementação (`trainingConflicts`), usada por cliente e servidor.

**Custos aceitos**
- **A ordem de `SCHEDULE_ROLES` virou regra de negócio.** Reordenar o array muda o resultado
  da geração automática. Está comentado no código e documentado aqui.
- Quem lista "as funções da equipe" precisa saber quando usar `SCHEDULE_ROLES` e quando usar
  `OPERATIONAL_ROLES`.
- O treinamento entra na contagem de carga mensal como qualquer escala — o que é
  intencional (a pessoa esteve lá), mas vale saber ao ler o aviso de sobrecarga.

**Apresentação**
O treinamento é exibido com cor neutra e **borda tracejada** (`ROLE_BADGE_CLASSES`), de
propósito: quem está ali não é o responsável pelo posto. Preserve isso ao mexer no visual.
