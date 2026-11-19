import { useEffect, useMemo, useState } from "react";
import { Ban, Download, Eye, Info, MapPin, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerBadge, OrderBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CUSTOMER_STATUS_LABEL, DAYS, PRICE_GROUPS, SALESMEN, nextOutletSeq } from "@/data/mock";
import { ALL_DAYS, DAY_ABBR, isAllDays, isClosedOn, visitDaysLabel } from "@/data/pjp-engine";
import type { CustomerStatus, Outlet, Variant } from "@/data/types";
import { Checkbox } from "@/components/switch";
import { fmtDate, pct, rupiah, rupiahShort } from "@/lib/format";
import { orderTotal } from "@/lib/approval";

const SEGMENTS = ["Grosir Plastik", "Toko Kemasan", "Industri F&B", "Horeka", "Agen / Sub-distributor", "Toko Kelontong"];
const SOURCE_LABEL: Record<Outlet["source"], string> = { odoo: "Odoo (sinkron)", import: "Import Excel", noo: "NOO Mile Field", manual: "Dibuat di web" };

/** D-51: "Semua hari" or the short list of open days. */
function VisitDaysBadge({ days }: { days?: number[] }) {
  const all = !days?.length || isAllDays(days);
  return (
    <Badge variant={all ? "neutral" : "warning"} title={all ? "Bisa dikunjungi Senin–Sabtu" : `Hanya bisa dikunjungi: ${days!.map((d) => DAYS[d]).join(", ")}`}>
      {visitDaysLabel(days)}
    </Badge>
  );
}

/** Module 01 FR-009: the customer status is derived by a job, never entered manually. */
export function statusRule(s: CustomerStatus, variant: Variant) {
  if (s === "baru") return "Pelanggan Baru: prospek / NOO yang belum disetujui Finance (belum menjadi pelanggan UP).";
  if (s === "lama_belum") return "Pelanggan Lama – belum beli: NOO sudah disetujui (pelanggan aktif) tetapi belum ada pesanan " + (variant === "A" ? "yang ter-invoice di Odoo." : "berstatus Selesai di modul.");
  return "Pelanggan Lama – sudah beli: punya ≥ 1 " + (variant === "A" ? "SO Odoo yang sudah di-invoice." : "pesanan modul berstatus Selesai (atau dari import awal).");
}

function DerivedStatus({ s, variant }: { s: CustomerStatus; variant: Variant }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${statusRule(s, variant)} Diturunkan otomatis, tidak dapat diubah manual.`}>
      <CustomerBadge s={s} />
      <Info className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  );
}

function OdooTag() {
  return (
    <Badge variant="info" className="ml-1 h-4 px-1 text-[10px]" title="Dikelola di Odoo (read-only di modul)">
      Odoo
    </Badge>
  );
}

const norm = (x: string) => x.toLowerCase().replace(/^(toko plastik|toko|ud|cv|pt|grosir)\s+/, "").replace(/[^a-z0-9]/g, "");

const blank = (salesId: string): Outlet => {
  const s = salesOf(salesId);
  return {
    id: "",
    code: "",
    name: "",
    owner: "",
    phone: "",
    address: "",
    city: branchOf(s.branchId).city,
    branchId: s.branchId,
    salesId,
    status: "baru",
    segment: "Toko Kemasan",
    creditLimit: 0,
    outstanding: 0,
    overdue: 0,
    overdueDays: 0,
    top: 0,
    active: true,
    pkp: false,
    priceGroup: "Retail",
    visitDays: [...ALL_DAYS],
    source: "manual",
  };
};

export function OutletsPage() {
  const { outlets, setOutlets, setPjp, inScope, scopeSalesIds, can, toast, user, orders, settings, approvals, pjp, routes, roleMeta, addAudit } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | CustomerStatus>("all");
  const [branch, setBranch] = useState("all");
  const [detail, setDetail] = useState<Outlet | null>(null);
  const [edit, setEdit] = useState<Outlet | null>(null);
  const [del, setDel] = useState<Outlet | null>(null);
  const [dups, setDups] = useState<Outlet[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const showBranch = roleMeta(user!.role).scope === "all";
  const A = settings.variant === "A";
  const fromOdoo = (o: Outlet) => A && (o.source === "odoo" || !!o.odooRef);
  /** PRD FR-005: outlets with visits, orders or approvals are deactivated, never deleted (A: Odoo outlets too). */
  const txReasons = (o: Outlet) => {
    const r: string[] = [];
    if (orders.some((x) => x.outletId === o.id) || o.lastOrder) r.push("pesanan");
    if (approvals.some((a) => a.outletId === o.id || a.outletName === o.name)) r.push("approval");
    if (pjp.some((e) => e.outletId === o.id)) r.push("kunjungan / PJP");
    if (fromOdoo(o)) r.push("berasal dari Odoo");
    return r;
  };
  const canEditCredit = A ? false : can("update_credit_limit");
  const lockOdoo = !!edit && !!edit.id && fromOdoo(edit);
  const lockCredit = A ? lockOdoo : !canEditCredit;

  const rows = useMemo(
    () =>
      outlets.filter(
        (o) =>
          inScope(o.salesId) &&
          (showInactive || o.active) &&
          (status === "all" || o.status === status) &&
          (branch === "all" || o.branchId === branch) &&
          (q === "" || `${o.name} ${o.code} ${o.owner}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [outlets, inScope, status, branch, q, showInactive]
  );
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, branch, q, showInactive]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  const offset = (curPage - 1) * PAGE_SIZE;
  const shown = rows.slice(offset, offset + PAGE_SIZE);
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of outlets) if (o.active && inScope(o.salesId)) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [outlets, inScope]);
  const totalOut = rows.reduce((a, o) => a + o.outstanding, 0);
  const totalOverdue = rows.reduce((a, o) => a + (o.overdueDays > settings.overdueDays ? o.overdue : 0), 0);

  const persist = (o: Outlet) => {
    if (!o.id) {
      const seq = nextOutletSeq();
      const branchId = salesOf(o.salesId).branchId;
      const n = { ...o, id: `O${seq}`, branchId, code: `C-${branchId}-${String(seq).padStart(4, "0")}` };
      setOutlets((l) => [n, ...l]);
      addAudit({ module: "Outlet", action: "Outlet dibuat", target: n.code, detail: n.name });
      toast({ tone: "success", title: "Outlet dibuat", desc: `${n.name} · status Pelanggan Baru (diturunkan otomatis)${A ? " · menjadi pelanggan Odoo lewat jalur NOO + approval" : ""}` });
    } else {
      const n = { ...o, branchId: salesOf(o.salesId).branchId };
      const prev = outlets.find((x) => x.id === o.id);
      const daysChanged = visitDaysLabel(prev?.visitDays) !== visitDaysLabel(n.visitDays);
      setOutlets((l) => l.map((x) => (x.id === o.id ? n : x)));
      addAudit({ module: "Outlet", action: "Outlet diubah", target: n.code, detail: daysChanged ? `${n.name} · hari kunjungan ${visitDaysLabel(prev?.visitDays)} → ${visitDaysLabel(n.visitDays)}` : n.name });
      toast({ tone: "success", title: "Outlet diperbarui", desc: n.name });
      // D-51: PJP entries on a now-closed day are flagged, not moved.
      const conflicts = daysChanged ? pjp.filter((e) => e.outletId === n.id && isClosedOn(n, e.day)) : [];
      if (conflicts.length)
        toast({ tone: "warning", title: `${conflicts.length} entri PJP di hari tutup`, desc: `${n.name} tutup di hari ${[...new Set(conflicts.map((e) => DAYS[e.day]))].join(", ")}. Entri ditandai "Outlet tutup" di PJP (tidak dipindah otomatis).` });
    }
    setEdit(null);
    setDups(null);
  };

  /** PRD FR-006: same NPWP, same phone, or similar name in the same city (stand-in for "within 50 m of the GPS pin"). Flag, never auto-merge. */
  const save = () => {
    if (!edit) return;
    const phone = edit.phone.replace(/\D/g, "");
    const cands = outlets.filter(
      (o) =>
        o.id !== edit.id &&
        ((edit.npwp && o.npwp && o.npwp === edit.npwp) ||
          (phone.length >= 8 && o.phone.replace(/\D/g, "") === phone) ||
          (o.city === edit.city && norm(edit.name).length >= 4 && (norm(o.name).includes(norm(edit.name)) || norm(edit.name).includes(norm(o.name)))))
    );
    if (cands.length) setDups(cands.slice(0, 5));
    else persist(edit);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Outlet / Pelanggan"
        subtitle="Master outlet dengan status pembelian, limit kredit dan ringkasan piutang."
        action={
          <>
            {can("import_outlet") && (
              <Button variant="outline" onClick={() => toast({ tone: "info", title: "Import outlet", desc: settings.variant === "A" ? "Di Varian A master pelanggan disinkronkan dari Odoo; import hanya untuk data tambahan (segmen, sales)." : "Buka menu Import / Export Excel untuk import massal." })}>
                <Upload /> Import
              </Button>
            )}
            {can("export_outlet") && (
              <Button variant="outline" onClick={() => toast({ tone: "success", title: "Export Excel dibuat", desc: `outlet-${new Date().getTime().toString().slice(-5)}.xlsx · ${rows.length} baris` })}>
                <Download /> Export
              </Button>
            )}
            {can("create_outlet") && (
              <Button onClick={() => setEdit(blank(scopeSalesIds[0]))}>
                <Plus /> Buat Outlet
              </Button>
            )}
          </>
        }
      />

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" /> Status pelanggan diturunkan otomatis dari riwayat NOO dan pesanan ({A ? "A: SO ter-invoice di Odoo" : "B: pesanan Selesai di modul"}); arahkan kursor ke status untuk aturannya.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
          <Card key={s} className="cursor-pointer" onClick={() => setStatus(status === s ? "all" : s)}>
            <CardContent className={`flex items-center justify-between p-4 ${status === s ? "rounded-lg ring-2 ring-primary" : ""}`}>
              <DerivedStatus s={s} variant={settings.variant} />
              <span className="text-xl font-bold">{statusCounts[s] ?? 0}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="relative w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari nama, kode, pemilik..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {CUSTOMER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showBranch && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua cabang</SelectItem>
                {BRANCHES.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={showInactive} onChange={setShowInactive} /> Tampilkan nonaktif
          </label>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{rows.length} outlet</Badge>
            <Badge variant="info">Piutang {rupiahShort(totalOut)}</Badge>
            <Badge variant="danger">
              Jatuh tempo &gt; {settings.overdueDays} hr {rupiahShort(totalOverdue)}
            </Badge>
          </div>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Hari kunjungan</TableHead>
              <TableHead className="text-right">Limit kredit</TableHead>
              <TableHead className="text-right">Piutang</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((o, i) => (
              <TableRow key={o.id} className={`cursor-pointer ${o.active ? "" : "opacity-60"}`} onClick={() => setDetail(o)}>
                <TableCell>{offset + i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">
                    {o.name} {!o.active && <Badge variant="neutral">Nonaktif</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.code} · {o.segment} · {o.city}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{salesOf(o.salesId).name}</p>
                  <p className="text-xs text-muted-foreground">{branchOf(o.branchId).name}</p>
                </TableCell>
                <TableCell>
                  <DerivedStatus s={o.status} variant={settings.variant} />
                </TableCell>
                <TableCell>
                  <VisitDaysBadge days={o.visitDays} />
                </TableCell>
                <TableCell className="text-right">{o.creditLimit ? rupiah(o.creditLimit) : "—"}</TableCell>
                <TableCell className="text-right">
                  <p>{o.outstanding ? rupiah(o.outstanding) : "—"}</p>
                  {o.overdueDays > 0 && (
                    <p className={`text-xs ${o.overdueDays > settings.overdueDays ? "font-semibold text-[#BF2130]" : "text-[#9E7700]"}`}>
                      {rupiahShort(o.overdue)} lewat {o.overdueDays} hr
                    </p>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(o)}>
                        <Eye /> Lihat detail
                      </DropdownMenuItem>
                      {can("update_outlet") && (
                        <DropdownMenuItem onClick={() => setEdit(o)}>
                          <Pencil /> Ubah
                        </DropdownMenuItem>
                      )}
                      {can("delete_outlet") && (
                        <>
                          <DropdownMenuSeparator />
                          {o.active ? (
                            <DropdownMenuItem onClick={() => setDel(o)} className="text-destructive focus:text-destructive">
                              {txReasons(o).length ? <Ban /> : <Trash2 />} {txReasons(o).length ? "Nonaktifkan" : "Hapus"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                setOutlets((l) => l.map((x) => (x.id === o.id ? { ...x, active: true } : x)));
                                addAudit({ module: "Outlet", action: "Outlet diaktifkan kembali", target: o.code, detail: o.name });
                                toast({ tone: "success", title: "Outlet diaktifkan kembali", desc: o.name });
                              }}
                            >
                              <RotateCcw /> Aktifkan kembali
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah filter atau kata kunci pencarian." />}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              Menampilkan {offset + 1}–{offset + shown.length} dari {rows.length} outlet
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                Sebelumnya
              </Button>
              <span>
                Hal. {curPage} / {pageCount}
              </span>
              <Button size="sm" variant="outline" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* detail */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Outlet</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">{detail.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {detail.code} {detail.odooRef && `· Odoo ${detail.odooRef}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!detail.active && <Badge variant="neutral">Nonaktif</Badge>}
                    <DerivedStatus s={detail.status} variant={settings.variant} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {[
                    ["Pemilik", detail.owner],
                    ["Telepon", detail.phone],
                    ["Alamat", `${detail.address}, ${detail.city}`],
                    ["Segmen", detail.segment],
                    ["Sales", salesOf(detail.salesId).name],
                    ["Cabang", branchOf(detail.branchId).name],
                    ["TOP", detail.top ? `${detail.top} hari` : "—"],
                    ["Order terakhir", detail.lastOrder ? fmtDate(detail.lastOrder) : "—"],
                    ["NPWP / PKP", detail.npwp ? `${detail.npwp} · ${detail.pkp ? "PKP" : "non-PKP"}` : "—"],
                    ["Price group", detail.priceGroup],
                    ["Rute", routes.find((r) => r.id === detail.routeId)?.name ?? "—"],
                    ["Hari kunjungan", <VisitDaysBadge days={detail.visitDays} />],
                    ["Sumber data", SOURCE_LABEL[detail.source]],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />
                  {detail.gps ? (
                    <a className="text-primary underline" href={`https://maps.google.com/?q=${detail.gps.lat},${detail.gps.lng}`} target="_blank" rel="noreferrer">
                      GPS pin {detail.gps.lat}, {detail.gps.lng}
                    </a>
                  ) : (
                    <span className="text-[#BF2130]">GPS pin belum ada — wajib untuk outlet aktif (geofence kunjungan)</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{statusRule(detail.status, settings.variant)}</p>
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Ringkasan piutang <span className="font-normal text-muted-foreground">· per {A ? "17 Nov 2026 10:00 (Odoo, sinkron per jam)" : "16 Nov 2026 17:02 (import Finance)"}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["Limit kredit", rupiah(detail.creditLimit)],
                      ["Saldo piutang", rupiah(detail.outstanding)],
                      ["Sisa limit", rupiah(Math.max(0, detail.creditLimit - detail.outstanding))],
                      ["Jatuh tempo", detail.overdue ? `${rupiah(detail.overdue)} (${detail.overdueDays} hr)` : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-muted p-3">
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="break-words text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  {detail.creditLimit > 0 && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E8E8E8]">
                      <div className={`h-full ${pct(detail.outstanding, detail.creditLimit) > 90 ? "bg-[#DC3545]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct(detail.outstanding, detail.creditLimit))}%` }} />
                    </div>
                  )}
                  {detail.overdueDays > settings.overdueDays && (
                    <p className="mt-2 rounded-md bg-[#FAE5E7] p-2 text-xs text-[#68121A]">
                      Piutang jatuh tempo &gt; {settings.overdueDays} hari: pesanan baru wajib melalui Approval Kelonggaran Limit Kredit.
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Pesanan terbaru</p>
                  {orders.filter((o) => o.outletId === detail.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada pesanan dari Mile Field.</p>
                  ) : (
                    orders
                      .filter((o) => o.outletId === detail.id)
                      .map((o) => (
                        <div key={o.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                          <span>
                            {o.no} · {fmtDate(o.date)}
                          </span>
                          <span className="flex items-center gap-2">
                            {rupiah(orderTotal(o))} <OrderBadge s={o.status} />
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
              {can("update_outlet") && detail.active && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetail(null)}>
                    Tutup
                  </Button>
                  <Button
                    onClick={() => {
                      setEdit(detail);
                      setDetail(null);
                    }}
                  >
                    <Pencil /> Ubah
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* create / edit */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Outlet" : "Buat Outlet"}</DialogTitle>
              </DialogHeader>
              <div className="mile-scroll grid max-h-[70vh] grid-cols-2 gap-4 overflow-y-auto p-4">
                {lockOdoo && (
                  <p className="col-span-2 rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-2 text-xs text-[#01496A]">
                    Varian A: field bertanda <b>Odoo</b> dikelola di Odoo (res.partner) dan read-only di modul. Yang dapat diubah di modul: segmen, rute, sales, GPS pin.
                  </p>
                )}
                <div className="col-span-2 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Status pelanggan (otomatis):</span>
                  <DerivedStatus s={edit.status} variant={settings.variant} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Nama outlet {lockOdoo && <OdooTag />}</Label>
                  <Input disabled={lockOdoo} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Toko Plastik ..." />
                </div>
                <div className="space-y-1">
                  <Label>Pemilik</Label>
                  <Input value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Telepon</Label>
                  <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Alamat {lockOdoo && <OdooTag />}</Label>
                  <Input disabled={lockOdoo} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>GPS pin (lat, lng)</Label>
                  <Input
                    value={edit.gps ? `${edit.gps.lat}, ${edit.gps.lng}` : ""}
                    placeholder="-7.2575, 112.7521"
                    onChange={(e) => {
                      const [la, ln] = e.target.value.split(",").map((x) => Number(x.trim()));
                      setEdit({ ...edit, gps: Number.isFinite(la) && Number.isFinite(ln) && e.target.value.includes(",") ? { lat: la, lng: ln } : undefined });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Segmen / channel</Label>
                  <Select value={edit.segment} onValueChange={(v) => setEdit({ ...edit, segment: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEGMENTS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>NPWP {lockOdoo && <OdooTag />}</Label>
                  <Input disabled={lockOdoo} value={edit.npwp ?? ""} placeholder="00.000.000.0-000.000" onChange={(e) => setEdit({ ...edit, npwp: e.target.value || undefined })} />
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Checkbox checked={edit.pkp} disabled={lockOdoo} onChange={(v) => setEdit({ ...edit, pkp: v })} />
                  <span className="text-sm">PKP (Pengusaha Kena Pajak)</span>
                </div>
                <div className="space-y-1">
                  <Label>Sales</Label>
                  <Select value={edit.salesId} disabled={outlets.some((o) => o.id === edit.id)} onValueChange={(v) => setEdit({ ...edit, salesId: v, routeId: undefined })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALESMEN.filter((s) => scopeSalesIds.includes(s.id)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {branchOf(s.branchId).name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {outlets.some((o) => o.id === edit.id) && <p className="text-xs text-muted-foreground">Ubah pemilik lewat menu Plotting Pelanggan (PJP &amp; pipeline ikut pindah, tercatat di riwayat).</p>}
                </div>
                <div className="space-y-1">
                  <Label>Rute / territory</Label>
                  <Select value={edit.routeId ?? "none"} onValueChange={(v) => setEdit({ ...edit, routeId: v === "none" ? undefined : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Belum ada rute —</SelectItem>
                      {routes
                        .filter((r) => r.branchId === salesOf(edit.salesId).branchId && r.active && (!r.salesId || r.salesId === edit.salesId))
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.code} · {r.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Hari kunjungan</Label>
                  <div className="flex flex-wrap gap-1">
                    {DAY_ABBR.map((d, di) => {
                      const days = edit.visitDays?.length ? edit.visitDays : ALL_DAYS;
                      const on = days.includes(di);
                      return (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          title={on ? `${DAYS[di]}: bisa dikunjungi` : `${DAYS[di]}: outlet tutup`}
                          onClick={() => {
                            const next = on ? days.filter((x) => x !== di) : [...days, di].sort();
                            if (next.length) setEdit({ ...edit, visitDays: next });
                            else toast({ tone: "warning", title: "Minimal satu hari kunjungan" });
                          }}
                        >
                          {d}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Hari outlet bisa dikunjungi (default semua hari). PJP hanya menawarkan hari ini; extra call di hari tutup tetap boleh.</p>
                </div>
                <div className="space-y-1">
                  <Label>
                    Price group {lockOdoo && <OdooTag />}
                  </Label>
                  <Select disabled={lockCredit} value={edit.priceGroup} onValueChange={(v) => setEdit({ ...edit, priceGroup: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Limit kredit (Rp) {lockOdoo && <OdooTag />}</Label>
                  <Input type="number" disabled={lockCredit} value={edit.creditLimit} onChange={(e) => setEdit({ ...edit, creditLimit: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>TOP (hari) {lockOdoo && <OdooTag />}</Label>
                  <Input type="number" disabled={lockCredit} value={edit.top} onChange={(e) => setEdit({ ...edit, top: Number(e.target.value) })} />
                </div>
                {!A && !canEditCredit && (
                  <p className="col-span-2 text-xs text-muted-foreground">Limit kredit, TOP dan price group hanya dapat diubah pemegang permission <code className="font-mono">update_credit_limit</code> (default Finance).</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button onClick={save} disabled={!edit.name}>
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* delete / deactivate (PRD FR-005) */}
      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>{del && txReasons(del).length ? "Nonaktifkan Outlet" : "Hapus Outlet"}</DialogTitle>
          </DialogHeader>
          {del &&
            (txReasons(del).length ? (
              <div className="space-y-2 p-4 text-sm">
                <p>
                  <b>{del.name}</b> sudah punya transaksi ({txReasons(del).join(", ")}) sehingga tidak dihapus fisik. Outlet akan <b>dinonaktifkan</b>, dikeluarkan dari PJP dan Data Source Mile Field; riwayat tetap tersimpan.
                </p>
              </div>
            ) : (
              <p className="p-4 text-sm">
                Hapus <b>{del.name}</b> dari master outlet? Outlet juga dihapus dari PJP.
              </p>
            ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!del) return;
                const deactivate = txReasons(del).length > 0;
                if (deactivate) setOutlets((l) => l.map((x) => (x.id === del.id ? { ...x, active: false } : x)));
                else setOutlets((l) => l.filter((x) => x.id !== del.id));
                setPjp((l) => l.filter((x) => x.outletId !== del.id));
                addAudit({ module: "Outlet", action: deactivate ? "Outlet dinonaktifkan" : "Outlet dihapus", target: del.code, detail: del.name });
                toast({ tone: "danger", title: deactivate ? "Outlet dinonaktifkan" : "Outlet dihapus", desc: del.name });
                setDel(null);
              }}
            >
              {del && txReasons(del).length ? "Nonaktifkan" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* duplicate check (PRD FR-006) */}
      <Dialog open={!!dups} onOpenChange={(v) => !v && setDups(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Kemungkinan Duplikat</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 p-4 text-sm">
            <p>Ditemukan outlet dengan NPWP / telepon sama atau nama mirip di lokasi berdekatan (radius 50 m). Data tidak digabung otomatis.</p>
            {dups?.map((d) => (
              <div key={d.id} className="rounded-md border border-[#FFDA6B] bg-[#FFF4D1] p-2">
                <p className="font-medium">
                  {d.name} <span className="text-xs text-muted-foreground">· {d.code}</span>
                </p>
                <p className="text-xs text-[#6B5000]">
                  {d.address}, {d.city} · {d.phone} {d.npwp && `· NPWP ${d.npwp}`} · {salesOf(d.salesId).name}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDups(null)}>
              Batal
            </Button>
            <Button onClick={() => edit && persist(edit)}>{edit?.id ? "Tetap simpan" : "Tetap simpan sebagai outlet baru"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
