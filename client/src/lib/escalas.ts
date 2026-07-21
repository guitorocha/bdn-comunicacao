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

// A date to generate, with the functions that should be filled on it
export interface ScheduleDate {
  date: string;
  roles: ScheduleRole[];
  time: string;
}

// Roles selected per weekday (0=domingo ... 6=sábado). A weekday absent or
// with an empty list is not generated.
export type RolesByWeekday = Record<number, ScheduleRole[]>;

// Event time chosen per weekday (0=domingo ... 6=sábado)
export type TimeByWeekday = Record<number, string>;

export const DEFAULT_SCHEDULE_TIME = "18:00";

// All dates matching the selected weekdays within `weeks` weeks starting from
// `start`, each carrying the roles and time chosen for that weekday
export function datesForWeekdays(
  start: Date,
  weeks: number,
  rolesByWeekday: RolesByWeekday,
  timeByWeekday: TimeByWeekday,
): ScheduleDate[] {
  const dates: ScheduleDate[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const weekday = d.getDay();
    const roles = rolesByWeekday[weekday];
    if (roles && roles.length > 0) {
      dates.push({
        date: format(d, "yyyy-MM-dd"),
        roles,
        time: timeByWeekday[weekday] || DEFAULT_SCHEDULE_TIME,
      });
    }
  }
  return dates;
}

export interface AutoGenerateResult {
  generated: InsertSchedule[];
  skippedDates: string[]; // dates that already have a schedule
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
  const scheduledDates = new Set(existing.map((s) => s.eventDate));
  const generated: InsertSchedule[] = [];
  const skippedDates: string[] = [];

  for (const { date, roles, time } of dates) {
    if (scheduledDates.has(date)) {
      skippedDates.push(date);
      continue;
    }

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

  return { generated, skippedDates };
}
