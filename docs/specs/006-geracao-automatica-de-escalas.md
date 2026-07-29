# 006 — Geração Automática de Escalas

| | |
|---|---|
| **ID** | 006 |
| **Status** | Implementada |
| **Atores** | Administrador |
| **Depende de** | [005 — Escalas de voluntários](005-escalas-de-voluntarios.md) |
| **Última revisão** | 2026-07-29 |

## Objetivo

Transformar "montar a escala do mês" de uma tarde de planilha em alguns cliques: distribuir
os voluntários pelos cultos das próximas semanas por rodízio justo, respeitando
indisponibilidades e a regra de treinamento, com **prévia revisável antes de salvar**.

## Fora de escopo

- Otimização global (o algoritmo é guloso, não busca o ótimo).
- Preferência de par ("prefiro servir com fulano") ou de horário.
- Peso por função (transmissão não "vale mais" que fotografia).
- Reprocessamento automático quando alguém registra indisponibilidade depois da geração.
- Geração agendada/recorrente sem intervenção humana.

## Histórias de usuário

**HU-1.** Como administrador, quero gerar as escalas de N semanas de uma vez, escolhendo os
dias da semana e os horários dos cultos.

**HU-2.** Como administrador, quero que a distribuição seja justa — quem serviu menos entra
primeiro.

**HU-3.** Como administrador, quero que quem avisou indisponibilidade não seja escalado
naquele período.

**HU-4.** Como administrador, quero **ver a prévia** antes de salvar, inclusive o que foi
pulado e as funções que ficaram sem ninguém.

**HU-5.** Como administrador, quero que domingo já venha com os dois cultos (manhã e noite).

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-GER-001 | O admin DEVE informar data inicial, número de semanas, dias da semana e, por dia, um ou mais cultos (horário + funções) | HU-1 |
| RF-GER-002 | Domingo, ao ser marcado, DEVE vir com dois cultos padrão: 10:00 e 18:00 | HU-5 |
| RF-GER-003 | Os demais dias DEVEM vir com um culto padrão às 18:00 | HU-1 |
| RF-GER-004 | Os cultos padrão DEVEM trazer marcadas apenas as funções operacionais (sem treinamento) | HU-1 |
| RF-GER-005 | Um dia sem cultos, ou cujos cultos não tenham função marcada, NÃO DEVE gerar escala | HU-1 |
| RF-GER-006 | A geração DEVE escolher, para cada função, o voluntário elegível com **menor carga acumulada** | HU-2 |
| RF-GER-007 | Empate na carga DEVE ser desempatado por nome (ordem alfabética), para tornar o resultado determinístico | HU-2 |
| RF-GER-008 | A carga inicial DEVE partir das escalas **já existentes** | HU-2 |
| RF-GER-009 | A geração NÃO DEVE escalar quem registrou indisponibilidade no período daquele culto | HU-3 |
| RF-GER-010 | A geração DEVE evitar repetir a mesma pessoa em duas funções no mesmo evento, **quando houver alternativa** | HU-2 |
| RF-GER-011 | A geração DEVE pular data+horário que já tenham escala, listando os pulos na prévia | HU-4 |
| RF-GER-012 | A geração DEVE respeitar a exclusividade do treinamento por período | [005](005-escalas-de-voluntarios.md) |
| RF-GER-013 | Uma função sem voluntário elegível DEVE ficar **vazia**, sem impedir a geração das demais | HU-4 |
| RF-GER-014 | A prévia DEVE ser recalculada a cada mudança de parâmetro, antes de qualquer gravação | HU-4 |
| RF-GER-015 | A gravação DEVE acontecer só na confirmação, via `POST /api/schedules/bulk` | HU-4 |
| RF-GER-016 | As escalas geradas DEVEM ter `eventType = "culto"`, título informado (padrão "Culto") e `notes = null` | HU-1 |

## Regras de negócio

### RN-1 — O algoritmo roda no cliente
`autoGenerateSchedules` vive em [`client/src/lib/escalas.ts`](../../client/src/lib/escalas.ts)
e produz a prévia; o servidor só recebe o resultado pronto e revalida a regra de treinamento.
**Por quê:** a prévia precisa ser interativa — o admin mexe nos parâmetros e vê o efeito na
hora. Um round-trip por tecla seria pior em latência e em custo de Lambda.
**Consequência que você precisa conhecer:** o servidor **não** revalida rodízio,
indisponibilidade nem duplicidade em `POST /api/schedules/bulk`. Um cliente malicioso pode
gravar qualquer escala válida sintaticamente. Aceito: só admins alcançam a rota, e admins já
podem criar qualquer escala manualmente. **Não** aceite isso para uma regra que valha contra
o próprio admin.

### RN-2 — Rodízio guloso por menor carga
Para cada função na ordem de `SCHEDULE_ROLES`, escolhe entre os elegíveis o de menor carga;
empate, ordem alfabética; incrementa a carga e segue.
**Por quê:** simples, explicável ("por que fulano pegou esse domingo?" tem resposta) e
suficiente. Otimização global seria impossível de justificar para a equipe.

### RN-3 — O treinamento é preenchido por último
`SCHEDULE_ROLES` termina em `treinamento`, e o laço itera nessa ordem.
**Por quê:** as funções que de fato cobrem o culto escolhem primeiro; sobra para o aprendiz
quem não está cobrindo posto nenhum naquele período. A ordem do array **é** a regra — não a
reordene sem entender isso.

### RN-4 — Chave de duplicidade é data + horário
Dois cultos no mesmo dia são escalas distintas; só há duplicata quando data **e** horário
coincidem.
**Por quê:** domingo tem manhã e noite. Usar só a data faria a geração pular o culto da
noite depois de criar o da manhã.

### RN-5 — Repetição no mesmo evento é o último recurso
`eligible.find(v => !usedInEvent.has(v.id)) ?? eligible[0]`.
**Por quê:** é melhor a mesma pessoa acumular duas funções num culto do que deixar a função
vazia. Mas só quando não há alternativa.

### RN-6 — Função sem candidato fica vazia
`if (eligible.length === 0) continue;`
**Por quê:** a escala parcial é útil e visível — o admin vê o buraco na prévia e decide
(chamar alguém, treinar alguém, ou aceitar). Abortar a geração inteira por uma função sem
gente seria pior.

### RN-7 — Indisponibilidade "dia inteiro" vira os três períodos
O índice `unavailableOn` expande `"dia"` em `manha`/`tarde`/`noite`.
**Por quê:** a comparação passa a ser sempre por período, sem caso especial no laço quente.

## Algoritmo

```
entrada: volunteers[], existing[], unavailability[], dates[], title

1. elegíveis   ← volunteers com roles.length > 0
2. load        ← 0 para cada elegível, + 1 por escalação existente
3. unavailableOn ← Set("<userId>:<data>:<período>"), com "dia" expandido em 3
4. scheduledSlots ← Set("<data> <horário>") das escalas existentes
5. rosterByPeriod ← cache de PeriodRoster por "<data>:<período>", semeado com o que já existe

para cada (data, horário, funções) em dates:
    se scheduledSlots tem "data horário": registra em skipped; continua
    marca scheduledSlots
    período ← periodOfTime(horário)
    roster  ← rosterByPeriod(data, período)

    para cada função em SCHEDULE_ROLES filtrada pelas funções pedidas:   # ordem fixa
        elegíveis_f ← elegíveis que
              têm a função
          E   não estão indisponíveis em "id:data:período"
          E   não estão bloqueados pelo roster (regra de treinamento)
        ordena por (load asc, displayName asc)
        se vazio: continua                       # função fica sem ninguém
        escolhido ← primeiro que ainda não foi usado neste evento, senão o primeiro
        adiciona escalação; load++; marca usado; atualiza roster (training | working)

    acumula a escala gerada

saída: { generated[], skipped[] }
```

`blockedNote(role, id, roster)` é a mesma função usada pelo formulário manual — treinamento
e função operacional se excluem dentro do período.

## Critérios de aceite

**CA-1** (RF-GER-006, RF-GER-007)
- **Dado** Lucas com 2 escalas e Mariana com 1, ambos habilitados em fotografia
- **Quando** gerar um culto que precisa de fotografia
- **Então** Mariana é escolhida; havendo empate, vence a ordem alfabética

**CA-2** (RF-GER-009)
- **Dado** Pedro indisponível em 2026-08-09 no período `noite`
- **Quando** gerar cultos em 2026-08-09 às 10:00 e às 18:00
- **Então** Pedro pode ser escalado no de 10:00 e **não** é escalado no de 18:00

**CA-3** (RF-GER-011)
- **Dado** que já existe escala em 2026-08-09 às 10:00
- **Quando** gerar incluindo essa data e horário
- **Então** o item aparece em `skipped` e nenhuma escala nova é criada para ele

**CA-4** (RF-GER-002, RF-GER-005)
- **Quando** o admin marcar domingo
- **Então** aparecem dois cultos (10:00 e 18:00) com as quatro funções operacionais marcadas
- **E quando** desmarcar todas as funções de um deles
- **Então** aquele culto não gera escala

**CA-5** (RF-GER-013)
- **Dado** que ninguém tem a função `transmissao`
- **Quando** gerar cultos que pedem transmissão
- **Então** as escalas são geradas com as demais funções preenchidas e a transmissão vazia

**CA-6** (RF-GER-012, RN-3)
- **Dado** o treinamento marcado num culto
- **Quando** gerar
- **Então** quem foi escalado em função operacional naquele período **não** é escolhido para
  o treinamento, e vice-versa

**CA-7** (RF-GER-014, RF-GER-015)
- **Quando** o admin alterar qualquer parâmetro
- **Então** a prévia é recalculada e **nada** é gravado até a confirmação

**CA-8** (RF-GER-010, RN-5)
- **Dado** dois voluntários de fotografia e apenas um de filmmaker, sendo esse um dos dois
- **Quando** gerar um culto com as duas funções
- **Então** o sistema evita usar a mesma pessoa nas duas, se houver alternativa

## Contrato

`POST /api/schedules/bulk` 🛡️ —
[`../architecture/api-contract.md`](../architecture/api-contract.md).

> A rota valida cada item contra as escalas salvas **e** contra as já criadas no lote, mas
> **não é transacional**: um conflito no item 5 devolve 400 com 1–4 já persistidos.

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| Algoritmo | [`client/src/lib/escalas.ts`](../../client/src/lib/escalas.ts) | `autoGenerateSchedules`, `datesForWeekdays`, `defaultSlotsForWeekday`, `makeScheduleSlot`, `rosterOfPeriod`, `blockedNote` |
| Regra compartilhada | [`shared/schema.ts`](../../shared/schema.ts) | `SCHEDULE_ROLES` (ordem!), `periodOfTime`, `EVENT_PERIODS`, `trainingConflicts` |
| UI | [`client/src/components/escalas/AutoGenerateDialog.tsx`](../../client/src/components/escalas/AutoGenerateDialog.tsx) | `AutoGenerateDialog`, `MAIN_WEEKDAY_OPTIONS`, `OTHER_WEEKDAY_OPTIONS` |
| API | [`server/routes.ts`](../../server/routes.ts) | `POST /api/schedules/bulk`, `trainingIssue` |

Dias de culto: domingo, quinta e sábado ficam visíveis; segunda, terça, quarta e sexta ficam
atrás de "Outros dias" — raramente usados, mas disponíveis para eventos ocasionais.

## Dívidas e lacunas

- O servidor não revalida rodízio, indisponibilidade nem duplicidade (RN-1).
- `bulk` não é transacional.
- A carga considera **todas** as escalas existentes, sem janela temporal: alguém com muitas
  escalas em 2025 continua "pesado" em 2026. Na prática, a base é nova e isso não aparece —
  mas é um comportamento a conhecer.
- Não há como fixar manualmente alguém numa data antes de gerar ("pin").

Ver [`../backlog.md`](../backlog.md).
