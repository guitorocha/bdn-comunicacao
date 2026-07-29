import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, Pencil, Trash2 } from "lucide-react";
import { isTrainingRole, SCHEDULE_ROLES, SCHEDULE_ROLE_LABELS, type Schedule } from "@shared/schema";
import {
  formatScheduleDate, monthlyLoadOf, ROLE_BADGE_CLASSES, ROLE_ICONS,
  scheduleMonth, OVERLOAD_THRESHOLD, type MonthlyLoad,
} from "@/lib/escalas";
import { OverloadWarning } from "@/components/escalas/OverloadWarning";

interface ScheduleCardProps {
  schedule: Schedule;
  highlightVolunteerId?: number | null;
  // Só o admin recebe: marca quem já passou do limite de escalas neste mês
  monthlyLoad?: MonthlyLoad;
  onEdit?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
}

export function ScheduleCard({ schedule, highlightVolunteerId, monthlyLoad, onEdit, onDelete }: ScheduleCardProps) {
  const month = scheduleMonth(schedule.eventDate);

  return (
    <Card className="p-5 space-y-4" data-testid={`card-schedule-${schedule.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{formatScheduleDate(schedule.eventDate)}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{schedule.eventTime}</span>
            <span>·</span>
            <span className="font-medium text-foreground">{schedule.title}</span>
            <Badge variant="outline" className="text-xs">
              {schedule.eventType === "culto" ? "Culto" : "Evento especial"}
            </Badge>
          </div>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={() => onEdit(schedule)} data-testid={`button-edit-schedule-${schedule.id}`}>
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={() => onDelete(schedule)} data-testid={`button-delete-schedule-${schedule.id}`}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCHEDULE_ROLES.map((role) => {
          const assignment = schedule.assignments.find((a) => a.role === role);
          // As funções do culto aparecem sempre, mesmo vazias — é o que falta
          // preencher. O treinamento é vaga ocasional: sem aprendiz, nem aparece.
          if (!assignment && isTrainingRole(role)) return null;
          const Icon = ROLE_ICONS[role];
          const isMine = assignment && highlightVolunteerId != null && assignment.volunteerId === highlightVolunteerId;
          const monthCount = assignment && monthlyLoad
            ? monthlyLoadOf(monthlyLoad, assignment.volunteerId, month)
            : 0;
          return (
            <div
              key={role}
              className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                isMine ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <Badge className={`${ROLE_BADGE_CLASSES[role]} border text-xs shrink-0`}>
                <Icon className="w-3 h-3 mr-1" />
                {SCHEDULE_ROLE_LABELS[role]}
              </Badge>
              <span className={`text-sm truncate ${assignment ? "" : "text-muted-foreground"}`}>
                {assignment ? assignment.volunteerName : "—"}
              </span>
              {assignment && monthCount >= OVERLOAD_THRESHOLD && (
                <OverloadWarning
                  months={[{ month, count: monthCount }]}
                  testId={`warning-overload-schedule-${schedule.id}-${role}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {schedule.notes && (
        <p className="text-xs text-muted-foreground">{schedule.notes}</p>
      )}
    </Card>
  );
}
