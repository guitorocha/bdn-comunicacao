import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MINISTRIES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Clock, Info, Send } from "lucide-react";
import { Link } from "wouter";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

const formSchema = z.object({
  requesterName: z.string().min(2, "Informe seu nome"),
  ministry: z.string().min(1, "Selecione um ministério"),
  customMinistry: z.string().optional(),
  eventType: z.enum(["culto", "outro"], { required_error: "Selecione o tipo de evento" }),
  eventName: z.string().min(2, "Informe o nome do evento"),
  eventDate: z.string().min(1, "Informe a data do evento"),
  eventTime: z.string().min(1, "Informe o horário do evento"),
  eventDescription: z.string().min(10, "Descreva o evento com mais detalhes (mín. 10 caracteres)"),
  promotionType: z.enum(["interna", "externa"], { required_error: "Selecione o tipo de divulgação" }),
});

type FormData = z.infer<typeof formSchema>;

export default function Home() {
  const { toast } = useToast();
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [showCustomMinistry, setShowCustomMinistry] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      requesterName: "",
      ministry: "",
      customMinistry: "",
      eventType: undefined,
      eventName: "",
      eventDate: "",
      eventTime: "",
      eventDescription: "",
      promotionType: undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const ministry = data.ministry === "outro" ? (data.customMinistry || "Outro") : data.ministry;
      const res = await apiRequest("POST", "/api/requests", {
        requesterName: data.requesterName,
        ministry,
        eventType: data.eventType,
        eventName: data.eventName,
        eventDate: data.eventDate,
        eventTime: data.eventTime,
        eventDescription: data.eventDescription,
        promotionType: data.promotionType,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setSubmittedId(data.id);
      setConflict(null);
      form.reset();
    },
    onError: async (error: any) => {
      const msg = error.message || "";
      if (msg.includes("409")) {
        try {
          const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
          setConflict(parsed.message);
        } catch {
          setConflict("Já existe um evento agendado para esse ministério nessa data. Verifique os dados e tente novamente, ou fale com os líderes da comunicação.");
        }
      } else {
        toast({ title: "Erro", description: "Ocorreu um erro ao enviar a solicitação.", variant: "destructive" });
      }
    },
  });

  const onSubmit = (data: FormData) => {
    setConflict(null);
    setSubmittedId(null);
    mutation.mutate(data);
  };

  const selectedMinistry = form.watch("ministry");

  if (submittedId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold" data-testid="text-success-title">Solicitação enviada</h2>
            <p className="text-muted-foreground text-sm">
              Sua solicitação foi registrada. Guarde o número abaixo para acompanhar o andamento.
            </p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">ID da Solicitação</p>
            <p className="text-3xl font-black text-primary" data-testid="text-request-id">#{submittedId}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href={`/acompanhar?id=${submittedId}`}>
              <Button className="w-full" data-testid="button-track">Acompanhar solicitação</Button>
            </Link>
            <Button variant="secondary" className="w-full" onClick={() => setSubmittedId(null)} data-testid="button-new-request">
              Nova solicitação
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BdnLogo />
            <div>
              <h1 className="text-sm font-bold uppercase tracking-wider">Comunicação</h1>
              <p className="text-xs text-muted-foreground">Solicitação de Divulgação</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/acompanhar">
              <Button variant="secondary" size="sm" data-testid="link-track">Acompanhar</Button>
            </Link>
            <Link href="/admin">
              <Button variant="ghost" size="sm" data-testid="link-admin">Equipe</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Info banners */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/10 rounded-lg p-4">
            <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Prazo para início da divulgação</p>
              <p className="text-sm text-muted-foreground">
                Até 2 semanas a partir da data do pedido, podendo ocorrer antes. Programe-se para solicitar a divulgação sempre com antecedência.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-muted/50 border border-border rounded-lg p-4">
            <Info className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Eventos que já constam no calendário da igreja não precisam ser solicitados por este formulário, pois já estão no cronograma de divulgação.
            </p>
          </div>
        </div>

        {/* Conflict alert */}
        {conflict && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">Evento conflitante</p>
              <p className="text-sm text-muted-foreground">{conflict}</p>
              <p className="text-sm text-muted-foreground mt-1">Verifique os dados e envie novamente se necessário, ou entre em contato com os líderes da comunicação.</p>
            </div>
          </div>
        )}

        {/* Form */}
        <Card className="p-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <h2 className="text-lg font-bold">Nova Solicitação</h2>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="requesterName">Seu nome</Label>
              <Input id="requesterName" placeholder="Nome completo" {...form.register("requesterName")} data-testid="input-name" />
              {form.formState.errors.requesterName && (
                <p className="text-xs text-destructive">{form.formState.errors.requesterName.message}</p>
              )}
            </div>

            {/* Ministry */}
            <div className="space-y-2">
              <Label>Ministério</Label>
              <Select
                value={selectedMinistry}
                onValueChange={(v) => {
                  form.setValue("ministry", v);
                  setShowCustomMinistry(v === "outro");
                }}
              >
                <SelectTrigger data-testid="select-ministry">
                  <SelectValue placeholder="Selecione o ministério" />
                </SelectTrigger>
                <SelectContent>
                  {MINISTRIES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="outro">Outro...</SelectItem>
                </SelectContent>
              </Select>
              {showCustomMinistry && (
                <Input placeholder="Nome do ministério" {...form.register("customMinistry")} data-testid="input-custom-ministry" />
              )}
              {form.formState.errors.ministry && (
                <p className="text-xs text-destructive">{form.formState.errors.ministry.message}</p>
              )}
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label>Tipo de evento</Label>
              <RadioGroup
                value={form.watch("eventType")}
                onValueChange={(v) => form.setValue("eventType", v as "culto" | "outro")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="culto" id="culto" data-testid="radio-culto" />
                  <Label htmlFor="culto" className="font-normal cursor-pointer">Culto</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="outro" id="outro-evento" data-testid="radio-outro" />
                  <Label htmlFor="outro-evento" className="font-normal cursor-pointer">Outro evento</Label>
                </div>
              </RadioGroup>
              {form.formState.errors.eventType && (
                <p className="text-xs text-destructive">{form.formState.errors.eventType.message}</p>
              )}
            </div>

            {/* Event Name */}
            <div className="space-y-2">
              <Label htmlFor="eventName">Nome do evento</Label>
              <Input id="eventName" placeholder="Ex: Culto de Jovens, Retiro de Casais..." {...form.register("eventName")} data-testid="input-event-name" />
              {form.formState.errors.eventName && (
                <p className="text-xs text-destructive">{form.formState.errors.eventName.message}</p>
              )}
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eventDate">Data do evento</Label>
                <Input id="eventDate" type="date" {...form.register("eventDate")} data-testid="input-event-date" />
                {form.formState.errors.eventDate && (
                  <p className="text-xs text-destructive">{form.formState.errors.eventDate.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventTime">Horário</Label>
                <Input id="eventTime" type="time" {...form.register("eventTime")} data-testid="input-event-time" />
                {form.formState.errors.eventTime && (
                  <p className="text-xs text-destructive">{form.formState.errors.eventTime.message}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="eventDescription">Descrição do evento</Label>
              <Textarea
                id="eventDescription"
                placeholder="Descreva o evento, público-alvo, informações importantes..."
                className="min-h-[100px]"
                {...form.register("eventDescription")}
                data-testid="input-description"
              />
              {form.formState.errors.eventDescription && (
                <p className="text-xs text-destructive">{form.formState.errors.eventDescription.message}</p>
              )}
            </div>

            {/* Promotion type */}
            <div className="space-y-3">
              <Label>Tipo de divulgação</Label>
              <RadioGroup
                value={form.watch("promotionType")}
                onValueChange={(v) => form.setValue("promotionType", v as "interna" | "externa")}
                className="space-y-3"
              >
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
                  onClick={() => form.setValue("promotionType", "interna")}
                >
                  <RadioGroupItem value="interna" id="interna" className="mt-0.5" data-testid="radio-interna" />
                  <div>
                    <Label htmlFor="interna" className="font-semibold cursor-pointer">Interna</Label>
                    <p className="text-xs text-muted-foreground">Grupos, culto e célula</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
                  onClick={() => form.setValue("promotionType", "externa")}
                >
                  <RadioGroupItem value="externa" id="externa" className="mt-0.5" data-testid="radio-externa" />
                  <div>
                    <Label htmlFor="externa" className="font-semibold cursor-pointer">Externa</Label>
                    <p className="text-xs text-muted-foreground">Grupos, culto, célula + redes sociais</p>
                  </div>
                </div>
              </RadioGroup>
              {form.formState.errors.promotionType && (
                <p className="text-xs text-destructive">{form.formState.errors.promotionType.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-submit">
              {mutation.isPending ? (
                <span className="flex items-center gap-2">Enviando...</span>
              ) : (
                <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Enviar solicitação</span>
              )}
            </Button>
          </form>
        </Card>

        <footer className="mt-12 pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}

function BdnLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-label="Bola de Neve Church">
      <rect width="36" height="36" rx="8" fill="hsl(var(--primary))" />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="10">
        BDN
      </text>
    </svg>
  );
}
