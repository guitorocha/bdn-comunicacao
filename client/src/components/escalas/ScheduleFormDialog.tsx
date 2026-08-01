import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import {
  isTrainingRole, SCHEDULE_ROLES, SCHEDULE_ROLE_LABELS, trainingConflictMessage, trainingConflicts,
  type InsertSchedule, type SafeUser, type Schedule, type ScheduleAssignment,
  type ScheduleRole, type Unavailability, type UnavailabilityPeriod,
} from "@shared/schema";
import {
  blockedNote, blocksPeriod, incrementMonthlyLoad, monthlyLoadByVolunteer, monthlyLoadOf,
  OVERLOAD_THRESHOLD, periodOfTime, ROLE_ICONS, rosterOfPeriod, scheduleMonth, UNAVAILABLE_NOTE,
  type PeriodRoster,
} from "@/lib/escalas";
import { OverloadWarning } from "@/components/escalas/OverloadWarning";

const NONE = "none";

// Uma entrada por função, todas vazias — deriva de SCHEDULE_ROLES para não
// esquecer nenhuma quando a lista de funções mudar
const emptySelections = (): Record<ScheduleRole, string> =>
  Object.fromEntries(SCHEDULE_ROLES.map((role) => [role, NONE])) as Record<ScheduleRole, string>;

interface ScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volunteers: SafeUser[]; // registered users; only those with roles are selectable
  unavailability: Unavailability[];
  schedules: Schedule[]; // todas as escalas salvas, para contar a carga do mês
  schedule?: Schedule | null; // when set, edits instead of creating
}

export function ScheduleFormDialog({ open, onOpenChange, volunteers, unavailability, schedules, schedule }: ScheduleFormDialogProps) {
  const { toast } = useToast();
  const isEditing = !!schedule;

  const [title, setTitle] = useState("Culto");
  const [eventType, setEventType] = useState<"culto" | "especial">("culto");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("18:00");
  const [notes, setNotes] = useState("");
  const [roleSelections, setRoleSelections] = useState<Record<ScheduleRole, string>>(emptySelections);

  useEffect(() => {
    if (!open) return;
    if (schedule) {
      setTitle(schedule.title);
      setEventType(schedule.eventType === "especial" ? "especial" : "culto");
      setEventDate(schedule.eventDate);
      setEventTime(schedule.eventTime);
      setNotes(schedule.notes ?? "");
      const selections = emptySelections();
      schedule.assignments.forEach((a) => {
        selections[a.role] = String(a.volunteerId);
      });
      setRoleSelections(selections);
    } else {
      setTitle("Culto");
      setEventType("culto");
      setEventDate("");
      setEventTime("18:00");
      setNotes("");
      setRoleSelections(emptySelections());
    }
  }, [open, schedule]);

  const mutation = useMutation({
    mutationFn: async (data: InsertSchedule) => {
      const res = isEditing
        ? await apiRequest("PUT", `/api/schedules/${schedule!.id}`, data)
        : await apiRequest("POST", "/api/schedules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: isEditing ? "Escala atualizada" : "Escala criada" });
      onOpenChange(false);
    },
    // A API tem a palavra final sobre o conflito de treinamento; a mensagem dela
    // é mais útil que um "não foi possível salvar" genérico
    onError: (err: Error) => {
      toast({
        title: "Erro",
        description: err.message || "Não foi possível salvar a escala.",
        variant: "destructive",
      });
    },
  });

  // O período vem do horário do evento, então o aviso reavalia quando o admin
  // troca o horário: quem só bloqueou a manhã continua livre no culto da noite
  const eventPeriod = eventTime ? periodOfTime(eventTime) : null;

  const unavailableAs = (userId: number): UnavailabilityPeriod | null => {
    if (!eventDate || !eventPeriod) return null;
    const entry = unavailability.find(
      (u) => u.userId === userId && u.date === eventDate && blocksPeriod(u.period, eventPeriod)
    );
    return entry?.period ?? null;
  };

  const formMonth = eventDate ? scheduleMonth(eventDate) : null;

  // Carga do mês da data escolhida já contando as seleções deste formulário: a
  // escala em edição sai da conta das salvas e volta como está na tela agora
  const monthlyLoad = useMemo(() => {
    const load = monthlyLoadByVolunteer(schedules.filter((s) => s.id !== schedule?.id));
    if (formMonth) {
      const selected = new Set(
        Object.values(roleSelections).filter((v) => v !== NONE).map(Number)
      );
      selected.forEach((id) => incrementMonthlyLoad(load, id, formMonth));
    }
    return load;
  }, [schedules, schedule?.id, formMonth, roleSelections]);

  const overloadCount = (userId: number) =>
    formMonth ? monthlyLoadOf(monthlyLoad, userId, formMonth) : 0;

  const assignments = useMemo<ScheduleAssignment[]>(() => {
    const list: ScheduleAssignment[] = [];
    for (const role of SCHEDULE_ROLES) {
      const value = roleSelections[role];
      if (value === NONE) continue;
      const volunteer = volunteers.find((v) => v.id === Number(value));
      if (volunteer) {
        list.push({ role, volunteerId: volunteer.id, volunteerName: volunteer.displayName });
      }
    }
    return list;
  }, [roleSelections, volunteers]);

  // Treinamento e função de culto se excluem dentro do período — outra escala do
  // mesmo dia em outro período não conta. O balanço junta as escalas daquele
  // período com o que está selecionado aqui; como a seleção da própria função
  // entra no conjunto dela, ninguém aparece bloqueado para a vaga que já ocupa.
  const periodRoster = useMemo<PeriodRoster>(() => {
    const roster: PeriodRoster = eventDate && eventPeriod
      ? rosterOfPeriod(schedules, eventDate, eventPeriod, schedule?.id)
      : { training: new Set(), working: new Set() };
    assignments.forEach((a) => {
      (isTrainingRole(a.role) ? roster.training : roster.working).add(a.volunteerId);
    });
    return roster;
  }, [schedules, schedule?.id, eventDate, eventPeriod, assignments]);

  // As opções proibidas ficam desabilitadas, mas trocar a data ou o horário
  // depois de escolher pode criar o conflito — daí o aviso (e a trava no salvar)
  const conflictMessage = useMemo(() => {
    if (!eventDate || !eventTime) return null;
    const sameDay = schedules.filter((s) => s.eventDate === eventDate && s.id !== schedule?.id);
    return trainingConflictMessage(trainingConflicts([...sameDay, { eventTime, assignments }]));
  }, [schedules, schedule?.id, eventDate, eventTime, assignments]);

  const handleSubmit = () => {
    if (!title.trim() || !eventDate || !eventTime) {
      toast({ title: "Campos obrigatórios", description: "Preencha título, data e horário.", variant: "destructive" });
      return;
    }
    if (conflictMessage) {
      toast({ title: "Conflito de treinamento", description: conflictMessage, variant: "destructive" });
      return;
    }
    mutation.mutate({
      title: title.trim(),
      eventType,
      eventDate,
      eventTime,
      notes: notes.trim() || null,
      assignments,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar escala" : "Nova escala"}</DialogTitle>
          <DialogDescription>
            Defina o evento e os voluntários de cada função. Quem entra em
            “Em treinamento” acompanha a equipe para aprender e, por isso, não assume
            nenhuma outra função neste período — mas segue livre nos outros
            períodos do dia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-title">Título</Label>
              <Input
                id="schedule-title"
                placeholder="Ex: Culto de Domingo"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-schedule-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as "culto" | "especial")}>
                <SelectTrigger data-testid="select-schedule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="culto">Culto</SelectItem>
                  <SelectItem value="especial">Evento especial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-date">Data</Label>
              <Input
                id="schedule-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                data-testid="input-schedule-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-time">Horário</Label>
              <Input
                id="schedule-time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                data-testid="input-schedule-time"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Voluntários por função</Label>
            {SCHEDULE_ROLES.map((role) => {
              const Icon = ROLE_ICONS[role];
              const eligible = volunteers.filter((v) => v.roles.includes(role));
              const selectedId = roleSelections[role] === NONE ? null : Number(roleSelections[role]);
              const selectedCount = selectedId ? overloadCount(selectedId) : 0;
              return (
                <div key={role} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 shrink-0 text-sm">
                    <Icon className="w-4 h-4 text-primary" />
                    <span>{SCHEDULE_ROLE_LABELS[role]}</span>
                  </div>
                  <Select
                    value={roleSelections[role]}
                    onValueChange={(v) => setRoleSelections((prev) => ({ ...prev, [role]: v }))}
                  >
                    <SelectTrigger data-testid={`select-role-${role}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Sem voluntário —</SelectItem>
                      {eligible.map((v) => {
                        // O aviso do trigger fica fora do Select; aqui vai como texto,
                        // porque o conteúdo do item é reaproveitado no próprio trigger
                        const count = overloadCount(v.id);
                        const unavailablePeriod = unavailableAs(v.id);
                        // Treinamento e função de culto no mesmo período não se
                        // juntam: a opção aparece, mas travada e com o motivo à mostra
                        const blocked = blockedNote(role, v.id, periodRoster);
                        const notes = [
                          blocked,
                          unavailablePeriod ? UNAVAILABLE_NOTE[unavailablePeriod] : null,
                          count >= OVERLOAD_THRESHOLD ? `${count} escalas neste mês` : null,
                        ].filter(Boolean);
                        return (
                          <SelectItem key={v.id} value={String(v.id)} disabled={!!blocked}>
                            {v.displayName}{notes.length > 0 ? ` (${notes.join(", ")})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedId && selectedCount >= OVERLOAD_THRESHOLD && formMonth && (
                    <OverloadWarning
                      months={[{ month: formMonth, count: selectedCount }]}
                      testId={`warning-overload-role-${role}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {conflictMessage && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              data-testid="warning-training-conflict"
            >
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">{conflictMessage}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="schedule-notes">Observações (opcional)</Label>
            <Textarea
              id="schedule-notes"
              placeholder="Ex: chegar 1h antes para passagem de som..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
              data-testid="input-schedule-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || !!conflictMessage}
            data-testid="button-save-schedule"
          >
            {mutation.isPending ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar escala"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
