import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
} from "@/components/ui/carousel";
import { Navbar } from "@/components/Navbar";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  ArrowRight, CalendarDays, Camera, Clapperboard, Heart,
  Megaphone, MonitorPlay, Palette, Radio, Send, Share2,
} from "lucide-react";

const TEAMS = [
  {
    icon: Camera,
    title: "Fotografia",
    description: "Registro fotográfico dos cultos, batismos, eventos e momentos marcantes da igreja.",
  },
  {
    icon: Clapperboard,
    title: "Filmmaker",
    description: "Produção de vídeos, coberturas, aftermovies e conteúdo audiovisual para as redes.",
  },
  {
    icon: MonitorPlay,
    title: "Projeção",
    description: "Operação do telão durante os cultos: letras, versículos, avisos e recursos visuais.",
  },
  {
    icon: Radio,
    title: "Transmissão ao Vivo",
    description: "Transmissão dos cultos ao vivo para alcançar quem não pode estar presente.",
  },
  {
    icon: Share2,
    title: "Redes Sociais",
    description: "Gestão e divulgação de conteúdos nas redes sociais da igreja.",
  },
  {
    icon: Palette,
    title: "Design Gráfico",
    description: "Criação e gestão de materiais gráficos (artes) para divulgações da igreja.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main>
        {/* Hero */}
        <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5">
              <Megaphone className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Bola de Neve Church
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">
              Ministério de <span className="text-primary">Comunicação</span>
            </h1>
            <p className="max-w-2xl mx-auto text-muted-foreground md:text-lg">
              Servimos para que a mensagem alcance mais pessoas. Cuidamos da divulgação,
              fotografia, vídeo, projeção e transmissão dos cultos e eventos da igreja —
              tudo para a glória de Deus.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link href="/solicitacoes">
                <Button size="lg" data-testid="button-cta-solicitacoes">
                  <Send className="w-4 h-4 mr-2" /> Solicitar divulgação
                </Button>
              </Link>
              <Link href="/escalas">
                <Button size="lg" variant="secondary" data-testid="button-cta-escalas">
                  <CalendarDays className="w-4 h-4 mr-2" /> Ver escalas
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Teams */}
        <section className="max-w-6xl mx-auto px-4 py-14">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-xl md:text-2xl font-bold uppercase tracking-wider">Nossas equipes</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Seis frentes trabalhando juntas em cada culto e evento.
            </p>
          </div>
          <Carousel
            opts={{ align: "start", loop: true }}
            className="px-10 md:px-12"
            data-testid="carousel-equipes"
          >
            <CarouselContent className="-ml-4">
              {TEAMS.map(({ icon: Icon, title, description }) => (
                <CarouselItem key={title} className="pl-4 sm:basis-1/2 lg:basis-1/4">
                  <Card className="h-full p-6 space-y-3 hover-elevate">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-bold">{title}</h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            {/* !absolute: .hover-elevate forces position:relative with higher specificity */}
            <CarouselPrevious className="!absolute left-0 z-10" data-testid="button-equipes-anterior" />
            <CarouselNext className="!absolute right-0 z-10" data-testid="button-equipes-proxima" />
          </Carousel>
        </section>

        {/* How it works / CTA */}
        <section className="max-w-6xl mx-auto px-4 pb-14">
          <Card className="p-8 md:p-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold uppercase tracking-wider">Como podemos servir você</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Seu ministério tem um evento chegando? Envie uma solicitação de divulgação
                  e nossa equipe cuida da arte, dos avisos e das redes sociais. Lembre-se de
                  solicitar com pelo menos 2 semanas de antecedência.
                </p>
                <p className="text-sm text-muted-foreground">
                  Você faz parte da equipe? Confira as escalas de fotografia, filmmaker,
                  projeção e transmissão ao vivo dos próximos cultos.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Link href="/solicitacoes">
                  <Button variant="outline" className="w-full justify-between" data-testid="button-link-solicitacoes">
                    Nova solicitação de divulgação
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/acompanhar">
                  <Button variant="outline" className="w-full justify-between" data-testid="button-link-acompanhar">
                    Acompanhar uma solicitação
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/escalas">
                  <Button variant="outline" className="w-full justify-between" data-testid="button-link-escalas">
                    Escalas dos voluntários
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </section>

        <footer className="pb-8 text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}
