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
- **Calendário de cultos persistido.** As datas sem culto e os horários próprios valem para
  aquela geração e morrem com o diálogo (RF-GER-021) — não há entidade "data sem culto" nem
  tabela nova. Se um dia isso virar um calendário de verdade, o modelo a imitar é a
  indisponibilidade ([005](005-escalas-de-voluntarios.md)), que atravessa `IStorage`, as duas
  implementações e o Terraform.

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

**HU-6.** Como administrador, quero desmarcar as datas sem culto e ajustar o horário de datas
específicas antes de gerar — nem todo sábado do mês tem evento, e nos que têm o horário muda
de semana para semana.

**HU-7.** Como administrador, quero dar um título a cada dia da semana, porque quinta e sábado
não são o mesmo culto e a escala precisa dizer qual é.

**HU-8.** Como administrador, quero nomear datas específicas na hora de gerar — o evento de
sábado costuma ter um nome por edição, e digitar isso depois em cada escala é retrabalho.

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-GER-001 | O admin DEVE informar data inicial, número de semanas, dias da semana e, por dia, um título e um ou mais cultos (horário + funções) | HU-1 |
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
| RF-GER-016 | As escalas geradas DEVEM ter `eventType = "culto"`, o título do seu dia da semana e `notes = null` | HU-1 |
| RF-GER-017 | Cada dia da semana marcado DEVE listar as datas concretas do período, todas marcadas por padrão | HU-6 |
| RF-GER-018 | Data desmarcada NÃO DEVE gerar escala, em nenhum dos horários daquele dia | HU-6 |
| RF-GER-019 | Uma data PODE ter horários próprios, herdados do padrão do dia na primeira edição, com opção de restaurar o padrão | HU-6 |
| RF-GER-020 | As funções de uma data DEVEM ser as do horário padrão do dia da semana — a data ajusta horário e nome, não funções | HU-6 |
| RF-GER-021 | Datas desmarcadas e horários próprios DEVEM ser estado do formulário, descartados ao fechar o diálogo | HU-6 |
| RF-GER-022 | Cada dia da semana DEVE ter o seu próprio título, com padrão "Culto" | HU-7 |
| RF-GER-023 | Título em branco DEVE cair no padrão "Culto", não gerar escala sem título | HU-7 |
| RF-GER-024 | A prévia DEVE mostrar o título de cada escala, já que ele varia dentro do mesmo lote | HU-7, HU-4 |
| RF-GER-025 | A lista de datas DEVE começar recolhida, com o resumo das exceções visível mesmo recolhida | HU-6 |
| RF-GER-026 | A lista DEVE abrir sozinha quando o dia já tiver data desmarcada, nome próprio ou horário próprio na janela vigente | HU-6 |
| RF-GER-027 | Uma data PODE ter nome próprio, opcional, que substitui o título do dia da semana | HU-8 |
| RF-GER-028 | Nome próprio em branco DEVE herdar o título do dia, e o campo DEVE mostrar esse título como `placeholder` | HU-8 |

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

### RN-8 — A data ganha do dia da semana
`WeekdayPlan` guarda o molde (`slots`) e as exceções: `plan.slotsByDate[date] ?? plan.slots`,
e `excludedDates` vence os dois.
**Por quê:** o dia da semana é o molde, a data é o fato. Sábado tem culto "às 18:00" só até o
sábado em que não tem culto nenhum, ou em que o culto é às 19:30.
**Consequências que você precisa conhecer:** as exceções moram **dentro** do dia da semana,
então desmarcar o dia descarta as dele junto — de propósito, para não guardar exclusão órfã de
um dia que não gera mais nada. E exceção de data fora da janela vigente é ignorada, não
apagada: mudar "A partir de" e voltar traz a exclusão de volta. Por isso o resumo do bloco de
datas conta só o que está **na janela** — badge que fala de data fora do período seria mentira.

### RN-11 — Exceção nunca fica escondida
A lista de datas começa recolhida (oito domingos com dois horários cada é lista demais para
quem só quer gerar o mês), mas o resumo — "7 de 8", "1 com horário próprio" — fica no próprio
botão que recolhe, e a lista abre sozinha se o dia já tiver exceção.
**Por quê:** recolher é economia de tela, não de informação. O admin não pode salvar 30
escalas sem perceber que um sábado ficou de fora dentro de um bloco fechado.

### RN-9 — A ordem cronológica é regra
`datesForWeekdays` percorre dia da semana por dia da semana e **reordena** por data + horário
antes de devolver.
**Por quê:** o rodízio distribui na ordem em que percorre `dates` (RN-2). Entregar "todos os
sábados, depois todos os domingos" geraria uma escala diferente e impossível de justificar
para a equipe.

### RN-10 — O título tem três níveis, resolvidos na montagem de `dates`
```
titleByDate[data] (sem espaços)  →  plan.title (sem espaços)  →  DEFAULT_SCHEDULE_TITLE
```
`autoGenerateSchedules` **não** recebe mais um título de lote: cada escala usa o título que
veio na sua data, já resolvido por `datesForWeekdays` — não no laço do rodízio.
**Por quê:** são três perguntas diferentes. Quinta e sábado não são o mesmo culto (nível do
dia da semana), e o evento de sábado costuma ter nome por edição — "Culto jovem — Verão" é
daquele sábado, não de todos (nível da data). O padrão existe para que nenhuma escala seja
gravada sem título.
**Consequências que você precisa conhecer:** o nome por data é **opcional** e não tem botão de
restaurar — apagar o campo já é o restaurar, e o `placeholder` mostra o que será herdado. Por
isso o valor em branco **não** é guardado em `titleByDate`: se fosse, "nome próprio vazio"
viraria um estado indistinguível de "sem nome próprio". E a prévia mostra o título de cada
escala (RF-GER-024); sem isso o admin não tem como conferir o que vai ser gravado.

## Algoritmo

```
entrada: volunteers[], existing[], unavailability[], dates[]
         # cada item de dates[] traz data, horário, funções e título
         # dates[] já vem sem as datas desmarcadas e com o horário próprio de cada uma

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

**CA-9** (RF-GER-017, RF-GER-018, RF-GER-019, RN-8)
- **Dado** sábado marcado às 18:00 e os sábados 01/08, 08/08, 15/08 e 22/08 no período
- **Quando** desmarcar 08/08 e pôr 19:30 em 15/08
- **Então** são geradas 3 escalas — 01/08 e 22/08 às 18:00 e 15/08 às 19:30 — e nenhuma em
  08/08
- **E quando** trocar o horário padrão do sábado para 17:00
- **Então** 01/08 e 22/08 passam a 17:00 e 15/08 continua às 19:30, até que se restaure o
  padrão dela

**CA-10** (RF-GER-022, RF-GER-023, RF-GER-024)
- **Dado** sábado com título "Culto jovem", domingo com "Culto" e quinta com o título em branco
- **Quando** gerar as duas semanas seguintes
- **Então** cada escala é gravada com o título do seu dia, as de quinta com "Culto", e a prévia
  mostra o título de cada uma

**CA-11** (RF-GER-025, RF-GER-026)
- **Dado** domingo marcado num período de 8 semanas
- **Quando** o card abrir
- **Então** "Datas no período" está recolhido, mostrando "8 datas"
- **E quando** desmarcar 16/08 e pôr horário próprio em 23/08
- **Então** o resumo passa a "7 de 8" e "1 com horário próprio", e continua visível depois de
  recolher a lista

## Interface

O diálogo tem três níveis, do mais geral para o mais específico:

| Nível | Onde | O que define |
|---|---|---|
| Lote | topo do diálogo | data inicial e número de semanas |
| Dia da semana | card do dia | título padrão, horários e funções |
| Data | linha em "Datas no período" | gerar ou não, nome próprio, horários próprios |

O nível da data só **sobrescreve** o do dia da semana, nunca o contrário, e sempre de forma
opcional — por isso o card do dia continua sendo suficiente para quem só quer gerar o mês
inteiro sem exceção nenhuma. Funções são o único atributo que **não** desce para a data: a
data ajusta *quando* e *como se chama*, não *quem entra*.

**CA-12** (RF-GER-027, RF-GER-028, RN-10)
- **Dado** sábado com título "Culto jovem" e os sábados 01/08, 15/08 e 22/08 gerando
- **Quando** escrever "Culto jovem — Verão" apenas em 15/08
- **Então** 15/08 é gravado com "Culto jovem — Verão" e 01/08 e 22/08 com "Culto jovem"
- **E quando** apagar o nome de 15/08
- **Então** ele volta a "Culto jovem", sem precisar de botão de restaurar

## Contrato

`POST /api/schedules/bulk` 🛡️ —
[`../architecture/api-contract.md`](../architecture/api-contract.md).

> A rota valida cada item contra as escalas salvas **e** contra as já criadas no lote, mas
> **não é transacional**: um conflito no item 5 devolve 400 com 1–4 já persistidos.

## Fontes na implementação

| Camada | Arquivo | Símbolo |
|---|---|---|
| Algoritmo | [`client/src/lib/escalas.ts`](../../client/src/lib/escalas.ts) | `autoGenerateSchedules`, `datesForWeekdays`, `datesInPeriod`, `defaultPlanForWeekday`, `defaultSlotsForWeekday`, `makeScheduleSlot`, `rosterOfPeriod`, `blockedNote` |
| Configuração | [`client/src/lib/escalas.ts`](../../client/src/lib/escalas.ts) | `WeekdayPlan`, `PlanByWeekday`, `ScheduleSlot`, `ScheduleDate`, `DEFAULT_SCHEDULE_TITLE` |
| Regra compartilhada | [`shared/schema.ts`](../../shared/schema.ts) | `SCHEDULE_ROLES` (ordem!), `periodOfTime`, `EVENT_PERIODS`, `trainingConflicts` |
| UI | [`client/src/components/escalas/AutoGenerateDialog.tsx`](../../client/src/components/escalas/AutoGenerateDialog.tsx) | `AutoGenerateDialog`, `WeekdayCard`, `WeekdayDateRow`, `MAIN_WEEKDAY_OPTIONS`, `OTHER_WEEKDAY_OPTIONS` |
| API | [`server/routes.ts`](../../server/routes.ts) | `POST /api/schedules/bulk`, `trainingIssue` |

Dias de culto: domingo, quinta e sábado ficam visíveis; segunda, terça, quarta e sexta ficam
atrás de "Outros dias" — raramente usados, mas disponíveis para eventos ocasionais. A lista de
datas aparece em **todos** eles, inclusive domingo e quinta: feriado ou evento da igreja também
cancela um domingo.

## Dívidas e lacunas

- O servidor não revalida rodízio, indisponibilidade nem duplicidade (RN-1).
- `bulk` não é transacional.
- A carga considera **todas** as escalas existentes, sem janela temporal: alguém com muitas
  escalas em 2025 continua "pesado" em 2026. Na prática, a base é nova e isso não aparece —
  mas é um comportamento a conhecer.
- Não há como fixar manualmente alguém numa data antes de gerar ("pin").

Ver [`../backlog.md`](../backlog.md).
