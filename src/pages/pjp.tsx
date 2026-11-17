import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarPlus, Check, Plus, Send, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassBadge } from "@/components/status-badge";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { DAYS, SALESMEN, TODAY, addDays, cycleDate, cyclePos, nextPjpId, weeksFor } from "@/data/mock";
import type { Frequency, Outlet, PjpChangeRequest } from "@/data/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const FREQ_LABEL: Record<Frequency, string> = { F4: "F4 · tiap minggu", F2: "F2 · 2 minggu sekali", F1: "F1 · sebulan sekali" };
const CURRENT_WEEK = cyclePos(TODAY)?.week ?? 3;
/** Default "Berlaku mulai": the next Monday after today. */
function nextMonday(iso: string) {
  const d = new Date(iso + "T00:00:00").getDay(); // 0 = Sunday
  const add = d === 1 ? 7 : (8 - d) % 7 || 7;
  return addDays(iso, add);
}

export function PjpPage() {
  const { scopeSalesIds, pjp, setPjp, outlets, opps, can, toast, settings, pjpRequests, setPjpRequests, inScope, addAudit, user } = useApp();
  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const [salesId, setSalesId] = useState(salesList[0]?.id ?? "");
  const [week, setWeek] = useState<number | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ outletId: string; day: string; freq: Frequency; alt: string; validFrom: string; validTo: string }>({
    outletId: "",
    day: "0",
    freq: "F2",
    alt: "0",
    validFrom: nextMonday(TODAY),
    validTo: "",
  });
  const [tab, setTab] = useState<"plan" | "requests">("plan");
  const [delId, setDelId] = useState<string | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [decision, setDecision] = useState<{ id: string; approve: boolean; reason: string } | null>(null);
  const freqFor = (o?: Outlet): Frequency => (!o ? "F2" : o.status === "lama_belum" ? settings.belumBeliFreq : settings.classFreq[o.cls]);
  const canUpdate = can("update_pjp");
  const requests = pjpRequests.filter((r) => inScope(r.salesId)).sort((a, b) => b.at.localeCompare(a.at));
  const pendingReq = requests.filter((r) => r.status === "pending").length;

  const entries = pjp.filter((e) => e.salesId === salesId).sort((a, b) => a.day - b.day || a.seq - b.seq);
  const outletMap = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const extra = opps.filter((o) => o.salesId === salesId && o.nextKind === "Kunjungan" && (o.stage === "Prospek" || o.stage === "Dijadwalkan" || o.stage === "Kunjungan & Negosiasi") && cyclePos(o.nextDate));
  const totalCalls = entries.reduce((a, e) => a + e.weeks.length, 0);
  const s = salesOf(salesId);
  const candidates = outlets.filter((o) => s && o.active && o.branchId === s.branchId && !entries.some((e) => e.outletId === o.id));

  const weeks = week === "all" ? [1, 2, 3, 4] : [week];

  const addEntry = () => {
    const o = outletMap.get(form.outletId);
    if (!o) return;
    const weeksSel = form.freq === "F4" ? [1, 2, 3, 4] : weeksFor(form.freq, Number(form.alt));
    setPjp((list) => [
      ...list,
      {
        id: nextPjpId(),
        salesId,
        outletId: o.id,
        day: Number(form.day),
        freq: form.freq,
        weeks: weeksSel,
        seq: list.filter((x) => x.salesId === salesId && x.day === Number(form.day)).length + 1,
        validFrom: form.validFrom || nextMonday(TODAY),
        validTo: form.validTo || undefined,
      },
    ]);
    toast({ tone: "success", title: "Outlet ditambahkan ke PJP", desc: `${o.name} · ${DAYS[Number(form.day)]} · ${form.freq} · berlaku mulai ${fmtDate(form.validFrom)}` });
    setAddOpen(false);
  };
  const removeEntry = (id: string) => {
    const e = pjp.find((x) => x.id === id);
    setPjp((list) => list.filter((x) => x.id !== id));
    toast({ tone: "info", title: "Outlet dihapus dari PJP", desc: e ? outletMap.get(e.outletId)?.name : undefined });
    setDelId(null);
  };
  /** Route sequence: swap with the neighbour on the same day. */
  const move = (id: string, dir: -1 | 1) => {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    const sameDay = entries.filter((x) => x.day === e.day);
    const i = sameDay.findIndex((x) => x.id === id);
    const other = sameDay[i + dir];
    if (!other) return;
    setPjp((list) => list.map((x) => (x.id === e.id ? { ...x, seq: other.seq } : x.id === other.id ? { ...x, seq: e.seq } : x)));
  };
  const decide = () => {
    if (!decision) return;
    const r = pjpRequests.find((x) => x.id === decision.id);
    if (!r) return;
    if (decision.approve) applyRequest(r);
    setPjpRequests((list) =>
      list.map((x) => (x.id === r.id ? { ...x, status: decision.approve ? "approved" : "rejected", decidedBy: user?.name, decisionReason: decision.reason } : x))
    );
    const outletName = outletMap.get(r.outletId)?.name ?? r.outletId;
    addAudit({
      module: "PJP",
      action: decision.approve ? "Permintaan perubahan disetujui" : "Permintaan perubahan ditolak",
      target: `${salesOf(r.salesId).name} · ${outletName}`,
      detail: `${r.kind}: ${r.detail}${decision.reason ? ` · ${decision.reason}` : ""} (update_pjp)`,
    });
    toast({
      tone: decision.approve ? "success" : "danger",
      title: decision.approve ? "Permintaan disetujui" : "Permintaan ditolak",
      desc: `${r.kind} · ${outletName}${decision.approve ? " · PJP diperbarui, berlaku pada publish berikutnya" : ""}`,
    });
    setDecision(null);
  };
  const applyRequest = (r: PjpChangeRequest) => {
    const existing = pjp.find((x) => x.salesId === r.salesId && x.outletId === r.outletId);
    if (r.kind === "Hapus") {
      setPjp((list) => list.filter((x) => !(x.salesId === r.salesId && x.outletId === r.outletId)));
      return;
    }
    // detail format: Tambah "Rabu · F2 (M1, M3)", Ubah hari "Senin → Kamis"
    const dayName = r.kind === "Ubah hari" ? r.detail.split("→")[1]?.trim() : r.detail.split("·")[0]?.trim();
    const dayIdx = DAYS.findIndex((d) => d === dayName);
    if (r.kind === "Ubah hari") {
      if (existing && dayIdx >= 0) setPjp((list) => list.map((x) => (x.id === existing.id ? { ...x, day: dayIdx } : x)));
      return;
    }
    if (!existing) {
      const o = outletMap.get(r.outletId);
      const freq = freqFor(o);
      const day = dayIdx >= 0 ? dayIdx : 0;
      setPjp((list) => [
        ...list,
        { id: nextPjpId(), salesId: r.salesId, outletId: r.outletId, day, freq, weeks: weeksFor(freq, 0), seq: list.filter((x) => x.salesId === r.salesId && x.day === day).length + 1, validFrom: nextMonday(TODAY) },
      ]);
    }
  };
  const publish = () => {
    const wk = week === "all" ? CURRENT_WEEK : week;
    const n = entries.filter((e) => e.weeks.includes(wk)).length + extra.filter((o) => cyclePos(o.nextDate)?.week === wk).length;
    setPubOpen(false);
    toast({
      tone: "success",
      title: "PJP dipublikasikan ke Mile Field",
      desc: `Minggu ${wk} (${fmtDate(cycleDate(wk, 0))} – ${fmtDate(cycleDate(wk, 5))}): ${n} task kunjungan dibuat untuk ${s?.name}.`,
    });
  };

  if (!s) return <p className="text-sm text-muted-foreground">Tidak ada salesman dalam cakupan Anda.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="PJP / Call Plan"
        subtitle="Rencana kunjungan rotasi 4 minggu per salesman. Frekuensi mengikuti kelas outlet (A = F4, B = F2, C = F1); follow-up prospek tampil sebagai extra call."
        action={
          <>
            {can("create_pjp") && (
              <Button
                variant="outline"
                onClick={() => {
                  setForm({ outletId: candidates[0]?.id ?? "", day: "0", freq: freqFor(candidates[0]), alt: "0", validFrom: nextMonday(TODAY), validTo: "" });
                  setAddOpen(true);
                }}
              >
                <Plus /> Tambah outlet
              </Button>
            )}
            {can("publish_pjp") && (
              <Button onClick={() => setPubOpen(true)}>
                <Send /> Publish ke Mile Field
              </Button>
            )}
          </>
        }
      />

      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
        {(
          [
            ["plan", "Rencana PJP"],
            ["requests", `Permintaan Perubahan (${pendingReq})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "requests" ? (
        <Card>
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              Sales / BM mengajukan perubahan PJP (tambah, hapus, ubah hari); SPV memutuskan dengan permission <code className="font-mono">update_pjp</code> (tanpa permission approval terpisah). Perubahan yang disetujui
              berlaku pada publish berikutnya.
            </p>
            {settings.spvEditPjpDirect && <p>Pengaturan "SPV edit langsung" aktif: SPV juga dapat mengubah PJP langsung di tab Rencana PJP.</p>}
          </CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Salesman</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead>Diajukan</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{salesOf(r.salesId).name}</TableCell>
                  <TableCell>{outletMap.get(r.outletId)?.name ?? r.outletId}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "Hapus" ? "danger" : r.kind === "Tambah" ? "success" : "info"}>{r.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.detail}</TableCell>
                  <TableCell className="text-xs">{r.reason}</TableCell>
                  <TableCell className="text-xs">
                    {fmtDate(r.at)}
                    <span className="block text-muted-foreground">{r.requestedBy}</span>
                  </TableCell>
                  <TableCell>
                    {r.status !== "pending" ? (
                      <div className="text-xs">
                        <Badge variant={r.status === "approved" ? "success" : "danger"}>{r.status === "approved" ? "Disetujui" : "Ditolak"}</Badge>
                        <span className="mt-1 block text-muted-foreground">
                          {r.decidedBy}
                          {r.decisionReason ? ` · ${r.decisionReason}` : ""}
                        </span>
                      </div>
                    ) : canUpdate ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setDecision({ id: r.id, approve: true, reason: "" })}>
                          <Check /> Setujui
                        </Button>
                        <Button size="sm" variant="outline" className="text-[#DC3545] hover:bg-[#FAE5E7] hover:text-[#68121A]" onClick={() => setDecision({ id: r.id, approve: false, reason: "" })}>
                          <X /> Tolak
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Butuh update_pjp</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {requests.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Tidak ada permintaan perubahan</p>}
        </Card>
      ) : (
      <>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="w-[280px] space-y-1">
            <Label className="text-xs text-muted-foreground">Salesman</Label>
            <Select value={salesId} onValueChange={setSalesId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {salesList.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} · {x.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Minggu</Label>
            <div className="flex gap-1 rounded-md bg-muted p-1">
              {(["all", 1, 2, 3, 4] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWeek(w)}
                  className={cn("h-[30px] rounded-sm px-3 text-sm font-medium", week === w ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
                >
                  {w === "all" ? "Semua" : `M${w}`}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{branchOf(s.branchId).name}</Badge>
            <Badge variant="info">{entries.length} outlet di PJP</Badge>
            <Badge variant="info">{totalCalls} call / 4 minggu</Badge>
            <Badge variant="orange">{extra.length} extra call follow-up</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto mile-scroll">
        <div className="grid min-w-[880px] gap-2" style={{ gridTemplateColumns: `96px repeat(${weeks.length}, minmax(0, 1fr))` }}>
          <div />
          {weeks.map((w) => (
            <div key={w} className={cn("rounded-md px-3 py-2 text-sm font-semibold", w === CURRENT_WEEK ? "bg-primary text-white" : "bg-muted text-foreground")}>
              Minggu {w}
              <span className={cn("block text-xs font-normal", w === CURRENT_WEEK ? "text-white/80" : "text-muted-foreground")}>
                {fmtDate(cycleDate(w, 0))} – {fmtDate(cycleDate(w, 5))}
                {w === CURRENT_WEEK && " · minggu ini"}
              </span>
            </div>
          ))}
          {DAYS.map((d, di) => (
            <div key={d} className="contents">
              <div className="flex items-start pt-2 text-sm font-semibold text-foreground">{d}</div>
              {weeks.map((w) => {
                const cell = entries.filter((e) => e.day === di && e.weeks.includes(w));
                const ex = extra.filter((o) => {
                  const p = cyclePos(o.nextDate);
                  return p && p.week === w && p.day === di;
                });
                const isToday = cycleDate(w, di) === TODAY;
                return (
                  <div key={w} className={cn("min-h-[72px] space-y-1 rounded-md border bg-background p-1.5", isToday ? "border-primary ring-1 ring-primary/30" : "border-border")}>
                    {cell.map((e) => {
                      const o = outletMap.get(e.outletId);
                      if (!o) return null;
                      return (
                        <div key={e.id} className="group flex items-center gap-1.5 rounded-sm bg-accent px-1.5 py-1 text-xs text-[#01496A]">
                          <ClassBadge c={o.cls} />
                          <span className="min-w-0 flex-1 truncate" title={o.name}>
                            {o.name}
                          </span>
                          <span className="text-[10px] font-semibold opacity-70">{e.freq}</span>
                          {can("delete_pjp") && (
                            <button onClick={() => setDelId(e.id)} className="hidden text-[#BF2130] group-hover:block" title="Hapus dari PJP">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {ex.map((o) => (
                      <div key={o.id} className="flex items-center gap-1.5 rounded-sm border border-dashed border-[#E45C20] bg-[#FCEEE8] px-1.5 py-1 text-xs text-[#8D3711]" title="Extra call dari follow-up pipeline">
                        <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        <span className="text-[10px] font-semibold">Extra</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Hari</TableHead>
                <TableHead className="w-[110px]">Urutan</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Frekuensi</TableHead>
                <TableHead>Minggu</TableHead>
                <TableHead>Berlaku</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => {
                const o = outletMap.get(e.outletId);
                if (!o) return null;
                return (
                  <TableRow key={e.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{DAYS[e.day]}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-[#01496A]">
                          {entries.filter((x) => x.day === e.day).findIndex((x) => x.id === e.id) + 1}
                        </span>
                        {canUpdate && (
                          <>
                            <button onClick={() => move(e.id, -1)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Naikkan urutan">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => move(e.id, 1)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Turunkan urutan">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.code} · {o.address}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ClassBadge c={o.cls} />
                    </TableCell>
                    <TableCell>
                      {can("update_pjp") ? (
                        <Select
                          value={e.freq}
                          onValueChange={(v) => setPjp((list) => list.map((x) => (x.id === e.id ? { ...x, freq: v as Frequency, weeks: weeksFor(v as Frequency, i) } : x)))}
                        >
                          <SelectTrigger className="h-[31px] w-[190px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => (
                              <SelectItem key={f} value={f}>
                                {FREQ_LABEL[f]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        FREQ_LABEL[e.freq]
                      )}
                    </TableCell>
                    <TableCell>{e.weeks.map((w) => `M${w}`).join(", ")}</TableCell>
                    <TableCell className="text-xs">
                      {fmtDate(e.validFrom)}
                      <span className="block text-muted-foreground">s.d. {e.validTo ? fmtDate(e.validTo) : "tanpa batas"}</span>
                    </TableCell>
                    <TableCell>
                      {can("delete_pjp") && (
                        <button onClick={() => setDelId(e.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[#FAE5E7] hover:text-[#BF2130]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      )}

      <Dialog open={!!delId} onOpenChange={(v) => !v && setDelId(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus dari PJP</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus <b>{outletMap.get(pjp.find((x) => x.id === delId)?.outletId ?? "")?.name}</b> dari PJP <b>{s.name}</b>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelId(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => delId && removeEntry(delId)}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pubOpen} onOpenChange={setPubOpen}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Publish PJP ke Mile Field</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Publish PJP <b>{s.name}</b> untuk minggu {week === "all" ? CURRENT_WEEK : week}? Task kunjungan dibuat di Mile Field (termasuk extra call dari follow-up). Perubahan sesudahnya berlaku pada publish berikutnya.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPubOpen(false)}>
              Batal
            </Button>
            <Button onClick={publish}>
              <Send /> Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>{decision?.approve ? "Setujui Permintaan Perubahan" : "Tolak Permintaan Perubahan"}</DialogTitle>
          </DialogHeader>
          {decision && (
            <div className="space-y-2 p-4">
              <Label>{decision.approve ? "Catatan (opsional)" : "Alasan penolakan (wajib)"}</Label>
              <Textarea value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} />
              <p className="text-xs text-muted-foreground">Keputusan dicatat dengan pengguna, permission (update_pjp), waktu dan alasan.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Batal
            </Button>
            <Button variant={decision?.approve ? "default" : "destructive"} disabled={!decision?.approve && !decision?.reason} onClick={decide}>
              {decision?.approve ? "Setujui" : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Tambah Outlet ke PJP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <Label>Outlet ({branchOf(s.branchId).name})</Label>
              <Select
                value={form.outletId}
                onValueChange={(v) => {
                  const o = outletMap.get(v);
                  setForm((f) => ({ ...f, outletId: v, freq: freqFor(o) }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih outlet" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · Kelas {o.cls} · {o.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Hari</Label>
                <Select value={form.day} onValueChange={(v) => setForm((f) => ({ ...f, day: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Frekuensi</Label>
                <Select value={form.freq} onValueChange={(v) => setForm((f) => ({ ...f, freq: v as Frequency, alt: "0" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQ_LABEL[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Minggu</Label>
                <Select value={form.alt} onValueChange={(v) => setForm((f) => ({ ...f, alt: v }))} disabled={form.freq === "F4"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {form.freq === "F2"
                      ? [
                          <SelectItem key="0" value="0">M1 &amp; M3</SelectItem>,
                          <SelectItem key="1" value="1">M2 &amp; M4</SelectItem>,
                        ]
                      : form.freq === "F1"
                        ? [0, 1, 2, 3].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              Minggu {n + 1}
                            </SelectItem>
                          ))
                        : [<SelectItem key="0" value="0">Semua minggu</SelectItem>]}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Berlaku mulai</Label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Berlaku sampai (opsional)</Label>
                <Input type="date" value={form.validTo} min={form.validFrom} onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Default frekuensi dari Pengaturan: kelas A = {settings.classFreq.A}, B = {settings.classFreq.B}, C = {settings.classFreq.C}; pelanggan lama yang belum pernah beli = {settings.belumBeliFreq}. Angka final ditetapkan UP.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={addEntry} disabled={!form.outletId}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
