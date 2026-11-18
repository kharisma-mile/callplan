import { useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox, Switch } from "@/components/switch";
import { EmptyState } from "@/components/empty-state";
import { useApp } from "@/store/app-store";
import { SALESMEN, SPVS } from "@/data/mock";
import type { Branch, Region, Route, Salesman } from "@/data/types";
import { cn } from "@/lib/utils";

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConfirmDelete({ open, title, text, onClose, onConfirm }: { open: boolean; title: string; text: React.ReactNode; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="gap-0 p-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="p-4 text-sm">{text}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Branch ids visible for the user: all for scope "all", else own branch. */
function useScopeBranches() {
  const { user, roleMeta, branches } = useApp();
  const all = roleMeta(user?.role).scope === "all";
  return all ? branches.map((b) => b.id) : user?.branchId ? [user.branchId] : [];
}

export function TerritoryPage() {
  const { can } = useApp();
  const tabs = [
    ...(can("view_any_branch") ? ([["branch", "Cabang"]] as const) : []),
    ...(can("view_any_region") ? ([["region", "Region"]] as const) : []),
    ...(can("view_any_route") ? ([["route", "Rute"]] as const) : []),
    ...(can("view_any_sales_team") ? ([["team", "Tim Sales"]] as const) : []),
  ];
  const [tab, setTab] = useState<string>(tabs[0]?.[0] ?? "branch");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Territory & Tim Sales"
        subtitle="Cabang (hub MileApp), region, rute / territory dan struktur SPV → salesman. Menjadi dasar cakupan data, PJP dan nomor dokumen (SO-<cabang>-…, C-<cabang>-…)."
      />
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "branch" && <BranchTab />}
      {tab === "region" && <RegionTab />}
      {tab === "route" && <RouteTab />}
      {tab === "team" && <TeamTab />}
    </div>
  );
}

/* ---------------- branches ---------------- */
function BranchTab() {
  const { branches, setBranches, regions, can, toast, addAudit } = useApp();
  const visible = useScopeBranches();
  const [edit, setEdit] = useState<Branch | null>(null);
  const canUpdate = can("update_branch");
  const rows = branches.filter((b) => visible.includes(b.id));

  return (
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground">Cabang dibuat di MileApp (hub) dan disinkronkan. Di modul hanya atribut modul yang dapat diubah (kota, region, aktif).</CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Kode</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Kota</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">Salesman</TableHead>
            <TableHead className="text-right">SPV</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b, i) => (
            <TableRow key={b.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-mono text-xs">{b.id}</TableCell>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell>{b.city}</TableCell>
              <TableCell>{regions.find((r) => r.id === b.regionId)?.name ?? "—"}</TableCell>
              <TableCell className="text-right">{SALESMEN.filter((s) => s.branchId === b.id).length}</TableCell>
              <TableCell className="text-right">{SPVS.filter((s) => s.branchId === b.id).length}</TableCell>
              <TableCell>{b.active === false ? <Badge variant="neutral">Nonaktif</Badge> : <Badge variant="success">Aktif</Badge>}</TableCell>
              <TableCell>
                {canUpdate && (
                  <button onClick={() => setEdit(b)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Ubah">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>Ubah Cabang</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="space-y-1">
                  <Label>Kode / nama (dari hub MileApp)</Label>
                  <Input disabled value={`${edit.id} · ${edit.name}`} />
                </div>
                <div className="space-y-1">
                  <Label>Kota</Label>
                  <Input value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Region</Label>
                  <Select value={edit.regionId ?? "none"} onValueChange={(v) => setEdit({ ...edit, regionId: v === "none" ? undefined : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa region</SelectItem>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <Label>Aktif</Label>
                  <Switch checked={edit.active !== false} onChange={(v) => setEdit({ ...edit, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button
                  onClick={() => {
                    setBranches((l) => l.map((x) => (x.id === edit.id ? edit : x)));
                    addAudit({ module: "Territory", action: "Cabang diubah", target: edit.name });
                    toast({ tone: "success", title: "Cabang diperbarui", desc: edit.name });
                    setEdit(null);
                  }}
                >
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- regions ---------------- */
function RegionTab() {
  const { regions, setRegions, branches, setBranches, can, toast, addAudit } = useApp();
  const [edit, setEdit] = useState<Region | null>(null);
  const [del, setDel] = useState<Region | null>(null);

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <p className="text-sm text-muted-foreground">Region mengelompokkan cabang (opsi level regional manager, AS-05).</p>
        {can("create_region") && (
          <Button className="ml-auto" onClick={() => setEdit({ id: "", name: "", branchIds: [], active: true })}>
            <Plus /> Buat Region
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {regions.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {r.branchIds.map((id) => (
                    <Badge key={id} variant="neutral">
                      {branches.find((b) => b.id === id)?.name ?? id}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{r.active ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Nonaktif</Badge>}</TableCell>
              <TableCell>
                {(can("update_region") || can("delete_region")) && (
                  <RowMenu>
                    {can("update_region") && (
                      <DropdownMenuItem onClick={() => setEdit(r)}>
                        <Pencil /> Ubah
                      </DropdownMenuItem>
                    )}
                    {can("delete_region") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDel(r)} className="text-destructive focus:text-destructive">
                          <Trash2 /> Hapus
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {regions.length === 0 && <EmptyState title="Belum ada region" desc="Buat region untuk mengelompokkan cabang." />}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Region" : "Buat Region"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="space-y-1">
                  <Label>Nama region</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="mis. Region Tengah" />
                </div>
                <div className="space-y-2">
                  <Label>Cabang</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={edit.branchIds.includes(b.id)}
                          onChange={(v) => setEdit({ ...edit, branchIds: v ? [...edit.branchIds, b.id] : edit.branchIds.filter((x) => x !== b.id) })}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Aktif</Label>
                  <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button
                  disabled={!edit.name}
                  onClick={() => {
                    const r = edit.id ? edit : { ...edit, id: `RG-${Date.now().toString().slice(-4)}` };
                    setRegions((l) => (edit.id ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r]));
                    setBranches((l) => l.map((b) => (r.branchIds.includes(b.id) ? { ...b, regionId: r.id } : b.regionId === r.id ? { ...b, regionId: undefined } : b)));
                    addAudit({ module: "Territory", action: edit.id ? "Region diubah" : "Region dibuat", target: r.name, detail: `${r.branchIds.length} cabang` });
                    toast({ tone: "success", title: edit.id ? "Region diperbarui" : "Region dibuat", desc: r.name });
                    setEdit(null);
                  }}
                >
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={!!del}
        title="Hapus Region"
        text={
          <>
            Hapus <b>{del?.name}</b>? Cabang di dalamnya menjadi tanpa region.
          </>
        }
        onClose={() => setDel(null)}
        onConfirm={() => {
          setRegions((l) => l.filter((x) => x.id !== del!.id));
          setBranches((l) => l.map((b) => (b.regionId === del!.id ? { ...b, regionId: undefined } : b)));
          addAudit({ module: "Territory", action: "Region dihapus", target: del!.name });
          toast({ tone: "danger", title: "Region dihapus", desc: del!.name });
          setDel(null);
        }}
      />
    </Card>
  );
}

/* ---------------- routes ---------------- */
function RouteTab() {
  const { routes, setRoutes, branches, outlets, can, toast, addAudit, inScope } = useApp();
  const visible = useScopeBranches();
  const [branchF, setBranchF] = useState("all");
  const [edit, setEdit] = useState<Route | null>(null);
  const [del, setDel] = useState<Route | null>(null);
  const rows = routes.filter((r) => visible.includes(r.branchId) && (branchF === "all" || r.branchId === branchF));
  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const outletCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of outlets) if (o.routeId) m.set(o.routeId, (m.get(o.routeId) ?? 0) + 1);
    return m;
  }, [outlets]);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        {visible.length > 1 && (
          <Select value={branchF} onValueChange={setBranchF}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua cabang</SelectItem>
              {visible.map((id) => (
                <SelectItem key={id} value={id}>
                  {bName(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="neutral">{rows.length} rute</Badge>
        {can("create_route") && (
          <Button className="ml-auto" onClick={() => setEdit({ id: "", code: "", name: "", branchId: visible[0] ?? "", area: "", active: true })}>
            <Plus /> Buat Rute
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Kode</TableHead>
            <TableHead>Rute / territory</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Salesman</TableHead>
            <TableHead className="text-right">Outlet</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-mono text-xs">{r.code}</TableCell>
              <TableCell>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.area}</p>
              </TableCell>
              <TableCell>{bName(r.branchId)}</TableCell>
              <TableCell>{SALESMEN.find((s) => s.id === r.salesId)?.name ?? "—"}</TableCell>
              <TableCell className="text-right">{outletCount.get(r.id) ?? 0}</TableCell>
              <TableCell>{r.active ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Nonaktif</Badge>}</TableCell>
              <TableCell>
                {(can("update_route") || can("delete_route")) && (
                  <RowMenu>
                    {can("update_route") && (
                      <DropdownMenuItem onClick={() => setEdit(r)}>
                        <Pencil /> Ubah
                      </DropdownMenuItem>
                    )}
                    {can("delete_route") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDel(r)} className="text-destructive focus:text-destructive">
                          <Trash2 /> Hapus
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah filter cabang atau buat rute baru." />}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Rute" : "Buat Rute"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="space-y-1">
                  <Label>Kode rute</Label>
                  <Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder={`${edit.branchId}-R4`} />
                </div>
                <div className="space-y-1">
                  <Label>Cabang</Label>
                  <Select value={edit.branchId} onValueChange={(v) => setEdit({ ...edit, branchId: v, salesId: undefined })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {visible.map((id) => (
                        <SelectItem key={id} value={id}>
                          {bName(id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Nama rute</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Area</Label>
                  <Input value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value })} placeholder="mis. Kawasan Industri" />
                </div>
                <div className="space-y-1">
                  <Label>Salesman</Label>
                  <Select value={edit.salesId ?? "none"} onValueChange={(v) => setEdit({ ...edit, salesId: v === "none" ? undefined : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Belum ditugaskan</SelectItem>
                      {SALESMEN.filter((s) => s.branchId === edit.branchId && inScope(s.id)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-center justify-between">
                  <Label>Aktif</Label>
                  <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button
                  disabled={!edit.code || !edit.name || !edit.branchId}
                  onClick={() => {
                    const r = edit.id ? edit : { ...edit, id: `R-${edit.branchId}-${Date.now().toString().slice(-4)}` };
                    setRoutes((l) => (edit.id ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r]));
                    addAudit({ module: "Territory", action: edit.id ? "Rute diubah" : "Rute dibuat", target: `${r.code} · ${r.name}` });
                    toast({ tone: "success", title: edit.id ? "Rute diperbarui" : "Rute dibuat", desc: r.name });
                    setEdit(null);
                  }}
                >
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDelete
        open={!!del}
        title="Hapus Rute"
        text={
          <>
            Hapus <b>{del?.name}</b>? Outlet pada rute ini menjadi tanpa rute.
          </>
        }
        onClose={() => setDel(null)}
        onConfirm={() => {
          setRoutes((l) => l.filter((x) => x.id !== del!.id));
          addAudit({ module: "Territory", action: "Rute dihapus", target: `${del!.code} · ${del!.name}` });
          toast({ tone: "danger", title: "Rute dihapus", desc: del!.name });
          setDel(null);
        }}
      />
    </Card>
  );
}

/* ---------------- sales team ---------------- */
function TeamTab() {
  const { inScope, routes, branches, can, toast, addAudit } = useApp();
  const [, force] = useState(0);
  const [edit, setEdit] = useState<{ s: Salesman; spvId: string } | null>(null);
  const rows = SALESMEN.filter((s) => inScope(s.id));
  const canUpdate = can("update_sales_team");

  return (
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground">
        Salesman berasal dari Field User MileApp. Pindah SPV berlaku mulai PJP minggu depan; peluang pipeline yang masih terbuka ikut pindah.
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Salesman</TableHead>
            <TableHead>Cabang</TableHead>
            <TableHead>Sales SPV</TableHead>
            <TableHead>Rute</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s, i) => (
            <TableRow key={s.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <p className="font-medium">{s.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{s.code}</p>
              </TableCell>
              <TableCell>{branches.find((b) => b.id === s.branchId)?.name}</TableCell>
              <TableCell>{SPVS.find((x) => x.id === s.spvId)?.name ?? "—"}</TableCell>
              <TableCell className="text-xs">
                {routes
                  .filter((r) => r.salesId === s.id)
                  .map((r) => r.code)
                  .join(", ") || "—"}
              </TableCell>
              <TableCell>
                {canUpdate && (
                  <button onClick={() => setEdit({ s, spvId: s.spvId })} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Ubah">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Tidak ada salesman" desc="Tidak ada salesman dalam cakupan data Anda." />}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>Ubah Penugasan Salesman</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <p className="text-sm">
                  <b>{edit.s.name}</b> · {edit.s.code} · {branches.find((b) => b.id === edit.s.branchId)?.name}
                </p>
                <div className="space-y-1">
                  <Label>Sales SPV</Label>
                  <Select value={edit.spvId} onValueChange={(v) => setEdit({ ...edit, spvId: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPVS.filter((x) => x.branchId === edit.s.branchId).map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button
                  disabled={edit.spvId === edit.s.spvId}
                  onClick={() => {
                    const from = SPVS.find((x) => x.id === edit.s.spvId)?.name;
                    const to = SPVS.find((x) => x.id === edit.spvId)?.name;
                    const target = SALESMEN.find((x) => x.id === edit.s.id);
                    if (target) target.spvId = edit.spvId;
                    force((n) => n + 1);
                    addAudit({ module: "Tim Sales", action: "Salesman dipindah SPV", target: edit.s.name, detail: `${from} → ${to}` });
                    toast({ tone: "success", title: "Penugasan disimpan", desc: "Penugasan berlaku mulai PJP minggu depan; pipeline terbuka ikut pindah" });
                    setEdit(null);
                  }}
                >
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
