import { Fragment, useMemo, useState } from "react";
import { Copy, Download, Lock, MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Checkbox, Switch } from "@/components/switch";
import { useApp, branchOf } from "@/store/app-store";
import { CRUD, RESOURCES, SCOPE_LABEL, defaultPermissions } from "@/lib/rbac";
import type { ModuleUser, RoleDef, ScopeType } from "@/data/types";
import { fmtDate, nowStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function UsersPage() {
  const { can } = useApp();
  const tabs = [
    ...(can("view_any_user") ? ([["users", "Pengguna"]] as const) : []),
    ...(can("view_any_role") ? ([["roles", "Role"], ["matrix", "Permission"]] as const) : []),
    ...(can("view_any_user") ? ([["audit", "Audit"]] as const) : []),
  ];
  const [tab, setTab] = useState<string>(tabs[0]?.[0] ?? "users");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengguna & Role"
        subtitle="RBAC milik modul; pengguna masuk lewat MileApp (tanpa login modul) dan disinkronkan dari MileApp; permission mengikuti pola {aksi}_{resource} per halaman + custom permission (approve_*, import_*, export_*)."
      />
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "matrix" && <MatrixTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

/* ---------------- Pengguna ---------------- */
function UsersTab() {
  const { users, setUsers, can, toast, roles, roleMeta, addAudit, user: me } = useApp();
  const [synced, setSynced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [lock, setLock] = useState<ModuleUser | null>(null);
  const canUpdate = can("update_user");
  const noRoleCount = users.filter((u) => !u.role).length;

  const rows = users.filter(
    (u) =>
      (q === "" || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) &&
      (roleFilter === "all" || (roleFilter === NONE ? !u.role : u.role === roleFilter))
  );

  const setRole = (u: ModuleUser, v: string) => {
    const role = v === NONE ? null : v;
    setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, role } : x)));
    addAudit({ module: "Pengguna", action: "Role pengguna diubah", target: u.name, detail: `${roleMeta(u.role).label} → ${roleMeta(role).label}` });
    toast({ tone: "success", title: "Role diperbarui", desc: `${u.name} · ${roleMeta(role).label}` });
  };

  const setActive = (u: ModuleUser, active: boolean) => {
    setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, active } : x)));
    addAudit({ module: "Pengguna", action: active ? "Akun dibuka" : "Akun dikunci", target: u.name, detail: active ? undefined : "Sesi dicabut; kunci dipropagasi ke MileApp (API)" });
    toast({ tone: active ? "success" : "warning", title: active ? "Akun dibuka" : "Akun dikunci", desc: active ? u.name : `${u.name} tidak dapat masuk ke modul dan Mile Field.` });
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <p className="text-sm text-muted-foreground">{users.length} pengguna modul · sinkron otomatis tiap hari 06:00 dari MileApp (user, hub / cabang)</p>
        {noRoleCount > 0 && <Badge variant="warning">{noRoleCount} pengguna belum punya role</Badge>}
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
                    { id: "UN1", name: "Yoga Firmansyah", email: "yoga.firmansyah@unggulplastik.co.id", role: null, branchId: "JKT", active: true, syncedAt: nowStamp() },
                    { id: "UN2", name: "Maya Lubis", email: "maya.lubis@unggulplastik.co.id", role: null, branchId: "MDN", active: true, syncedAt: nowStamp() },
                  ]);
                  setSynced(true);
                  addAudit({ module: "Pengguna", action: "Sinkron pengguna MileApp", target: "Semua", detail: "2 pengguna baru (tanpa role), 0 dinonaktifkan" });
                  toast({
                    tone: "success",
                    title: "Sinkron pengguna MileApp selesai — 2 pengguna baru, 0 dinonaktifkan",
                    desc: "Pengguna baru belum punya role: tetapkan role agar dapat mengakses modul.",
                  });
                } else {
                  addAudit({ module: "Pengguna", action: "Sinkron pengguna MileApp", target: "Semua", detail: "Tidak ada perubahan" });
                  toast({ tone: "info", title: "Sinkron pengguna selesai", desc: "Tidak ada perubahan" });
                }
              }, 1200);
            }}
          >
            <RefreshCw className={cn(busy && "animate-spin")} /> Sinkronkan dari MileApp
          </Button>
        )}
      </CardContent>
      <CardContent className="flex flex-wrap items-center gap-4 px-4 pb-4 pt-0">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari nama atau email..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua role</SelectItem>
            <SelectItem value={NONE}>Tanpa role</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          {rows.map((u, i) => (
            <TableRow key={u.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {canUpdate && u.id !== "U1" ? (
                    <Select value={u.role ?? NONE} onValueChange={(v) => setRole(u, v)}>
                      <SelectTrigger className="h-[31px] w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Tanpa role —</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{roleMeta(u.role).label}</span>
                  )}
                  {!u.role && (
                    <Badge variant="warning" title="Tidak ada akses sampai Admin menetapkan role">
                      Tanpa role
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{u.branchId ? branchOf(u.branchId).name : "Kantor Pusat"}</TableCell>
              <TableCell className="text-xs">{fmtDate(u.syncedAt)}</TableCell>
              <TableCell>
                <Switch
                  checked={u.active}
                  disabled={!canUpdate || u.id === "U1" || u.id === me?.id}
                  onChange={(v) => (v ? setActive(u, true) : setLock(u))}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah filter atau kata kunci pencarian." />}

      <Dialog open={!!lock} onOpenChange={(v) => !v && setLock(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Kunci Akun</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Kunci akun <b>{lock?.name}</b>? User tidak dapat masuk ke modul dan Mile Field.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLock(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (lock) setActive(lock, false);
                setLock(null);
              }}
            >
              Kunci akun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Role ---------------- */
interface RoleForm {
  mode: "create" | "edit" | "duplicate";
  key?: string;
  label: string;
  desc: string;
  scope: ScopeType;
  copyFrom: string;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "role";

function RolesTab() {
  const { users, permissions, roles, setRoles, setPermissions, can, toast, addAudit } = useApp();
  const [form, setForm] = useState<RoleForm | null>(null);
  const [del, setDel] = useState<RoleDef | null>(null);

  const save = () => {
    if (!form || !form.label.trim()) return;
    if (form.mode === "edit" && form.key) {
      const before = roles.find((r) => r.key === form.key);
      setRoles((l) =>
        l.map((r) =>
          r.key === form.key ? { ...r, label: form.label, desc: form.desc, ...(r.builtin ? {} : { scope: form.scope, scopeLabel: SCOPE_LABEL[form.scope] }) } : r
        )
      );
      addAudit({ module: "Role", action: "Role diubah", target: form.label, detail: before && before.label !== form.label ? `${before.label} → ${form.label}` : undefined });
      toast({ tone: "success", title: "Role diperbarui", desc: form.label });
    } else {
      let key = slugify(form.label);
      while (roles.some((r) => r.key === key)) key += "_2";
      const def: RoleDef = { key, label: form.label, desc: form.desc, scope: form.scope, scopeLabel: SCOPE_LABEL[form.scope], builtin: false };
      setRoles((l) => [...l, def]);
      const copied = form.copyFrom !== NONE ? [...(permissions[form.copyFrom] ?? [])] : [];
      setPermissions((p) => ({ ...p, [key]: copied }));
      const src = form.copyFrom !== NONE ? roles.find((r) => r.key === form.copyFrom)?.label : undefined;
      addAudit({ module: "Role", action: form.mode === "duplicate" ? "Role diduplikat" : "Role dibuat", target: form.label, detail: src ? `Permission disalin dari ${src} (${copied.length})` : "Tanpa permission" });
      toast({ tone: "success", title: "Role dibuat", desc: `${form.label} · ${copied.length} permission` });
    }
    setForm(null);
  };

  return (
    <div className="space-y-4">
      {can("create_role") && (
        <div className="flex justify-end">
          <Button onClick={() => setForm({ mode: "create", label: "", desc: "", scope: "branch", copyFrom: NONE })}>
            <Plus /> Buat Role
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const locked = r.key === "admin";
          const showMenu = !locked && (can("update_role") || can("create_role") || (can("delete_role") && !r.builtin));
          return (
            <Card key={r.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 font-semibold">
                    {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                    {r.label}
                  </p>
                  <div className="flex items-center gap-1">
                    <Badge variant="info">{users.filter((u) => u.role === r.key).length} pengguna</Badge>
                    {showMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {can("update_role") && (
                            <DropdownMenuItem onClick={() => setForm({ mode: "edit", key: r.key, label: r.label, desc: r.desc, scope: r.scope, copyFrom: NONE })}>
                              <Pencil /> Ubah
                            </DropdownMenuItem>
                          )}
                          {can("create_role") && (
                            <DropdownMenuItem onClick={() => setForm({ mode: "duplicate", label: `${r.label} (salinan)`, desc: r.desc, scope: r.scope, copyFrom: r.key })}>
                              <Copy /> Duplikat
                            </DropdownMenuItem>
                          )}
                          {can("delete_role") && !r.builtin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  const n = users.filter((u) => u.role === r.key).length;
                                  if (n > 0) toast({ tone: "warning", title: "Role tidak dapat dihapus", desc: `Role masih dipakai ${n} pengguna.` });
                                  else setDel(r);
                                }}
                              >
                                <Trash2 /> Hapus
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{r.desc || "—"}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="neutral">Cakupan: {r.scopeLabel}</Badge>
                  <Badge variant="neutral">{(permissions[r.key] ?? []).length} permission</Badge>
                  {!r.builtin && <Badge variant="orange">Role kustom</Badge>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>{form?.mode === "edit" ? "Ubah Role" : form?.mode === "duplicate" ? "Duplikat Role" : "Buat Role"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <Label>Nama role</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="mis. Admin Faktur" />
              </div>
              <div className="space-y-1">
                <Label>Deskripsi</Label>
                <Textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Tugas dan akses role ini" />
              </div>
              <div className="space-y-1">
                <Label>Cakupan data</Label>
                <Select
                  value={form.scope}
                  disabled={form.mode === "edit" && !!roles.find((r) => r.key === form.key)?.builtin}
                  onValueChange={(v) => setForm({ ...form, scope: v as ScopeType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCOPE_LABEL) as ScopeType[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {SCOPE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.mode !== "edit" && (
                <div className="space-y-1">
                  <Label>Salin permission dari role (opsional)</Label>
                  <Select value={form.copyFrom} onValueChange={(v) => setForm({ ...form, copyFrom: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Tanpa permission —</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button disabled={!form?.label.trim()} onClick={save}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus Role</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus role <b>{del?.label}</b> beserta permission-nya?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!del) return;
                setRoles((l) => l.filter((r) => r.key !== del.key));
                setPermissions((p) => {
                  const n = { ...p };
                  delete n[del.key];
                  return n;
                });
                addAudit({ module: "Role", action: "Role dihapus", target: del.label });
                toast({ tone: "danger", title: "Role dihapus", desc: del.label });
                setDel(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Permission matrix ---------------- */
function MatrixTab() {
  const { permissions, setPermissions, can, session, toast, roles, roleMeta, addAudit } = useApp();
  const [role, setRole] = useState<string>(session.role === "admin" ? "spv" : session.role);
  const meta = roleMeta(role);
  const editable = can("update_role") && role !== "admin";
  const perms = new Set(permissions[role] ?? []);
  const groups = Array.from(new Set(RESOURCES.map((r) => r.group)));
  const colCount = 3 + CRUD.length;

  const toggle = (perm: string, on: boolean) => {
    setPermissions((p) => ({ ...p, [role]: on ? [...(p[role] ?? []), perm] : (p[role] ?? []).filter((x) => x !== perm) }));
    addAudit({ module: "Role", action: "Permission diubah", target: meta.label, detail: `${on ? "+" : "-"} ${perm}` });
    if (role === session.role) toast({ tone: on ? "success" : "warning", title: `${perm} ${on ? "diberikan" : "dicabut"}`, desc: "Berlaku langsung untuk role Anda saat ini" });
  };
  const rowAll = (names: string[], on: boolean) => {
    setPermissions((p) => ({ ...p, [role]: on ? Array.from(new Set([...(p[role] ?? []), ...names])) : (p[role] ?? []).filter((x) => !names.includes(x)) }));
    addAudit({ module: "Role", action: "Permission diubah", target: meta.label, detail: `${on ? "+" : "-"} ${names.join(", ")}` });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {roles.map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={cn("flex h-[31px] items-center gap-1 rounded-md border px-3 text-sm", role === r.key ? "border-primary bg-accent text-[#016C9D]" : "border-border bg-background text-foreground hover:bg-muted")}
          >
            {r.key === "admin" && <Lock className="h-3.5 w-3.5" />}
            {r.label}
            {r.key === session.role && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-white">Anda</span>}
          </button>
        ))}
        {editable && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              const def = meta.builtin ? defaultPermissions()[role] ?? [] : [];
              setPermissions((p) => ({ ...p, [role]: def }));
              addAudit({ module: "Role", action: meta.builtin ? "Reset default" : "Permission dikosongkan", target: meta.label });
              toast({ tone: "info", title: meta.builtin ? "Permission dikembalikan ke default" : "Permission dikosongkan", desc: meta.label });
            }}
          >
            <RotateCcw /> {meta.builtin ? "Reset default" : "Kosongkan"}
          </Button>
        )}
      </div>
      {role === "admin" && <p className="text-xs text-muted-foreground">Role Admin dikunci (super admin) agar tidak terjadi lock-out.</p>}
      {role === session.role && role !== "admin" && (
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
                  <TableCell colSpan={colCount} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

/* ---------------- Audit ---------------- */
function AuditTab() {
  const { auditLog, can, toast } = useApp();
  const [mod, setMod] = useState("all");
  const [q, setQ] = useState("");
  const modules = useMemo(() => Array.from(new Set(auditLog.map((a) => a.module))), [auditLog]);
  const rows = auditLog.filter(
    (a) => (mod === "all" || a.module === mod) && (q === "" || `${a.by} ${a.action} ${a.target} ${a.detail ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari pengguna, aksi, target..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={mod} onValueChange={setMod}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua modul</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Log tidak dapat diubah / dihapus. Keputusan approval punya audit trail sendiri.</span>
        {can("export_data") && (
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => toast({ tone: "success", title: "Export Excel dibuat", desc: `audit-log-${new Date().getTime().toString().slice(-5)}.xlsx · ${rows.length} baris` })}
          >
            <Download /> Export
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Waktu</TableHead>
            <TableHead>Pengguna</TableHead>
            <TableHead>Modul</TableHead>
            <TableHead>Aksi</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a, i) => (
            <TableRow key={i}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="text-xs">{fmtDate(a.at)}</TableCell>
              <TableCell>{a.by}</TableCell>
              <TableCell>
                <Badge variant="neutral">{a.module}</Badge>
              </TableCell>
              <TableCell>{a.action}</TableCell>
              <TableCell>{a.target}</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{a.detail ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Tidak ada data" desc="Aktivitas pengguna, role dan pengaturan tercatat di sini." />}
    </Card>
  );
}
