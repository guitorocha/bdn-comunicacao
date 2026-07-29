# Visão de Produto

## O problema

O ministério de comunicação da Igreja Bola de Neve Nação (Itaquera, São Paulo) atende dois
fluxos que, antes deste sistema, viviam em grupos de WhatsApp:

1. **Pedidos de divulgação.** Qualquer ministério da igreja (Louvor, Teens, Casais, Cura…)
   precisa de arte, aviso e post para um evento. Os pedidos chegavam soltos, sem prazo, sem
   rastreio, e frequentemente duplicados — dois líderes do mesmo ministério pedindo a mesma
   coisa, ou dois eventos concorrentes na mesma data.
2. **Escalas dos voluntários.** Fotografia, filmmaker, projeção e transmissão precisam de
   gente escalada em cada culto. Montar isso à mão erra: escala a mesma pessoa quatro
   domingos seguidos, esquece que fulano avisou que viaja, e não tem lugar para quem está
   aprendendo a função.

## O que o sistema faz

| Área | Entrega |
|---|---|
| **Solicitações** | Formulário público de pedido de divulgação, com número de protocolo, detecção de conflito (mesmo ministério, mesma data), painel interno com status, subtarefas e comentários, e página pública de acompanhamento por protocolo. |
| **Escalas** | Cadastro de funções por voluntário, registro de indisponibilidade por período do dia, criação manual de escalas, **geração automática por rodízio**, aviso de sobrecarga mensal e vaga de treinamento com regra de exclusividade. |
| **Contas** | Login, política de senha, troca obrigatória de senha provisória, bloqueio por tentativas, reset por admin, perfil do membro e trilha de auditoria. |

## O que o sistema deliberadamente **não** faz

Registrado para evitar que alguém "complete" a funcionalidade sem contexto:

- **Não envia e-mail nem notificação push.** O aviso continua sendo pelo WhatsApp do time.
- **Não faz upload de arquivo** (arte, foto, vídeo). Não há S3 de mídia nem quota.
- **Não tem autocadastro.** Contas são criadas por administradores — a equipe é fechada.
- **Não tem recuperação de senha por e-mail.** Quem esquece pede reset a um admin.
- **Não faz relatório nem exportação.** Não há BI, CSV ou PDF.
- **Não tem multi-igreja / multi-tenant.** Uma instância, uma igreja.

## Atores

| Ator | Autenticado? | Pode |
|---|---|---|
| **Solicitante** (qualquer ministério, qualquer pessoa) | Não | Criar solicitação de divulgação; acompanhar uma solicitação pelo número de protocolo |
| **Membro da comunicação** (usuário comum) | Sim | Ver o painel de solicitações, mudar status, criar subtarefas e comentários, ver as escalas, registrar a própria indisponibilidade, editar o próprio perfil e senha |
| **Voluntário** | Sim | É um membro que possui ao menos uma função (`roles`) — só ele entra em escalas |
| **Administrador** (`isAdmin`) | Sim | Tudo do membro, mais: criar/remover usuários, conceder/revogar admin, resetar senha, desbloquear conta, definir funções da equipe, criar/editar/apagar escalas, gerar escalas automaticamente, ler a auditoria |
| **Conta raiz** (`admin`) | Sim | Administrador com proteções extras: não pode ser removida, não pode perder o admin, e só ela redefine a própria senha |

> Ser voluntário e ser admin são **independentes**. Um admin sem `roles` não aparece nas
> escalas; um voluntário sem `isAdmin` não monta escala.

## Glossário

Termos do domínio, em português, como aparecem no código e na interface.

| Termo | Significado | No código |
|---|---|---|
| **Solicitação** | Pedido de divulgação feito por um ministério | `requests` |
| **Protocolo** | Número da solicitação, usado no acompanhamento público | `request.id` |
| **Subtarefa** | Item de checklist dentro de uma solicitação | `subtasks` |
| **Escala** | Um culto/evento com as pessoas designadas a cada função | `schedules` |
| **Escalação / atribuição** | Um par (função, voluntário) dentro de uma escala | `ScheduleAssignment` |
| **Função** | Fotografia, Filmmaker, Projeção, Transmissão ao Vivo, Em treinamento | `ScheduleRole` |
| **Função operacional** | As quatro funções que de fato cobrem o culto (todas menos treinamento) | `OPERATIONAL_ROLES` |
| **Treinamento** | Vaga de quem acompanha a equipe para aprender uma função | `TRAINING_ROLE` |
| **Voluntário** | Usuário com ao menos uma função | `user.roles.length > 0` |
| **Indisponibilidade** | Dia (ou período do dia) em que o voluntário não pode servir | `unavailability` |
| **Período** | Manhã (< 12h), tarde (12–18h), noite (≥ 18h) — e "dia inteiro", só do lado da indisponibilidade | `UnavailabilityPeriod`, `periodOfTime` |
| **Sobrecarga** | Voluntário com 4 ou mais escalas no mesmo mês | `OVERLOAD_THRESHOLD` |
| **Senha provisória** | Senha definida por um admin; o dono precisa trocá-la no primeiro acesso | `mustChangePassword` |
| **Conta bloqueada** | Trancada após 8 senhas erradas seguidas; só admin destrava | `lockedAt` |
| **Ministério** | Área da igreja que solicita divulgação | `MINISTRIES` |
| **Célula** | Pequeno grupo do qual o membro participa | `cellName`, `cellLeaders` |

## Jornadas principais

### J1 — Um ministério pede divulgação

```
Líder do Louvor abre /#/solicitacoes (sem login)
  → preenche: nome, ministério, tipo de evento, nome, data, horário, descrição, tipo de divulgação
  → sistema verifica conflito (mesmo ministério + mesma data, não cancelada)
      ├── conflito: mostra o evento existente e não cria
      └── sem conflito: cria com status "pendente" e devolve o protocolo (#1234)
  → líder guarda o protocolo
Depois: líder abre /#/acompanhar, digita o protocolo, vê status, subtarefas e comentários
```
Spec: [001](../specs/001-solicitacoes-de-divulgacao.md) e [002](../specs/002-acompanhamento-publico.md).

### J2 — A equipe toca a solicitação

```
Membro loga → /#/solicitacoes/painel
  → filtra por status, seleciona a solicitação
  → move o status: pendente → em_andamento → concluida (ou cancelada)
  → quebra o trabalho em subtarefas e marca conforme conclui
  → comenta o andamento (o autor vem da sessão, não do formulário)
```
Spec: [001](../specs/001-solicitacoes-de-divulgacao.md).

### J3 — O admin monta as escalas do mês

```
Admin → /#/escalas → aba "Administração"
  → confere as funções de cada pessoa no painel "Funções da equipe"
  → "Gerar automaticamente": data inicial, nº de semanas, dias da semana e horários
  → o rodízio distribui por menor carga, pulando indisponíveis e respeitando o treinamento
  → revisa a prévia (inclusive as datas puladas por já terem escala) e confirma
  → ajusta pontualmente no formulário manual, onde vê avisos de indisponibilidade e sobrecarga
```
Specs: [005](../specs/005-escalas-de-voluntarios.md) e [006](../specs/006-geracao-automatica-de-escalas.md).

### J4 — O voluntário avisa que não pode

```
Voluntário loga → /#/escalas → aba "Voluntário"
  → vê "Minhas próximas escalas"
  → em "Minha disponibilidade", registra a data e o período em que NÃO pode servir
  → a geração automática deixa de escalá-lo naqueles períodos
```
Spec: [005](../specs/005-escalas-de-voluntarios.md).

### J5 — Um novo membro entra na equipe

```
Admin → /#/equipes → "Novo Usuário" (usuário, nome, senha ≥ 10 caracteres, admin sim/não)
  → conta nasce com mustChangePassword = true
Membro loga pela primeira vez
  → é levado a /#/usuarios e fica preso lá até trocar a senha
  → troca a senha (as sessões antigas caem), completa o perfil
Admin → /#/escalas → marca as funções do novo membro → ele passa a entrar nos rodízios
```
Specs: [003](../specs/003-autenticacao-e-contas.md) e [004](../specs/004-perfil-do-membro.md).

## Métricas de sucesso (qualitativas)

Não há instrumentação no sistema; estes são os sinais que o time observa:

- Nenhum pedido de divulgação "perdido" — todo pedido tem protocolo e status.
- Nenhum voluntário escalado num dia em que já havia avisado indisponibilidade.
- Distribuição percebida como justa: ninguém com 4+ escalas num mês sem que o admin
  tenha visto o aviso e decidido conscientemente.
- Montar a escala do mês leva minutos, não uma tarde.
