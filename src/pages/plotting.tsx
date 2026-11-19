import { useMemo, useState } from "react";
import { ArrowRight, Download, History, Info, Search, Upload, Users2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/switch";
import { EmptyState } from "@/components/empty-state";
import { useApp, salesOf, branchOf } from "@/store/app-store";
import { SALESMEN, SEGMENT_LIST, TODAY } from "@/data/mock";
import { callsPerCycle } from "@/data/pjp-engine";
import type { Outlet } from "@/data/types";
import { cn } from "@/lib/utils";

const REASONS = ["Rotasi wilayah", "Salesman resign / cuti panjang", "Penyeimbangan beban kunjungan", "Permintaan pelanggan", "Salesman baru", "Lainnya"];
const UNPLOTTED = "__unplotted";

/**
 * Module 03 — Plotting Pelanggan: which salesman owns which outlet, on which route.
 * The plotting is the input of PJP generate (module 04); moving outlets puts them into the target salesman's PJP as Draft.
 */
export function PlottingPage() {
  const { outlets, routes, pjp, pjpHeaders, scopeSalesIds, can, toast, ownershipLog, settings } = useApp();
  const [salesF, setSalesF] = useState<string>(scopeSalesIds[0] ?? "");
  const [routeF, setRouteF] = useState("all");
  const [segF, setSegF] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [histOf, setHistOf] = useState<Outlet | null>(null);

  const scoped = useMemo(() => outlets.filter((o) => o.active && scopeSalesIds.includes(o.salesId)), [outlets, scopeSalesIds]);
  const unplotted = scoped.filter((o) => !o.routeId);
  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const loadOf = (salesId: string) => {
    const entries = pjp.filter((e) => e.salesId === salesId);
    return { outlets: scoped.filter((o) => o.salesId === salesId).length, calls: entries.reduce((a, e) => a + callsPerCycle(e), 0) };
  };

  const base = salesF === UNPLOTTED ? unplotted : scoped.filter((o) => o.salesId === salesF);
  const rows = base.filter((o) =>
    (routeF === "all" || (routeF === "none" ? !o.routeId : o.routeId === routeF)) &&
    (segF === "all" || o.segment === segF) &&
    (!q || `${o.name} ${o.code}`.toLowerCase().includes(q.toLowerCase())),
  );
  const routesOfSales = routes.filter((r) => r.salesId === salesF);
  const routeCount = (id: string) => base.filter((o) => o.routeId === id).length;
  const allChecked = rows.length > 0 && rows.every((o) => sel.has(o.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((o) => o.id)));
  const header = salesF !== UNPLOTTED ? pjpHeaders.find((h) => h.salesId === salesF) : undefined;
  const selected = outlets.filter((o) => sel.has(o.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plotting Pelanggan"
        subtitle="Tentukan salesman pemilik setiap outlet beserta rutenya. Hasil plotting menjadi dasar generate PJP dan task kunjungan di Mile Field."
        action={
          <>
            {can("import_outlet_assignment") && (
              <Button variant="outline" onClick={() => toast({ tone: "info", title: "Import plotting (Excel)", desc: "Template: kode outlet, kode salesman, kode rute, urutan rute. Baris tidak valid ditolak dengan laporan validasi." })}>
                <Upload /> Import
              </Button>
            )}
            <Button variant="outline" onClick={() => toast({ tone: "success", title: "Export Excel dibuat", desc: `plotting-pelanggan.xlsx · ${scoped.length} outlet` })}>
              <Download /> Export
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Info className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Urutan setup:</span>
          {["Territory & Tim Sales", "Plotting Pelanggan", "Assortment & Price List", settings.pjpApprovalRequired ? "PJP (generate → approval → publikasi)" : "PJP (generate → publikasi)", "Task kunjungan di Mile Field"].map((s, i, a) => (
            <span key={s} className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-0.5", i === 1 ? "bg-primary text-primary-foreground" : "bg-muted")}>{i + 1}. {s}</span>
              {i < a.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </span>
          ))}
          {settings.variant === "A" && <span className="w-full pt-1 text-xs text-muted-foreground">Varian A: plotting dikelola di modul{settings.odooWriteBackSalesperson ? " dan pemilik ditulis balik ke Odoo (res.partner.user_id)" : "; tulis balik salesperson ke Odoo dapat diaktifkan di Pengaturan"}.</span>}
        </CardContent>
      </Card>

      <Tabs defaultValue="plot">
        <TabsList>
          <TabsTrigger value="plot">Plotting</TabsTrigger>
          <TabsTrigger value="history">Riwayat Kepemilikan ({ownershipLog.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="plot" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            {/* salesman list */}
            <Card className="h-fit">
              <div className="border-b p-3 text-sm font-semibold">Salesman ({salesList.length})</div>
              <div className="mile-scroll max-h-[560px] overflow-y-auto p-2">
                <button onClick={() => { setSalesF(UNPLOTTED); setSel(new Set()); setRouteF("all"); }} className={cn("mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", salesF === UNPLOTTED ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
                  <span className="font-medium">Belum diplot ke rute</span>
                  <Badge variant={unplotted.length ? "warning" : "success"}>{unplotted.length}</Badge>
                </button>
                {salesList.map((s) => {
                  const l = loadOf(s.id);
                  return (
                    <button key={s.id} onClick={() => { setSalesF(s.id); setSel(new Set()); setRouteF("all"); }} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", salesF === s.id ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
                      <span>
                        <span className="block font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{branchOf(s.branchId).name} · {l.calls} call/siklus</span>
                      </span>
                      <Badge variant="neutral">{l.outlets}</Badge>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-semibold">{salesF === UNPLOTTED ? "Outlet belum diplot ke rute" : salesOf(salesF)?.name}</div>
                  {header && <Badge variant={header.status === "Dipublikasikan" ? "success" : header.status === "Draft" ? "warning" : "info"}>PJP v{header.version} · {header.status}</Badge>}
                  <span className="text-sm text-muted-foreground">{base.length} outlet</span>
                </div>
                {salesF !== UNPLOTTED && (
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setRouteF("all")} className={cn("rounded-full border px-3 py-1 text-xs", routeF === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>Semua rute</button>
                    {routesOfSales.map((r) => (
                      <button key={r.id} onClick={() => setRouteF(r.id)} className={cn("rounded-full border px-3 py-1 text-xs", routeF === r.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                        {r.name} · {routeCount(r.id)}
                      </button>
                    ))}
                    {base.some((o) => !o.routeId) && <button onClick={() => setRouteF("none")} className={cn("rounded-full border border-dashed px-3 py-1 text-xs", routeF === "none" ? "border-primary bg-primary text-primary-foreground" : "border-[#E45C20] text-[#BA4917]")}>Tanpa rute · {base.filter((o) => !o.routeId).length}</button>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / kode outlet" className="pl-8" />
                  </div>
                  <Select value={segF} onValueChange={setSegF}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua segmen</SelectItem>
                      {SEGMENT_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {sel.size > 0 && (
                    <div className="ml-auto flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-foreground">
                      {sel.size} outlet dipilih
                      {can("reassign_outlet") ? (
                        <Button size="sm" onClick={() => setMoveOpen(true)}><Users2 /> Pindahkan</Button>
                      ) : (
                        <span className="text-xs">(perlu permission reassign_outlet)</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={allChecked} onChange={toggleAll} title="Pilih semua" /></TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Segmen</TableHead>
                    {salesF === UNPLOTTED && <TableHead>Salesman</TableHead>}
                    <TableHead>Rute</TableHead>
                    <TableHead>Frekuensi PJP</TableHead>
                    <TableHead>Pesanan terakhir</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((o) => {
                    const entry = pjp.find((e) => e.outletId === o.id);
                    return (
                      <TableRow key={o.id} className={sel.has(o.id) ? "bg-accent/40" : undefined}>
                        <TableCell><Checkbox checked={sel.has(o.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(o.id) : n.delete(o.id); return n; })} /></TableCell>
                        <TableCell>
                          <p className="font-medium">{o.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{o.code} · {o.city}</p>
                        </TableCell>
                        <TableCell className="text-sm">{o.segment}</TableCell>
                        {salesF === UNPLOTTED && <TableCell className="text-sm">{salesOf(o.salesId).name}</TableCell>}
                        <TableCell className="text-sm">{routes.find((r) => r.id === o.routeId)?.name ?? <Badge variant="orange">Tanpa rute</Badge>}</TableCell>
                        <TableCell className="text-sm">{entry ? entry.freq : <Badge variant="neutral">Belum di PJP</Badge>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.lastOrder ?? "—"}</TableCell>
                        <TableCell>
                          <button title="Riwayat kepemilikan" onClick={() => setHistOf(o)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><History className="h-4 w-4" /></button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {rows.length > 200 && <p className="p-3 text-xs text-muted-foreground">Menampilkan 200 dari {rows.length} outlet. Persempit dengan filter.</p>}
              {rows.length === 0 && <EmptyState title="Tidak ada outlet" desc="Ubah filter atau pilih salesman lain." />}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTable />
        </TabsContent>
      </Tabs>

      {moveOpen && <MoveDialog outlets={selected} onClose={() => setMoveOpen(false)} onDone={() => { setSel(new Set()); setMoveOpen(false); }} />}
      <Dialog open={!!histOf} onOpenChange={(v) => !v && setHistOf(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0">
          <DialogHeader><DialogTitle>Riwayat kepemilikan · {histOf?.name}</DialogTitle></DialogHeader>
          <div className="p-4">{histOf && <HistoryTable outletId={histOf.id} />}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryTable({ outletId }: { outletId?: string }) {
  const { ownershipLog, outlets, routes } = useApp();
  const rows = ownershipLog.filter((l) => !outletId || l.outletId === outletId);
  const rName = (id?: string) => routes.find((r) => r.id === id)?.name ?? "—";
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu</TableHead>
            {!outletId && <TableHead>Outlet</TableHead>}
            <TableHead>Dari</TableHead>
            <TableHead>Ke</TableHead>
            <TableHead>Efektif</TableHead>
            <TableHead>Alasan</TableHead>
            <TableHead>Oleh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="whitespace-nowrap text-xs">{l.at}</TableCell>
              {!outletId && <TableCell className="text-sm">{outlets.find((o) => o.id === l.outletId)?.name}</TableCell>}
              <TableCell className="text-sm">{l.fromSalesId ? salesOf(l.fromSalesId).name : "—"}<p className="text-xs text-muted-foreground">{rName(l.fromRouteId)}</p></TableCell>
              <TableCell className="text-sm">{salesOf(l.toSalesId).name}<p className="text-xs text-muted-foreground">{rName(l.toRouteId)}</p></TableCell>
              <TableCell className="text-sm">{l.effective}</TableCell>
              <TableCell className="text-sm">{l.reason}</TableCell>
              <TableCell className="text-sm">{l.by}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Belum ada riwayat" desc="Riwayat tercatat setiap kali outlet dipindahkan ke salesman / rute lain." />}
    </Card>
  );
}

function MoveDialog({ outlets: selected, onClose, onDone }: { outlets: Outlet[]; onClose: () => void; onDone: () => void }) {
  const { scopeSalesIds, routes, pjp, opps, reassignOutlets, toast, user, roleMeta } = useApp();
  const [to, setTo] = useState("");
  const [routeId, setRouteId] = useState("none");
  const [effective, setEffective] = useState(TODAY);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const isAll = roleMeta(user?.role).scope === "all";
  const fromBranches = new Set(selected.map((o) => salesOf(o.salesId).branchId));
  // Sales Supervisor: own team (scopeSalesIds). Cross-branch only for Admin (scope "all").
  const candidates = SALESMEN.filter((s) => scopeSalesIds.includes(s.id) && (isAll || fromBranches.has(s.branchId)));
  const target = to ? salesOf(to) : undefined;
  const targetRoutes = routes.filter((r) => r.active && target && r.branchId === target.branchId && (!r.salesId || r.salesId === to));
  const crossBranch = !!target && [...fromBranches].some((b) => b !== target.branchId);
  const pjpCount = pjp.filter((e) => selected.some((o) => o.id === e.outletId)).length;
  const oppCount = opps.filter((op) => op.outletId && selected.some((o) => o.id === op.outletId) && op.stage !== "Menang" && op.stage !== "Batal").length;
  const finalReason = reason === "Lainnya" ? note.trim() : reason + (note.trim() ? ` – ${note.trim()}` : "");
  const valid = !!to && !!reason && (reason !== "Lainnya" || !!note.trim());

  const submit = () => {
    if (!valid) { setTried(true); return; }
    const r = reassignOutlets({ outletIds: selected.map((o) => o.id), toSalesId: to, toRouteId: routeId === "none" ? undefined : routeId, effective, reason: finalReason });
    toast({ tone: "success", title: `${r.moved} outlet dipindahkan ke ${target!.name}`, desc: `${r.pjpMoved} outlet masuk PJP ${target!.name} sebagai Draft (perlu approval & publikasi ulang)${r.oppsMoved ? ` · ${r.oppsMoved} pipeline ikut pindah` : ""}.` });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader><DialogTitle>Pindahkan {selected.length} outlet</DialogTitle></DialogHeader>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Salesman tujuan *</Label>
            <Select value={to} onValueChange={(v) => { setTo(v); setRouteId("none"); }}>
              <SelectTrigger className={cn(tried && !to && "border-destructive")}><SelectValue placeholder="Pilih salesman" /></SelectTrigger>
              <SelectContent>
                {candidates.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {branchOf(s.branchId).name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{isAll ? "Admin dapat memindahkan antar cabang." : "Sales Supervisor: antar salesman di tim sendiri."}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Rute tujuan</Label>
            <Select value={routeId} onValueChange={setRouteId} disabled={!to}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanpa rute (diatur nanti)</SelectItem>
                {targetRoutes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tanggal efektif *</Label>
              <Input type="date" value={effective} min={TODAY} onChange={(e) => setEffective(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className={cn(tried && !reason && "border-destructive")}><SelectValue placeholder="Pilih alasan" /></SelectTrigger>
                <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan{reason === "Lainnya" ? " *" : ""}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cn(tried && reason === "Lainnya" && !note.trim() && "border-destructive")} />
          </div>
          <div className="rounded-md border bg-muted/50 p-3 text-sm">
            <p className="font-medium">Dampak</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>Pemilik {selected.length} outlet berubah{target ? ` menjadi ${target.name}` : ""}.</li>
              <li>{pjpCount} jadwal PJP pindah ke PJP salesman tujuan sebagai <b>Draft</b>; PJP tujuan perlu approval &amp; publikasi ulang sebelum muncul di Mile Field.</li>
              <li>{oppCount} pipeline / follow-up terbuka ikut pindah. Kunjungan &amp; pesanan lama tetap tercatat atas salesman sebelumnya.</li>
              {crossBranch && <li className="text-[#BA4917]">Pindah antar cabang: cabang outlet ikut berubah.</li>}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit}>Pindahkan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
