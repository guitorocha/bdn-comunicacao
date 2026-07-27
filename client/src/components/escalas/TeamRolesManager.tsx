import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CalendarX2, UserPlus, Users } from "lucide-react";
import {
  SCHEDULE_ROLES, SCHEDULE_ROLE_LABELS,
  type SafeUser, type ScheduleRole, type Unavailability,
} from "@shared/schema";
import { currentMonth, overloadedMonths, todayISO, type MonthlyLoad } from "@/lib/escalas";
import { OverloadWarning } from "@/components/escalas/OverloadWarning";

interface TeamRolesManagerProps {
  users: SafeUser[];
  unavailability: Unavailability[];
  monthlyLoad: MonthlyLoad;
}

// Admin panel: assigns ministry functions to registered users.
// Users with at least one function become schedulable volunteers.
export function TeamRolesManager({ users, unavailability, monthlyLoad }: TeamRolesManagerProps) {
  const { toast } = useToast();
  const today = todayISO();
  const thisMonth = currentMonth();

  const rolesMutation = useMutation({
    mutationFn: async ({ id, roles }: { id: number; roles: ScheduleRole[] }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/roles`, { roles });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível atualizar as funções.", variant: "destructive" });
    },
  });

  const toggleRole = (user: SafeUser, role: ScheduleRole) => {
    const roles = user.roles.includes(role)
      ? user.roles.filter((r) => r !== role)
      : [...user.roles, role];
    rolesMutation.mutate({ id: user.id, roles });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Funções da equipe
        </h3>
        <Link href="/equipes">
          <Button variant="ghost" size="sm" data-testid="link-manage-users">
            <UserPlus className="w-4 h-4 mr-1" /> Usuários
          </Button>
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Marque as funções que cada membro pode exercer. Somente membros com função entram nas escalas.
      </p>

      <Separator />

      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário cadastrado.</p>
        )}
        {users.map((u) => {
          const upcomingUnavailable = unavailability
            .filter((entry) => entry.userId === u.id && entry.date >= today)
            .map((entry) => entry.date);
          const overloaded = overloadedMonths(monthlyLoad, u.id, thisMonth);
          return (
            <div key={u.id} className="space-y-2" data-testid={`team-user-${u.id}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{u.displayName}</span>
                <OverloadWarning months={overloaded} testId={`warning-overload-user-${u.id}`} />
                {u.isAdmin && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 border text-xs">Admin</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SCHEDULE_ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-2">
                    <Checkbox
                      id={`user-${u.id}-role-${role}`}
                      checked={u.roles.includes(role)}
                      onCheckedChange={() => toggleRole(u, role)}
                      disabled={rolesMutation.isPending}
                      data-testid={`checkbox-user-${u.id}-role-${role}`}
                    />
                    <Label
                      htmlFor={`user-${u.id}-role-${role}`}
                      className="font-normal cursor-pointer text-xs"
                    >
                      {SCHEDULE_ROLE_LABELS[role]}
                    </Label>
                  </div>
                ))}
              </div>
              {upcomingUnavailable.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarX2 className="w-3 h-3" />
                  Indisponível: {upcomingUnavailable.join(", ")}
                </p>
              )}
              <Separator />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
