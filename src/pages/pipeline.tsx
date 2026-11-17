import { useMemo, useState } from "react";
import { CalendarClock, Check, ChevronRight, Hourglass, Kanban, List, MoreHorizontal, Plus, Trash2, Eye } from "lucide-react";
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
import { StageBadge } from "@/components/status-badge";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BATAL_REASONS, SALESMEN, TODAY, addDays, nextOppId } from "@/data/mock";
import type { FollowKind, Opportunity, OppStage, OppType } from "@/data/types";
import { fmtDate, nowStamp, rupiah, rupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGES: OppStage[] = ["Prospek", "Dijadwalkan", "Kunjungan & Negosiasi", "Menang", "Batal"];
const FLOW: OppStage[] = ["Prospek", "Dijadwalkan", "Kunjungan & Negosiasi"];
const TYPES: OppType[] = ["Pelanggan Baru (NOO)", "Pelanggan Lama – produk baru", "Pelanggan Lama – proyek"];
const KINDS: FollowKind[] = ["Kunjungan", "Telepon", "Kirim penawaran"];

function Stepper({ opp }: { opp: Opportunity }) {
  const idx = opp.stage === "Menang" || opp.stage === "Batal" ? 3 : FLOW.indexOf(opp.stage);
  const steps = [...FLOW, opp.stage === "Batal" ? "Batal" : "Menang"];
  return (
    <div className="flex items-center gap-1 overflow-x-auto mile-scroll pb-1">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
                active && (s === "Batal" ? "bg-[#DC3545] text-white" : s === "Menang" ? "bg-[#198754] text-white" : "bg-primary text-white"),
                done && "bg-accent text-accent-foreground",
                !active && !done && "bg-muted text-muted-foreground"
              )}
            >
              {done && <Check className="h-3.5 w-3.5" />}
              {i + 1}. {s === "Menang" ? "Menang / Batal" : s}
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

export function PipelinePage() {
  const { opps, setOpps, inScope, scopeSalesIds, can, moveOpp, toast, settings, user, createOpp, approvals, outlets } = useApp();
  const [followFilter, setFollowFilter] = useState<"all" | "late" | "today" | "week">("all");
  const [delOpp, setDelOpp] = useState<Opportunity | null>(null);
  const nooOf = (o: Opportunity) => approvals.find((a) => a.type === "noo" && a.oppId === o.id);
  const nooLabel = (o: Opportunity) => {
    const a = nooOf(o);
    if (!a) return o.outletId && outlets.find((x) => x.id === o.outletId)?.status !== "baru" ? "NOO disetujui" : null;
    if (a.status === "approved") return "NOO disetujui";
    if (a.status === "rejected") return "NOO ditolak";
    return `NOO: menunggu ${a.steps.find((s) => s.status === "pending")?.label.includes("Finance") ? "Finance" : "SPV"}`;
  };
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [salesFilter, setSalesFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [batal, setBatal] = useState<{ id: string; reason: string; other: string } | null>(null);
  const [create, setCreate] = useState<Opportunity | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const types = settings.existingCustomerPipeline ? TYPES : TYPES.slice(0, 1);

  const rows = useMemo(
    () =>
      opps
        .filter((o) => inScope(o.salesId) && (salesFilter === "all" || o.salesId === salesFilter) && (typeFilter === "all" || o.type === typeFilter))
        .filter((o) => {
          if (followFilter === "all") return true;
          if (o.stage === "Menang" || o.stage === "Batal") return false;
          if (followFilter === "late") return o.nextDate < TODAY;
          if (followFilter === "today") return o.nextDate === TODAY;
          return o.nextDate >= TODAY && o.nextDate <= addDays(TODAY, 7);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [opps, inScope, salesFilter, typeFilter, followFilter]
  );
  const detail = opps.find((o) => o.id === detailId) ?? null;
  const canEdit = can("update_opportunity");

  const requestMove = (id: string, stage: OppStage) => {
    const o = opps.find((x) => x.id === id);
    if (!o || o.stage === stage) return;
    if (o.pendingStage) {
      toast({ tone: "warning", title: "Masih menunggu approval", desc: `Perpindahan ke ${o.pendingStage} belum diputuskan SPV.` });
      return;
    }
    if (stage === "Batal") setBatal({ id, reason: BATAL_REASONS[0], other: "" });
    else moveOpp(id, stage);
  };

  const card = (o: Opportunity) => {
    const late = o.nextDate < TODAY && o.stage !== "Menang" && o.stage !== "Batal";
    return (
      <div
        key={o.id}
        draggable={canEdit}
        onDragStart={() => setDragId(o.id)}
        onClick={() => setDetailId(o.id)}
        className="cursor-pointer space-y-2 rounded-md border border-border bg-background p-3 shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{o.name}</p>
          {o.pendingStage && (
            <span title={`Menunggu approval ke ${o.pendingStage}`}>
              <Hourglass className="h-4 w-4 shrink-0 text-[#E45C20]" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant={o.type === "Pelanggan Baru (NOO)" ? "info" : "orange"}>{o.type}</Badge>
          {o.stage !== "Menang" && o.stage !== "Batal" && nooLabel(o) && <Badge variant={nooLabel(o) === "NOO disetujui" ? "success" : "warning"}>{nooLabel(o)}</Badge>}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">{rupiahShort(o.value)}</span>
          <span className="text-muted-foreground">{salesOf(o.salesId).name}</span>
        </div>
        {o.stage === "Batal" ? (
          <p className="text-xs text-[#BF2130]">Alasan: {o.batalReason}</p>
        ) : o.stage !== "Menang" ? (
          <p className={cn("flex items-center gap-1 text-xs", late ? "font-semibold text-[#BF2130]" : "text-muted-foreground")}>
            <CalendarClock className="h-3.5 w-3.5" /> {o.nextKind} · {fmtDate(o.nextDate)} {late && "(terlambat)"}
          </p>
        ) : (
          <p className="text-xs text-[#198754]">Pesanan pertama disetujui</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        subtitle={
          <>
            4 tahap sederhana: Prospek → Dijadwalkan → Kunjungan &amp; Negosiasi → Menang / Batal.{" "}
            {settings.pipelineStageApproval ? (
              <b className="text-[#BA4917]">Approval SPV per tahap aktif (setiap perpindahan).</b>
            ) : settings.pipelineBatalApproval ? (
              "NOO dibuat di tahap Prospek (approval SPV → Finance); Menang = pesanan pertama disetujui; Batal perlu approval SPV."
            ) : (
              "NOO dibuat di tahap Prospek (approval SPV → Finance); Menang = pesanan pertama disetujui; perpindahan tahap lain bebas."
            )}
          </>
        }
        action={
          <>
            <div className="flex rounded-md border border-border p-0.5">
              <button onClick={() => setView("kanban")} className={cn("flex h-[31px] items-center gap-1 rounded-sm px-3 text-sm", view === "kanban" ? "bg-accent text-[#016C9D]" : "text-muted-foreground")}>
                <Kanban className="h-4 w-4" /> Kanban
              </button>
              <button onClick={() => setView("list")} className={cn("flex h-[31px] items-center gap-1 rounded-sm px-3 text-sm", view === "list" ? "bg-accent text-[#016C9D]" : "text-muted-foreground")}>
                <List className="h-4 w-4" /> List
              </button>
            </div>
            {can("create_opportunity") && (
              <Button
                onClick={() =>
                  setCreate({
                    id: "",
                    name: "",
                    contact: "",
                    city: branchOf(salesOf(scopeSalesIds[0]).branchId).city,
                    type: "Pelanggan Baru (NOO)",
                    salesId: scopeSalesIds[0],
                    stage: "Prospek",
                    value: 10_000_000,
                    nextDate: addDays(TODAY, 2),
                    nextKind: "Kunjungan",
                    createdAt: TODAY,
                    log: [],
                  })
                }
              >
                <Plus /> Buat Peluang
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <Select value={salesFilter} onValueChange={setSalesFilter}>
          <SelectTrigger className="w-[260px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua sales ({salesList.length})</SelectItem>
            {salesList.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[260px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis peluang</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={followFilter} onValueChange={(v) => setFollowFilter(v as typeof followFilter)}>
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua follow-up</SelectItem>
            <SelectItem value="late">Terlambat</SelectItem>
            <SelectItem value="today">Hari ini</SelectItem>
            <SelectItem value="week">7 hari ke depan</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} peluang · {rupiahShort(rows.filter((o) => o.stage !== "Batal").reduce((a, o) => a + o.value, 0))}
        </span>
      </div>

      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-2 mile-scroll">
          {STAGES.map((col) => {
            const items = rows.filter((o) => o.stage === col);
            return (
              <div
                key={col}
                className="flex w-[264px] shrink-0 flex-col"
                onDragOver={(e) => canEdit && e.preventDefault()}
                onDrop={() => {
                  if (dragId) requestMove(dragId, col);
                  setDragId(null);
                }}
              >
                <div className="mb-2 flex items-center justify-between rounded-md bg-muted px-3 py-2">
                  <span className="text-sm font-semibold">{col}</span>
                  <span className="text-xs text-muted-foreground">
                    <b className="text-foreground">{items.length}</b> · {rupiahShort(items.reduce((a, o) => a + o.value, 0))}
                  </span>
                </div>
                <div className="flex min-h-[120px] flex-col gap-2 rounded-md">
                  {items.map(card)}
                  {items.length === 0 && <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Tidak ada data</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Peluang</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Tahap</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead className="text-right">Estimasi nilai</TableHead>
                <TableHead>Follow-up berikutnya</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o, i) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetailId(o.id)}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.contact} · {o.city}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{o.type}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StageBadge s={o.stage} />
                      {o.pendingStage && <Hourglass className="h-4 w-4 text-[#E45C20]" />}
                    </div>
                  </TableCell>
                  <TableCell>{salesOf(o.salesId).name}</TableCell>
                  <TableCell className="text-right">{rupiah(o.value)}</TableCell>
                  <TableCell className={cn("text-sm", o.nextDate < TODAY && o.stage !== "Menang" && o.stage !== "Batal" && "font-semibold text-[#BF2130]")}>
                    {o.stage === "Menang" || o.stage === "Batal" ? "—" : `${o.nextKind} · ${fmtDate(o.nextDate)}`}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(o.id)}>
                          <Eye /> Lihat detail
                        </DropdownMenuItem>
                        {can("delete_opportunity") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDelOpp(o)}
                            >
                              <Trash2 /> Hapus
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* detail */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Peluang</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div>
                  <p className="text-lg font-bold">{detail.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {detail.type} · {salesOf(detail.salesId).name} · {branchOf(salesOf(detail.salesId).branchId).name}
                  </p>
                </div>
                <Stepper opp={detail} />
                {detail.outletId && (
                  <p className="rounded-md bg-muted p-2 text-xs">
                    Outlet: <b>{outlets.find((x) => x.id === detail.outletId)?.code}</b> · {nooLabel(detail) ?? "pelanggan terdaftar"}
                    {detail.stage !== "Menang" && detail.stage !== "Batal" && " · otomatis Menang saat pesanan pertama disetujui"}
                  </p>
                )}
                {detail.pendingStage && (
                  <p className="rounded-md bg-[#FCEEE8] p-2 text-xs text-[#8D3711]">
                    Menunggu approval SPV untuk pindah ke <b>{detail.pendingStage}</b> (halaman Approval Tahap Pipeline).
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Estimasi nilai (Rp)</Label>
                    <Input
                      type="number"
                      disabled={!canEdit}
                      value={detail.value}
                      onChange={(e) => setOpps((l) => l.map((x) => (x.id === detail.id ? { ...x, value: Number(e.target.value) } : x)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Kontak</Label>
                    <Input disabled value={detail.contact} />
                  </div>
                  <div className="space-y-1">
                    <Label>Follow-up berikutnya</Label>
                    <Input
                      type="date"
                      disabled={!canEdit}
                      value={detail.nextDate}
                      onChange={(e) => setOpps((l) => l.map((x) => (x.id === detail.id ? { ...x, nextDate: e.target.value } : x)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Jenis follow-up</Label>
                    <Select disabled={!canEdit} value={detail.nextKind} onValueChange={(v) => setOpps((l) => l.map((x) => (x.id === detail.id ? { ...x, nextKind: v as FollowKind } : x)))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Follow-up jenis "Kunjungan" otomatis masuk call plan sebagai extra call. Telepon / penawaran hanya tampil sebagai pengingat.</p>
                {canEdit && detail.stage !== "Menang" && detail.stage !== "Batal" && (
                  <div className="flex flex-wrap gap-2">
                    {FLOW.indexOf(detail.stage) < 2 && (
                      <Button size="sm" onClick={() => requestMove(detail.id, FLOW[FLOW.indexOf(detail.stage) + 1])}>
                        Lanjut ke {FLOW[FLOW.indexOf(detail.stage) + 1]}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="border-[#198754] text-[#198754] hover:bg-[#D8F8E9] hover:text-[#115A38]" onClick={() => requestMove(detail.id, "Menang")}>
                      Menang
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#DC3545] text-[#DC3545] hover:bg-[#FAE5E7] hover:text-[#68121A]" onClick={() => requestMove(detail.id, "Batal")}>
                      Batal
                    </Button>
                  </div>
                )}
                {detail.stage === "Batal" && <p className="text-sm">Alasan batal: <b>{detail.batalReason}</b></p>}
                <div>
                  <p className="mb-2 text-sm font-semibold">Riwayat</p>
                  <div className="space-y-2 border-l-2 border-[#E8E8E8] pl-3">
                    {[...detail.log].reverse().map((l, i) => (
                      <div key={i} className="text-xs">
                        <p className="font-medium text-foreground">{l.text}</p>
                        <p className="text-muted-foreground">
                          {fmtDate(l.at)} · {l.by}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* batal reason */}
      <Dialog open={!!batal} onOpenChange={(v) => !v && setBatal(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Tandai Batal</DialogTitle>
          </DialogHeader>
          {batal && (
            <div className="space-y-4 p-4">
              <div className="space-y-1">
                <Label>Alasan batal</Label>
                <Select value={batal.reason} onValueChange={(v) => setBatal({ ...batal, reason: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BATAL_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {batal.reason === "Lainnya" && <Textarea placeholder="Tulis alasan..." value={batal.other} onChange={(e) => setBatal({ ...batal, other: e.target.value })} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatal(null)}>
              Kembali
            </Button>
            <Button
              variant="destructive"
              disabled={batal?.reason === "Lainnya" && !batal.other}
              onClick={() => {
                if (!batal) return;
                moveOpp(batal.id, "Batal", batal.reason === "Lainnya" ? `Lainnya: ${batal.other}` : batal.reason);
                setBatal(null);
              }}
            >
              Simpan Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={!!delOpp} onOpenChange={(v) => !v && setDelOpp(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus Peluang</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus <b>{delOpp?.name}</b> dari pipeline? Riwayat peluang ikut terhapus.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpp(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!delOpp) return;
                setOpps((l) => l.filter((x) => x.id !== delOpp.id));
                toast({ tone: "danger", title: "Peluang dihapus", desc: delOpp.name });
                setDelOpp(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* create */}
      <Dialog open={!!create} onOpenChange={(v) => !v && setCreate(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Buat Peluang</DialogTitle>
          </DialogHeader>
          {create && (
            <div className="grid grid-cols-2 gap-4 p-4">
              {create.type === "Pelanggan Baru (NOO)" && (
                <p className="col-span-2 rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-2 text-xs text-[#01496A]">
                  Jenis Pelanggan Baru: NOO dibuat di tahap Prospek (outlet prospek berstatus Pelanggan Baru + Approval NOO SPV → Finance). Jalur utama tetap registrasi NOO dari Mile Field.
                </p>
              )}
              {!settings.existingCustomerPipeline && (
                <p className="col-span-2 text-xs text-muted-foreground">Pipeline pelanggan lama nonaktif (default). Aktifkan di Pengaturan untuk jenis produk baru / proyek.</p>
              )}
              <div className="col-span-2 space-y-1">
                <Label>Nama prospek / peluang</Label>
                <Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} placeholder="mis. Katering Bu Ani" />
              </div>
              <div className="space-y-1">
                <Label>Jenis peluang</Label>
                <Select value={create.type} onValueChange={(v) => setCreate({ ...create, type: v as OppType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Kontak</Label>
                <Input value={create.contact} onChange={(e) => setCreate({ ...create, contact: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Sales</Label>
                <Select value={create.salesId} onValueChange={(v) => setCreate({ ...create, salesId: v, city: branchOf(salesOf(v).branchId).city })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {salesList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estimasi nilai (Rp)</Label>
                <Input type="number" value={create.value} onChange={(e) => setCreate({ ...create, value: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Follow-up berikutnya</Label>
                <Input type="date" value={create.nextDate} onChange={(e) => setCreate({ ...create, nextDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Jenis follow-up</Label>
                <Select value={create.nextKind} onValueChange={(v) => setCreate({ ...create, nextKind: v as FollowKind })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreate(null)}>
              Batal
            </Button>
            <Button
              disabled={!create?.name}
              onClick={() => {
                if (!create) return;
                const o = { ...create, id: nextOppId(), log: [{ at: nowStamp(), by: user!.name, text: "Peluang dibuat di web" }] };
                createOpp(o);
                setCreate(null);
              }}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
