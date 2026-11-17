import { useState } from "react";
import { ClipboardCheck, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp, branchOf } from "@/store/app-store";
import { ROLE_ORDER } from "@/lib/rbac";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const { users, login, toast, roleMeta } = useApp();
  const demo = ROLE_ORDER.map((r) => users.find((u) => u.role === r && /^U\d$/.test(u.id))!).filter(Boolean);
  const [sel, setSel] = useState(demo[3]?.id ?? demo[0].id);
  const selected = users.find((u) => u.id === sel)!;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#E6F7FF] p-4">
      <div className="grid w-full max-w-[1040px] gap-6 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col justify-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary">
              <ClipboardCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#016C9D]">Unggul Plastik · MileApp</p>
              <h1 className="text-[26px] font-bold leading-tight text-foreground">Modul Sales Operations (PJP &amp; Approval)</h1>
            </div>
          </div>
          <p className="max-w-xl text-sm text-[#4F4F4F]">
            Mockup interaktif tanpa backend untuk demo pre-sales: PJP / call plan, master outlet, pipeline, halaman approval sesuai LOA,
            review pesanan, target, dashboard, serta RBAC per halaman. Login dan RBAC milik modul sendiri; pengguna disinkronkan dari MileApp.
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Pilih role demo</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {demo.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSel(u.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-md border bg-background p-3 text-left transition-colors",
                    sel === u.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-[#9FE1FE]"
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-[#01496A]">{initials(u.name)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{roleMeta(u.role).label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {u.name} · {u.branchId ? branchOf(u.branchId).name : "Kantor Pusat"}
                    </span>
                    <span className="mt-1 block text-xs text-[#4F4F4F]">{roleMeta(u.role).desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="self-center">
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">Masuk</h2>
              <p className="text-sm text-muted-foreground">Login modul (bukan login Mile Field)</p>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={selected.email} readOnly />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" type="password" value="demo1234" readOnly />
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 text-xs text-[#4F4F4F]">
              Role: <b>{roleMeta(selected.role).label}</b> · Cakupan data: <b>{roleMeta(selected.role).scopeLabel}</b>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                login(selected.id);
                toast({ tone: "success", title: `Selamat datang, ${selected.name.split(" ")[0]}`, desc: roleMeta(selected.role).label });
              }}
            >
              Masuk
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">Demo · data dummy · tanpa backend</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
