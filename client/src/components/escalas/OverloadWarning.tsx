import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMonthLabel, OVERLOAD_WARNING } from "@/lib/escalas";

interface OverloadWarningProps {
  // Meses em que a pessoa passou do limite de escalas, com a contagem de cada um
  months: { month: string; count: number }[];
  testId?: string;
}

// Aviso discreto ao lado do nome de quem está com escalas demais no mesmo mês.
// Visível só para o admin — quem monta as escalas é quem pode redistribuir.
export function OverloadWarning({ months, testId }: OverloadWarningProps) {
  if (months.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label={OVERLOAD_WARNING}
          className="inline-flex shrink-0 text-amber-500 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
          data-testid={testId}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[16rem]">
        <p>{OVERLOAD_WARNING}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {months
            .map(({ month, count }) => `${count} escalas em ${formatMonthLabel(month)}`)
            .join(" · ")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
