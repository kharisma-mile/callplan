import { Fragment, useState } from "react";
import { Lock, RefreshCw, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox, Switch } from "@/components/switch";
import { useApp, branchOf } from "@/store/app-store";
import { CRUD, RESOURCES, ROLE_META, ROLE_ORDER, defaultPermissions } from "@/lib/rbac";
import type { RoleKey } from "@/data/types";
import { fmtDate, nowStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UsersPage() {
  const { can } = useApp();
  const tabs = [
    ...(can("view_any_user") ? ([["users", "Pengguna"]] as const) : []),
    ...(can("view_any_role") ? ([["roles", "Role"], ["matrix", "Permission"]] as const) : []),
  ];
  const [tab, setTab] = useState<string>(tabs[0]?.[0] ?? "users");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengguna & Role"
        subtitle="Login dan RBAC milik modul. Pengguna disinkronkan dari MileApp; permission mengikuti pola {aksi}_{resource} per halaman + custom permission (approve_*, import_*, export_*)."
      />
      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "matrix" && <MatrixTab />}
    </div>
  );
}

function UsersTab() {
  const { users, setUsers, can, toast } = useApp();
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const canUpdate = can("update_user");

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <p className="text-sm text-muted-foreground">{users.length} pengguna modul · sinkron otomatis tiap hari 06:00 dari MileApp (user, hub / cabang)</p>
        {can("create_user") && (
          <Button
            className="ml-auto"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => {
                setBusy(false);
                if (!synced) {
                  setUsers((u) => [
                    ...u,
                    { id: "UN1", name: "Yoga Firmansyah", email: "yoga.firmansyah@unggulplastik.co.id", role: "sales_admin", branchId: "JKT", active: true, syncedAt: nowStamp() },
                    { id: "UN2", name: "Maya Lubis", email: "maya.lubis@unggulplastik.co.id", role: "sales_admin", branchId: "MDN", active: true, syncedAt: nowStamp() },
                  ]);
                  setSynced(true);
                  toast({ tone: "success", title: "Sinkron pengguna MileApp selesai", desc: "2 pengguna baru, 0 dinonaktifkan. Role default: Sales Admin (ubah bila perlu)." });
                } else toast({ tone: "info", title: "Sinkron pengguna selesai", desc: "Tidak ada perubahan" });
              }, 1200);
            }}
          >
            <RefreshCw className={cn(busy && "animate-spin")} /> Sinkronkan dari MileApp
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Sinkron terakhir</TableHead>
            <TableHead>Aktif</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u, i) => (
            <TableRow key={u.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </TableCell>
              <TableCell>
                {canUpdate ? (
                  <Select value={u.role} onValueChange={(v) => setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, role: v as RoleKey } : x)))}>
                    <SelectTrigger className="h-[31px] w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_ORDER.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_META[r].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  ROLE_META[u.role].label
                )}
              </TableCell>
              <TableCell>{u.branchId ? branchOf(u.branchId).name : "Kantor Pusat"}</TableCell>
              <TableCell className="text-xs">{fmtDate(u.syncedAt)}</TableCell>
              <TableCell>
                <Switch checked={u.active} disabled={!canUpdate || u.id === "U1"} onChange={(v) => setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, active: v } : x)))} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RolesTab() {
  const { users, permissions } = useApp();
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ROLE_ORDER.map((r) => (
        <Card key={r}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{ROLE_META[r].label}</p>
              <Badge variant="info">{users.filter((u) => u.role === r).length} pengguna</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{ROLE_META[r].desc}</p>
            <div className="flex gap-2 text-xs">
              <Badge variant="neutral">Cakupan: {ROLE_META[r].scopeLabel}</Badge>
              <Badge variant="neutral">{permissions[r].length} permission</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MatrixTab() {
  const { permissions, setPermissions, can, session, toast } = useApp();
  const [role, setRole] = useState<RoleKey>(session?.role === "admin" ? "spv" : session!.role);
  const editable = can("update_role") && role !== "admin";
  const perms = new Set(permissions[role]);
  const groups = Array.from(new Set(RESOURCES.map((r) => r.group)));

  const toggle = (perm: string, on: boolean) => {
    setPermissions((p) => ({ ...p, [role]: on ? [...p[role], perm] : p[role].filter((x) => x !== perm) }));
    if (role === session?.role) toast({ tone: on ? "success" : "warning", title: `${perm} ${on ? "diberikan" : "dicabut"}`, desc: "Berlaku langsung untuk role Anda saat ini" });
  };
  const rowAll = (names: string[], on: boolean) =>
    setPermissions((p) => ({ ...p, [role]: on ? Array.from(new Set([...p[role], ...names])) : p[role].filter((x) => !names.includes(x)) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ROLE_ORDER.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={cn("flex h-[31px] items-center gap-1 rounded-md border px-3 text-sm", role === r ? "border-primary bg-accent text-[#016C9D]" : "border-border bg-background text-foreground hover:bg-muted")}
          >
            {r === "admin" && <Lock className="h-3.5 w-3.5" />}
            {ROLE_META[r].label}
            {r === session?.role && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-white">Anda</span>}
          </button>
        ))}
        {editable && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setPermissions((p) => ({ ...p, [role]: defaultPermissions()[role] }));
              toast({ tone: "info", title: "Permission dikembalikan ke default", desc: ROLE_META[role].label });
            }}
          >
            <RotateCcw /> Reset default
          </Button>
        )}
      </div>
      {role === "admin" && <p className="text-xs text-muted-foreground">Role Admin dikunci (super admin) agar tidak terjadi lock-out.</p>}
      {role === session?.role && role !== "admin" && (
        <p className="rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-2 text-xs text-[#01496A]">Ini role Anda saat ini: perubahan langsung terlihat di sidebar, tombol, dan halaman.</p>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource / halaman</TableHead>
              <TableHead className="w-10 text-center">Semua</TableHead>
              {CRUD.map((c) => (
                <TableHead key={c} className="text-center font-mono text-[12px]">
                  {c}
                </TableHead>
              ))}
              <TableHead>Custom permission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <Fragment key={g}>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableCell colSpan={8} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g}
                  </TableCell>
                </TableRow>
                {RESOURCES.filter((r) => r.group === g).map((r) => {
                  const names = [...r.crud.map((a) => `${a}_${r.key}`), ...r.custom];
                  const all = names.every((n) => perms.has(n));
                  return (
                    <TableRow key={r.key}>
                      <TableCell>
                        <p className="font-medium">{r.label}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{r.key}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={all} disabled={!editable} onChange={(v) => rowAll(names, v)} />
                      </TableCell>
                      {CRUD.map((c) => {
                        const n = `${c}_${r.key}`;
                        return (
                          <TableCell key={c} className="text-center">
                            {r.crud.includes(c) ? <Checkbox title={n} checked={perms.has(n)} disabled={!editable} onChange={(v) => toggle(n, v)} /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {r.custom.map((n) => (
                            <label key={n} className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]", perms.has(n) ? "border-[#82E8B9] bg-[#D8F8E9] text-[#115A38]" : "border-border text-muted-foreground")}>
                              <Checkbox checked={perms.has(n)} disabled={!editable} onChange={(v) => toggle(n, v)} />
                              {n}
                            </label>
                          ))}
                          {r.custom.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
