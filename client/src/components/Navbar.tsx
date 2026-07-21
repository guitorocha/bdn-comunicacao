import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, Home, LayoutDashboard, LogIn, LogOut, Menu, Search, Send, UserCog, Users } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/solicitacoes", label: "Solicitações", icon: Send },
  { href: "/escalas", label: "Escalas", icon: CalendarDays },
];

export function BdnLogo() {
  return (
    <img
      src="/logo-bdn.png"
      alt="Bola de Neve Church"
      width={100}
      height={22}
      className="object-contain"
      style={{ borderRadius: 0 }}
    />
  );
}

export function Navbar({ subtitle }: { subtitle?: string }) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // After login, return to the page the user was on
  const loginHref = location === "/login" ? "/login" : `/login?next=${encodeURIComponent(location)}`;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <BdnLogo />
            <div>
              <h1 className="text-sm font-bold uppercase tracking-wider">Comunicação</h1>
              <p className="text-xs text-muted-foreground">{subtitle ?? "Ministério de Comunicação"}</p>
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              <Button
                variant={location === href ? "secondary" : "ghost"}
                size="sm"
                data-testid={`link-nav-${label.toLowerCase()}`}
              >
                {label}
              </Button>
            </Link>
          ))}
          <Link href="/acompanhar">
            <Button variant="ghost" size="sm" data-testid="link-track">
              <Search className="w-4 h-4 mr-1" /> Acompanhar
            </Button>
          </Link>
          <div className="w-px h-5 bg-border mx-2" />
          {isAuthenticated ? (
            <>
              <Link href="/solicitacoes/painel">
                <Button
                  variant={location === "/solicitacoes/painel" ? "secondary" : "ghost"}
                  size="sm"
                  data-testid="link-nav-painel"
                >
                  <LayoutDashboard className="w-4 h-4 mr-1" /> Painel
                </Button>
              </Link>
              {user?.isAdmin && (
                <Link href="/equipes">
                  <Button
                    variant={location === "/equipes" ? "secondary" : "ghost"}
                    size="sm"
                    data-testid="link-team"
                  >
                    <Users className="w-4 h-4 mr-1" /> Equipes
                  </Button>
                </Link>
              )}
              <Link href="/usuarios">
                <Button
                  variant={location === "/usuarios" ? "secondary" : "ghost"}
                  size="sm"
                  data-testid="link-profile"
                >
                  <UserCog className="w-4 h-4 mr-1" /> Meus dados
                </Button>
              </Link>
              <span className="text-xs text-muted-foreground px-2 max-w-[140px] truncate" data-testid="text-nav-user">
                {user?.displayName}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-nav-logout">
                <LogOut className="w-4 h-4 mr-1" /> Sair
              </Button>
            </>
          ) : (
            <Link href={loginHref}>
              <Button variant="secondary" size="sm" data-testid="link-login">
                <LogIn className="w-4 h-4 mr-1" /> Entrar
              </Button>
            </Link>
          )}
        </nav>

        {/* Mobile nav */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <DropdownMenuItem className="cursor-pointer">
                    <Icon className="w-4 h-4 mr-2" /> {label}
                  </DropdownMenuItem>
                </Link>
              ))}
              <Link href="/acompanhar">
                <DropdownMenuItem className="cursor-pointer">
                  <Search className="w-4 h-4 mr-2" /> Acompanhar
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              {isAuthenticated ? (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    {user?.displayName}
                  </DropdownMenuLabel>
                  <Link href="/solicitacoes/painel">
                    <DropdownMenuItem className="cursor-pointer">
                      <LayoutDashboard className="w-4 h-4 mr-2" /> Painel
                    </DropdownMenuItem>
                  </Link>
                  {user?.isAdmin && (
                    <Link href="/equipes">
                      <DropdownMenuItem className="cursor-pointer">
                        <Users className="w-4 h-4 mr-2" /> Equipes
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <Link href="/usuarios">
                    <DropdownMenuItem className="cursor-pointer">
                      <UserCog className="w-4 h-4 mr-2" /> Meus dados
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" /> Sair
                  </DropdownMenuItem>
                </>
              ) : (
                <Link href={loginHref}>
                  <DropdownMenuItem className="cursor-pointer">
                    <LogIn className="w-4 h-4 mr-2" /> Entrar
                  </DropdownMenuItem>
                </Link>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
