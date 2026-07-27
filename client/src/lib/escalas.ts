import { Camera, Clapperboard, MonitorPlay, Radio, type LucideIcon } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  SCHEDULE_ROLES,
  type InsertSchedule,
  type SafeUser,
  type Schedule,
  type ScheduleAssignment,
  type ScheduleRole,
  type Unavailability,
} from "@shared/schema";

export const ROLE_ICONS: Record<ScheduleRole, LucideIcon> = {
  fotografia: Camera,
  filmmaker: Clapperboard,
  projecao: MonitorPlay,
  transmissao: Radio,
};

export const ROLE_BADGE_CLASSES: Record<ScheduleRole, string> = {
  fotografia: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  filmmaker: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  projecao: "bg-green-500/10 text-green-500 border-green-500/20",
  transmissao: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

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

// A date to generate, with the functions that should be filled on it
export interface ScheduleDate {
  date: string;
  roles: ScheduleRole[];
  time: string;
}

// One service inside a weekday: its time and the functions to be filled.
// A weekday can hold more than one — domingo tem culto de manhã e à noite.
export interface ScheduleSlot {
  id: string; // stable key for the UI; not persisted
  time: string;
  roles: ScheduleRole[];
}

// Services selected per weekday (0=domingo ... 6=sábado). A weekday absent, or
// whose slots have no roles, is not generated.
export type SlotsByWeekday = Record<number, ScheduleSlot[]>;

export const DEFAULT_SCHEDULE_TIME = "18:00";
export const DEFAULT_MORNING_TIME = "09:00";

let slotSeq = 0;

export function makeScheduleSlot(
  time: string = DEFAULT_SCHEDULE_TIME,
  roles: ScheduleRole[] = [...SCHEDULE_ROLES],
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

// All dates matching the selected weekdays within `weeks` weeks starting from
// `start`, one entry per service of that weekday (earliest time first)
export function datesForWeekdays(
  start: Date,
  weeks: number,
  slotsByWeekday: SlotsByWeekday,
): ScheduleDate[] {
  const dates: ScheduleDate[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const slots = slotsByWeekday[d.getDay()];
    if (!slots) continue;
    const date = format(d, "yyyy-MM-dd");
    slots
      .filter((slot) => slot.roles.length > 0)
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((slot) => {
        dates.push({ date, roles: slot.roles, time: slot.time || DEFAULT_SCHEDULE_TIME });
      });
  }
  return dates;
}

export interface AutoGenerateResult {
  generated: InsertSchedule[];
  // events skipped because that date/time already has a schedule
  skipped: { date: string; time: string }[];
}

// Distributes volunteers (registered users with roles) across dates by rotation:
// for each role requested on that date, picks the eligible volunteer with the
// fewest assignments (counting existing schedules + already generated ones),
// skipping volunteers who registered unavailability for that date and avoiding
// assigning the same person twice in the same event when possible.
export function autoGenerateSchedules(opts: {
  volunteers: SafeUser[];
  existing: Schedule[];
  unavailability: Unavailability[];
  dates: ScheduleDate[];
  title: string;
}): AutoGenerateResult {
  const { volunteers, existing, unavailability, dates, title } = opts;

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

  const unavailableOn = new Set(unavailability.map((u) => `${u.userId}:${u.date}`));
  // Two services on the same day are different escalas, so the horário is part
  // of the key — só é duplicata quando data e horário coincidem.
  const scheduledSlots = new Set(existing.map((s) => `${s.eventDate} ${s.eventTime}`));
  const generated: InsertSchedule[] = [];
  const skipped: AutoGenerateResult["skipped"] = [];

  for (const { date, roles, time } of dates) {
    if (scheduledSlots.has(`${date} ${time}`)) {
      skipped.push({ date, time });
      continue;
    }
    scheduledSlots.add(`${date} ${time}`);

    const assignments: ScheduleAssignment[] = [];
    const usedInEvent = new Set<number>();

    for (const role of SCHEDULE_ROLES.filter((r) => roles.includes(r))) {
      const eligible = eligibleVolunteers
        .filter((v) => v.roles.includes(role) && !unavailableOn.has(`${v.id}:${date}`))
        .sort((a, b) => {
          const diff = (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0);
          return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
        });
      if (eligible.length === 0) continue;

      const pick = eligible.find((v) => !usedInEvent.has(v.id)) ?? eligible[0];
      assignments.push({ role, volunteerId: pick.id, volunteerName: pick.displayName });
      load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
      usedInEvent.add(pick.id);
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
