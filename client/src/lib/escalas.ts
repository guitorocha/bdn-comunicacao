import { Camera, Clapperboard, GraduationCap, MonitorPlay, Radio, type LucideIcon } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  EVENT_PERIODS,
  isTrainingRole,
  mensagemLembrete,
  normalizePhoneBR,
  OPERATIONAL_ROLES,
  periodOfTime,
  SCHEDULE_ROLES,
  type InsertSchedule,
  type SafeUser,
  type Schedule,
  type ScheduleAssignment,
  type ScheduleRole,
  type TeamUser,
  type Unavailability,
  type UnavailabilityPeriod,
} from "@shared/schema";

export const ROLE_ICONS: Record<ScheduleRole, LucideIcon> = {
  fotografia: Camera,
  filmmaker: Clapperboard,
  projecao: MonitorPlay,
  transmissao: Radio,
  treinamento: GraduationCap,
};

// O treinamento sai em traço pontilhado, de propósito: quem está ali não é o
// responsável pelo posto, está aprendendo ao lado de quem já sabe.
export const ROLE_BADGE_CLASSES: Record<ScheduleRole, string> = {
  fotografia: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  filmmaker: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  projecao: "bg-green-500/10 text-green-500 border-green-500/20",
  transmissao: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  treinamento: "bg-muted text-muted-foreground border-dashed border-muted-foreground/40",
};

// ── Cobrança manual pelo WhatsApp ──
// Saída para quem não ativou as notificações — em especial o iPhone, onde o
// push exige instalar o app na tela de início. Não é integração: é o link
// wa.me de sempre, aberto pelo admin, com o texto do lembrete já escrito. Usa a
// mesma `mensagemLembrete` do envio automático para os dois não divergirem.
export function whatsappLembreteUrl(user: TeamUser, schedule: Schedule): string | null {
  const phone = normalizePhoneBR(user.phone);
  if (!phone) return null;

  const roles = schedule.assignments.filter((a) => a.volunteerId === user.id).map((a) => a.role);
  if (roles.length === 0) return null;

  // "semana" e não "dia": a mensagem sai com a data por extenso, que é o que
  // faz sentido quando o admin cobra alguém dias antes.
  const { titulo, corpo } = mensagemLembrete("semana", user.displayName, [
    {
      eventDate: schedule.eventDate,
      eventTime: schedule.eventTime,
      title: schedule.title,
      roles,
    },
  ]);
  return `https://wa.me/${phone}?text=${encodeURIComponent(`${titulo}\n${corpo}`)}`;
}

export function formatScheduleDate(dateStr: string): string {
  try {
    const formatted = format(parseISO(dateStr), "EEEE, dd 'de' MMMM", { locale: ptBR });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return dateStr;
  }
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

// "2026-07-19" → "2026-07"
export function scheduleMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// "2026-07" → "julho de 2026"
export function formatMonthLabel(month: string): string {
  try {
    return format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return month;
  }
}

// ── Períodos do dia ─────────────────────────────────────────────────────────
// `periodOfTime` mora no shared: o servidor também precisa dele para conferir a
// regra do treinamento.
export { periodOfTime } from "@shared/schema";

// "dia" bloqueia qualquer culto; os demais, só o período correspondente
export function blocksPeriod(entry: UnavailabilityPeriod, event: UnavailabilityPeriod): boolean {
  return entry === "dia" || entry === event;
}

// Aviso mostrado ao admin ao escolher um voluntário indisponível
export const UNAVAILABLE_NOTE: Record<UnavailabilityPeriod, string> = {
  manha: "indisponível de manhã",
  tarde: "indisponível à tarde",
  noite: "indisponível à noite",
  dia: "indisponível neste dia",
};

// ── Treinamento ─────────────────────────────────────────────────────────────

// Quem já está escalado num período, separado entre o treinamento e as demais
// funções. Serve para o formulário barrar a escolha proibida na hora, em vez de
// deixar o admin salvar e receber o erro da API.
export interface PeriodRoster {
  training: Set<number>;
  working: Set<number>;
}

// Escalações de um período de um dia. Domingo de manhã e domingo à noite têm
// balanços separados — treinar num não tira a pessoa do outro.
// `ignoreScheduleId` tira a escala em edição: o que vale nela é o que está na
// tela agora, não o que está salvo.
export function rosterOfPeriod(
  schedules: Schedule[],
  date: string,
  period: UnavailabilityPeriod,
  ignoreScheduleId?: number,
): PeriodRoster {
  const roster: PeriodRoster = { training: new Set(), working: new Set() };
  for (const schedule of schedules) {
    if (schedule.eventDate !== date || schedule.id === ignoreScheduleId) continue;
    if (periodOfTime(schedule.eventTime) !== period) continue;
    for (const assignment of schedule.assignments) {
      const target = isTrainingRole(assignment.role) ? roster.training : roster.working;
      target.add(assignment.volunteerId);
    }
  }
  return roster;
}

// Por que aquele voluntário não pode ser escolhido nesta função, se for o caso
export const TRAINING_BLOCK_NOTE = "já escalado em outra função neste período";
export const WORKING_BLOCK_NOTE = "em treinamento neste período";

export function blockedNote(role: ScheduleRole, volunteerId: number, roster: PeriodRoster): string | null {
  if (isTrainingRole(role)) {
    return roster.working.has(volunteerId) ? TRAINING_BLOCK_NOTE : null;
  }
  return roster.training.has(volunteerId) ? WORKING_BLOCK_NOTE : null;
}

// ── Sobrecarga de voluntários ───────────────────────────────────────────────

// A partir de quantas escalas no mesmo mês o admin é avisado
export const OVERLOAD_THRESHOLD = 4;
export const OVERLOAD_WARNING = "Essa pessoa pode estar sobrecarregada com as escalas";

// Escalas por voluntário em cada mês, indexadas por `${volunteerId}:${YYYY-MM}`
export type MonthlyLoad = Map<string, number>;

// Um evento com duas funções para a mesma pessoa conta como uma escala só
export function monthlyLoadByVolunteer(schedules: Schedule[]): MonthlyLoad {
  const load: MonthlyLoad = new Map();
  for (const schedule of schedules) {
    const month = scheduleMonth(schedule.eventDate);
    const counted = new Set<number>();
    for (const assignment of schedule.assignments) {
      if (counted.has(assignment.volunteerId)) continue;
      counted.add(assignment.volunteerId);
      incrementMonthlyLoad(load, assignment.volunteerId, month);
    }
  }
  return load;
}

// Soma uma escala ainda não salva — usada enquanto o admin monta a escala
export function incrementMonthlyLoad(load: MonthlyLoad, volunteerId: number, month: string): void {
  const key = `${volunteerId}:${month}`;
  load.set(key, (load.get(key) ?? 0) + 1);
}

export function monthlyLoadOf(load: MonthlyLoad, volunteerId: number, month: string): number {
  return load.get(`${volunteerId}:${month}`) ?? 0;
}

export function isOverloaded(load: MonthlyLoad, volunteerId: number, month: string): boolean {
  return monthlyLoadOf(load, volunteerId, month) >= OVERLOAD_THRESHOLD;
}

// Meses sobrecarregados do voluntário, do mais próximo ao mais distante.
// Meses anteriores a `fromMonth` são ignorados — só o que ainda dá para ajustar.
export function overloadedMonths(
  load: MonthlyLoad,
  volunteerId: number,
  fromMonth: string,
): { month: string; count: number }[] {
  const months: { month: string; count: number }[] = [];
  load.forEach((count, key) => {
    const [id, month] = key.split(":");
    if (Number(id) !== volunteerId || month < fromMonth || count < OVERLOAD_THRESHOLD) return;
    months.push({ month, count });
  });
  return months.sort((a, b) => a.month.localeCompare(b.month));
}

// A date to generate, with the functions that should be filled on it. O título
// viaja junto porque é do dia da semana: quinta pode ser "Culto de oração" e
// sábado "Culto jovem" na mesma geração.
export interface ScheduleDate {
  date: string;
  roles: ScheduleRole[];
  time: string;
  title: string;
}

// One service inside a weekday: its time and the functions to be filled.
// A weekday can hold more than one — domingo tem culto de manhã e à noite.
export interface ScheduleSlot {
  id: string; // stable key for the UI; not persisted
  time: string;
  roles: ScheduleRole[];
}

// O que foi configurado para um dia da semana: os horários que valem para toda
// data dele, as datas do período que não terão culto e as datas com horários
// próprios. Nem todo sábado do mês tem evento, e nos que têm o horário pode
// mudar de semana para semana — o dia da semana é o molde, a data é o fato.
//
// As exceções moram dentro do dia da semana de propósito: desmarcar o dia apaga
// as dele junto, sem varredura por data.
export interface WeekdayPlan {
  // Título das escalas deste dia — cada dia tem o nome do seu culto
  title: string;
  slots: ScheduleSlot[];
  // Datas ISO que não geram escala. Não confundir com `AutoGenerateResult.skipped`,
  // que é data+horário pulado por já ter escala salva.
  excludedDates: string[];
  // Horários próprios de uma data, no lugar de `slots`
  slotsByDate: Record<string, ScheduleSlot[]>;
  // Nome próprio de uma data, no lugar de `title`. O evento de sábado costuma ter
  // nome por edição ("Culto jovem — Verão"), e isso é da data, não do dia da semana.
  titleByDate: Record<string, string>;
}

// Services selected per weekday (0=domingo ... 6=sábado). A weekday absent, or
// whose slots have no roles, is not generated.
export type PlanByWeekday = Record<number, WeekdayPlan>;

export const DEFAULT_SCHEDULE_TIME = "18:00";
export const DEFAULT_MORNING_TIME = "10:00";
export const DEFAULT_SCHEDULE_TITLE = "Culto";

let slotSeq = 0;

// O treinamento fica de fora por padrão: é uma vaga ocasional, marcada à mão
// quando alguém vai acompanhar a equipe naquele culto.
export function makeScheduleSlot(
  time: string = DEFAULT_SCHEDULE_TIME,
  roles: ScheduleRole[] = [...OPERATIONAL_ROLES],
): ScheduleSlot {
  slotSeq += 1;
  return { id: `slot-${slotSeq}`, time, roles };
}

// Sunday has two services (manhã e noite); every other day starts with one
export function defaultSlotsForWeekday(weekday: number): ScheduleSlot[] {
  return weekday === 0
    ? [makeScheduleSlot(DEFAULT_MORNING_TIME), makeScheduleSlot(DEFAULT_SCHEDULE_TIME)]
    : [makeScheduleSlot()];
}

// Um dia da semana recém-marcado: título e horários padrão, nenhuma data
// excluída, nenhum horário próprio
export function defaultPlanForWeekday(weekday: number): WeekdayPlan {
  return {
    title: DEFAULT_SCHEDULE_TITLE,
    slots: defaultSlotsForWeekday(weekday),
    excludedDates: [],
    slotsByDate: {},
    titleByDate: {},
  };
}

// Datas do período que caem no dia da semana pedido, em ordem. A UI lista essas
// datas e a geração percorre as mesmas: a chave é sempre a string ISO local,
// então exclusão e horário próprio casam por construção.
export function datesInPeriod(start: Date, weeks: number, weekday: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    if (d.getDay() === weekday) dates.push(format(d, "yyyy-MM-dd"));
  }
  return dates;
}

// All dates matching the selected weekdays within `weeks` weeks starting from
// `start`, one entry per service of that date. Datas excluídas não chegam aqui,
// e uma data com horários próprios usa os dela em vez dos do dia da semana.
export function datesForWeekdays(
  start: Date,
  weeks: number,
  plans: PlanByWeekday,
): ScheduleDate[] {
  const dates: ScheduleDate[] = [];
  for (const [weekday, plan] of Object.entries(plans)) {
    const excluded = new Set(plan.excludedDates);
    const weekdayTitle = plan.title.trim() || DEFAULT_SCHEDULE_TITLE;
    for (const date of datesInPeriod(start, weeks, Number(weekday))) {
      if (excluded.has(date)) continue;
      // Nome próprio da data ganha do nome do dia da semana; em branco, herda
      const title = plan.titleByDate[date]?.trim() || weekdayTitle;
      (plan.slotsByDate[date] ?? plan.slots)
        .filter((slot) => slot.roles.length > 0)
        .forEach((slot) => {
          dates.push({ date, roles: slot.roles, time: slot.time || DEFAULT_SCHEDULE_TIME, title });
        });
    }
  }
  // Percorrer por dia da semana embaralhou o calendário, e a ordem cronológica é
  // regra: o rodízio distribui na ordem em que percorre as datas, então iterar
  // "todos os sábados, depois todos os domingos" daria uma escala diferente — e
  // impossível de justificar para a equipe.
  return dates.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export interface AutoGenerateResult {
  generated: InsertSchedule[];
  // events skipped because that date/time already has a schedule
  skipped: { date: string; time: string }[];
}

// Distributes volunteers (registered users with roles) across dates by rotation:
// for each role requested on that date, picks the eligible volunteer with the
// fewest assignments (counting existing schedules + already generated ones),
// skipping volunteers who registered unavailability for the period of that
// service (a "dia" entry blocks every service of the day, "manha"/"tarde"/
// "noite" only the matching one) and avoiding assigning the same person twice
// in the same event when possible. Quem cai no treinamento fica fora das demais
// funções daquele período, e vice-versa.
export function autoGenerateSchedules(opts: {
  volunteers: SafeUser[];
  existing: Schedule[];
  unavailability: Unavailability[];
  dates: ScheduleDate[];
}): AutoGenerateResult {
  const { volunteers, existing, unavailability, dates } = opts;

  const load = new Map<number, number>();
  const eligibleVolunteers = volunteers.filter((v) => v.roles.length > 0);
  eligibleVolunteers.forEach((v) => load.set(v.id, 0));
  existing.forEach((s) =>
    s.assignments.forEach((a) => {
      if (load.has(a.volunteerId)) {
        load.set(a.volunteerId, (load.get(a.volunteerId) ?? 0) + 1);
      }
    })
  );

  // Uma entrada de "dia inteiro" vira os três períodos; as demais, só o seu
  const unavailableOn = new Set(
    unavailability.flatMap((u) =>
      (u.period === "dia" ? EVENT_PERIODS : [u.period]).map((p) => `${u.userId}:${u.date}:${p}`)
    )
  );
  // Two services on the same day are different escalas, so the horário is part
  // of the key — só é duplicata quando data e horário coincidem.
  const scheduledSlots = new Set(existing.map((s) => `${s.eventDate} ${s.eventTime}`));
  const generated: InsertSchedule[] = [];
  const skipped: AutoGenerateResult["skipped"] = [];

  // Treinamento e função operacional se excluem dentro do período, então o
  // balanço é por data+período e já começa com o que estava salvo. O culto da
  // noite tem o seu próprio: treinar de manhã não tira ninguém dele.
  const rosterByPeriod = new Map<string, PeriodRoster>();
  const rosterOn = (date: string, period: UnavailabilityPeriod): PeriodRoster => {
    const key = `${date}:${period}`;
    let roster = rosterByPeriod.get(key);
    if (!roster) {
      roster = rosterOfPeriod(existing, date, period);
      rosterByPeriod.set(key, roster);
    }
    return roster;
  };

  for (const { date, roles, time, title } of dates) {
    if (scheduledSlots.has(`${date} ${time}`)) {
      skipped.push({ date, time });
      continue;
    }
    scheduledSlots.add(`${date} ${time}`);

    const eventPeriod = periodOfTime(time);
    const roster = rosterOn(date, eventPeriod);
    const assignments: ScheduleAssignment[] = [];
    const usedInEvent = new Set<number>();

    // O treinamento é preenchido por último (é o fim de SCHEDULE_ROLES), então
    // as funções do culto escolhem primeiro e sobra para o aprendiz quem não
    // está cobrindo posto nenhum naquele período.
    for (const role of SCHEDULE_ROLES.filter((r) => roles.includes(r))) {
      const eligible = eligibleVolunteers
        .filter((v) =>
          v.roles.includes(role) &&
          !unavailableOn.has(`${v.id}:${date}:${eventPeriod}`) &&
          !blockedNote(role, v.id, roster)
        )
        .sort((a, b) => {
          const diff = (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0);
          return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
        });
      if (eligible.length === 0) continue;

      const pick = eligible.find((v) => !usedInEvent.has(v.id)) ?? eligible[0];
      assignments.push({ role, volunteerId: pick.id, volunteerName: pick.displayName });
      load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
      usedInEvent.add(pick.id);
      (isTrainingRole(role) ? roster.training : roster.working).add(pick.id);
    }

    generated.push({
      title,
      eventType: "culto",
      eventDate: date,
      eventTime: time,
      notes: null,
      assignments,
    });
  }

  return { generated, skipped };
}
