import { useMemo, useState } from "react";
import { CalendarPlus, Plus, Send, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassBadge } from "@/components/status-badge";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { DAYS, SALESMEN, TODAY, cycleDate, cyclePos, nextPjpId, weeksFor } from "@/data/mock";
import type { Frequency } from "@/data/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const FREQ_LABEL: Record<Frequency, string> = { F4: "F4 · tiap minggu", F2: "F2 · 2 minggu sekali", F1: "F1 · sebulan sekali" };
const CURRENT_WEEK = cyclePos(TODAY)?.week ?? 3;

export function PjpPage() {
  const { scopeSalesIds, pjp, setPjp, outlets, opps, can, toast } = useApp();
  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const [salesId, setSalesId] = useState(salesList[0]?.id ?? "");
  const [week, setWeek] = useState<number | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ outletId: string; day: string; freq: Frequency; alt: string }>({ outletId: "", day: "0", freq: "F2", alt: "0" });

  const entries = pjp.filter((e) => e.salesId === salesId);
  const outletMap = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const extra = opps.filter((o) => o.salesId === salesId && o.nextKind === "Kunjungan" && (o.stage === "Prospek" || o.stage === "Dijadwalkan" || o.stage === "Kunjungan & Negosiasi") && cyclePos(o.nextDate));
  const totalCalls = entries.reduce((a, e) => a + e.weeks.length, 0);
  const s = salesOf(salesId);
  const candidates = outlets.filter((o) => s && o.branchId === s.branchId && !entries.some((e) => e.outletId === o.id));

  const weeks = week === "all" ? [1, 2, 3, 4] : [week];

  const addEntry = () => {
    const o = outletMap.get(form.outletId);
    if (!o) return;
    const weeksSel = form.freq === "F4" ? [1, 2, 3, 4] : weeksFor(form.freq, Number(form.alt));
    setPjp((list) => [...list, { id: nextPjpId(), salesId, outletId: o.id, day: Number(form.day), freq: form.freq, weeks: weeksSel }]);
    toast({ tone: "success", title: "Outlet ditambahkan ke PJP", desc: `${o.name} · ${DAYS[Number(form.day)]} · ${form.freq}` });
    setAddOpen(false);
  };
  const removeEntry = (id: string) => {
    const e = pjp.find((x) => x.id === id);
    setPjp((list) => list.filter((x) => x.id !== id));
    toast({ tone: "info", title: "Outlet dihapus dari PJP", desc: e ? outletMap.get(e.outletId)?.name : undefined });
  };
  const publish = () => {
    const wk = week === "all" ? CURRENT_WEEK : week;
    const n = entries.filter((e) => e.weeks.includes(wk)).length + extra.filter((o) => cyclePos(o.nextDate)?.week === wk).length;
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
                  setForm({ outletId: candidates[0]?.id ?? "", day: "0", freq: candidates[0]?.cls === "A" ? "F4" : candidates[0]?.cls === "C" ? "F1" : "F2", alt: "0" });
                  setAddOpen(true);
                }}
              >
                <Plus /> Tambah outlet
              </Button>
            )}
            {can("publish_pjp") && (
              <Button onClick={publish}>
                <Send /> Publish ke Mile Field
              </Button>
            )}
          </>
        }
      />

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
                            <button onClick={() => removeEntry(e.id)} className="hidden text-[#BF2130] group-hover:block" title="Hapus dari PJP">
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
                <TableHead>Outlet</TableHead>
                <TableHead>Kelas</TableHead>
                <TableHead>Frekuensi</TableHead>
                <TableHead>Hari</TableHead>
                <TableHead>Minggu</TableHead>
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
                    <TableCell>{DAYS[e.day]}</TableCell>
                    <TableCell>{e.weeks.map((w) => `M${w}`).join(", ")}</TableCell>
                    <TableCell>
                      {can("delete_pjp") && (
                        <button onClick={() => removeEntry(e.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[#FAE5E7] hover:text-[#BF2130]">
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
                  setForm((f) => ({ ...f, outletId: v, freq: o?.cls === "A" ? "F4" : o?.cls === "C" ? "F1" : "F2" }));
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
            <p className="text-xs text-muted-foreground">Usulan default: kelas A = F4, B = F2, C = F1; pelanggan lama yang belum pernah beli = F2. Angka final ditetapkan UP.</p>
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
