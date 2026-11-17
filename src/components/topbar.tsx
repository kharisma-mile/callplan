import { Check, ChevronDown, LogOut, Repeat } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/store/app-store";
import { ROLE_ORDER } from "@/lib/rbac";
import { initials } from "@/lib/format";

export function Topbar() {
  const { user, users, login, logout, scopeLabel, settings, toast, roleMeta } = useApp();
  if (!user) return null;
  const demoUsers = ROLE_ORDER.map((r) => users.find((u) => u.role === r && ["U1", "U2", "U3", "U4", "U5", "U6"].includes(u.id))!).filter(Boolean);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-6">
      <div className="flex items-center gap-2">
        <Badge variant="info" title="Mode demo — di produksi varian ditetapkan saat deployment">
          Varian {settings.variant} · {settings.variant === "A" ? "Odoo" : "Standalone"} (mode demo)
        </Badge>
        <Badge variant="outline">Cakupan data: {scopeLabel}</Badge>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-muted">
              <Avatar>
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground">{roleMeta(user.role).label}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" /> Ganti role demo
            </DropdownMenuLabel>
            {demoUsers.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onClick={() => {
                  login(u.id);
                  toast({ tone: "info", title: `Masuk sebagai ${roleMeta(u.role).label}`, desc: `${u.name} · ${roleMeta(u.role).scopeLabel}` });
                }}
              >
                <div className="flex flex-1 flex-col">
                  <span className="text-sm">{roleMeta(u.role).label}</span>
                  <span className="text-xs text-muted-foreground">{u.name}</span>
                </div>
                {u.id === user.id && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut /> Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
