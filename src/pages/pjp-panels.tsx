/* PJP page building blocks: shared helpers, load heatmap, coverage, execution, generate and import dialogs. */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, MapPin, Navigation, Plus, Sparkles, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp, salesOf } from "@/store/app-store";
import { BRANCH_GEO, DAYS, HOLIDAYS, SALESMEN, TODAY, addDays, cycleDate, cyclePos, cycleStart, nextPjpId, prevWorkday } from "@/data/mock";
import { FREQS, FREQ_META, callsPerCycle, generatePjp, haversineKm, isClosedOn, nearestDay, outletDays, isHoliday, isOn, loadMatrix, pathKm, simulateDay, validOn, weeksFor, type ExecLine } from "@/data/pjp-engine";
import type { Frequency, Outlet, PjpEntry, PjpShift, Settings } from "@/data/types";
import { fmtDate, nowStamp, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const fmtShort = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export function fmtDur(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}j ${String(m).padStart(2, "0")}m` : `${m}m`;
}
export type CapTone = "empty" | "ok" | "warn" | "over";
export function capTone(n: number, target: number, max: number): CapTone {
  if (n === 0) return "empty";
  if (n > max) return "over";
  if (n > target) return "warn";
  return "ok";
}
export const TONE_CLS: Record<CapTone, string> = {
  empty: "bg-muted text-muted-foreground",
  ok: "bg-[#D8F8E9] text-[#115A38]",
  warn: "bg-[#FFF4D1] text-[#6B5000]",
  over: "bg-[#FAE5E7] text-[#68121A]",
};
/** Estimated day minutes: default visit minutes + travel between outlets, per call. */
export const dayEstimate = (calls: number, s: Settings) => calls * (s.visitMinutes + s.travelMinutes);
/** Capacity by channel: HQ Direct Sales (key accounts) vs branch sales. */
export const withCapacity = (s: Settings, branchId?: string): Settings => (branchId === "HQ" ? { ...s, pjpCallTarget: s.hqCallTarget, pjpMaxCalls: s.hqMaxCalls } : s);
export const workDaysFor = (s: Settings, branchId: string) => s.branchWorkDays[branchId] ?? s.workDays;
/** Holiday from the calendar, or a non-working weekday of the branch. */
export function dayOff(date: string, branchId: string, s: Settings): { name: string } | undefined {
  const h = isHoliday(HOLIDAYS, date, branchId);
  if (h) return h;
  const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
  return wd <= 5 && !workDaysFor(s, branchId).includes(wd) ? { name: "Bukan hari kerja cabang" } : undefined;
}

/** Entries planned on a date incl. holiday shifts: `base` = PJP pattern on that date, `incoming` = moved here from a holiday. */
export function plannedFor(entries: PjpEntry[], date: string, cycle: number, salesId: string, shifts: PjpShift[]) {
  const pos = cyclePos(date, cycle);
  const base = pos ? entries.filter((e) => isOn(e, pos.week, pos.day) && validOn(e, date)).sort((a, b) => a.seq - b.seq) : [];
  const out = shifts.find((s) => s.salesId === salesId && s.from === date);
  const incoming = shifts
    .filter((s) => s.salesId === salesId && s.to === date)
    .flatMap((s) => {
      const p = cyclePos(s.from, cycle);
      return p ? entries.filter((e) => isOn(e, p.week, p.day) && validOn(e, s.from)) : [];
    });
  return { base, incoming, shiftedTo: out?.to, active: [...(out ? [] : base), ...incoming] };
}

/* ---------------- load heatmap (4 weeks x 6 days) ---------------- */
export function LoadHeat({ matrix, settings, onPick, current, cycle = 0, branchId }: { matrix: number[][]; settings: Settings; onPick?: (week: number) => void; current?: number; cycle?: number; branchId?: string }) {
  return (
    <div className="overflow-x-auto mile-scroll">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-16" />
            {DAYS.map((d) => (
              <th key={d} className="font-medium text-muted-foreground">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, wi) => (
            <tr key={wi} className={onPick ? "cursor-pointer" : ""} onClick={() => onPick?.(wi + 1)}>
              <td className={cn("rounded-sm px-2 py-1 font-semibold", current === wi + 1 && "bg-primary text-white")}>M{wi + 1}</td>
              {row.map((n, di) => {
                const hol = branchId ? dayOff(cycleDate(wi + 1, di, cycle), branchId, settings) : undefined;
                return (
                  <td key={di} title={hol ? `Libur: ${hol.name}` : `${n} call`} className={cn("h-9 rounded-sm text-center font-semibold", hol ? "bg-[#FAE5E7] text-[#BF2130] line-through" : TONE_CLS[capTone(n, settings.pjpCallTarget, settings.pjpMaxCalls)])}>
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#D8F8E9]" /> ≤ target {settings.pjpCallTarget}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#FFF4D1]" /> di atas target</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#FAE5E7]" /> &gt; maks {settings.pjpMaxCalls} / libur</span>
      </div>
    </div>
  );
}

/* ---------------- coverage & workload ---------------- */
export function CoveragePanel({ salesId, onAdd, onPickSales }: { salesId: string; onAdd: (o: Outlet) => void; onPickSales: (id: string) => void }) {
  const { outlets, pjp, settings, inScope, can, scopeSalesIds } = useApp();
  const [only, setOnly] = useState<"sales" | "scope">("sales");
  const data = useMemo(() => {
    const inPjp = new Set(pjp.filter((e) => validOn(e, TODAY)).map((e) => e.outletId));
    const active = outlets.filter((o) => o.active && o.status !== "baru" && inScope(o.salesId));
    const missing = active.filter((o) => !inPjp.has(o.id));
    const bySales = new Map<string, PjpEntry[]>();
    pjp.forEach((e) => {
      if (!inScope(e.salesId) || !validOn(e, TODAY)) return;
      const l = bySales.get(e.salesId);
      if (l) l.push(e);
      else bySales.set(e.salesId, [e]);
    });
    const load = SALESMEN.filter((s) => scopeSalesIds.includes(s.id)).map((s) => {
      const list = bySales.get(s.id) ?? [];
      const flat = loadMatrix(list).flat();
      const total = flat.reduce((a, b) => a + b, 0);
      const cap = withCapacity(settings, s.branchId);
      return { s, outlets: list.length, avg: total / 24, max: Math.max(0, ...flat), over: flat.filter((n) => n > cap.pjpCallTarget).length, target: cap.pjpCallTarget };
    });
    const mix = (list: PjpEntry[]) => FREQS.map((f) => ({ f, n: list.filter((e) => e.freq === f).length }));
    return { active, missing, load: load.sort((a, b) => b.avg - a.avg), mixSales: mix(bySales.get(salesId) ?? []), mixScope: mix([...bySales.values()].flat()), inPjpN: active.length - missing.length };
  }, [outlets, pjp, inScope, scopeSalesIds, settings, salesId]);
  const rows = data.missing.filter((o) => only === "scope" || o.salesId === salesId);
  const maxAvg = Math.max(settings.pjpMaxCalls, ...data.load.map((l) => l.max));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Outlet aktif dalam cakupan", data.active.length.toLocaleString("id-ID"), "Pelanggan lama (tanpa prospek NOO)"],
          ["Sudah di PJP", data.inPjpN.toLocaleString("id-ID"), `Coverage ${pct(data.inPjpN, data.active.length)}%`],
          ["Belum di PJP", data.missing.length.toLocaleString("id-ID"), "Perlu dijadwalkan"],
          ["Rata-rata call / hari", (data.load.reduce((a, l) => a + l.avg, 0) / Math.max(1, data.load.length)).toFixed(1), `Target ${settings.pjpCallTarget} · maks ${settings.pjpMaxCalls}`],
        ].map(([l, v, h]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="truncate text-xs font-medium text-muted-foreground" title={l}>{l}</p>
              <p className="text-xl font-bold">{v}</p>
              <p className="truncate text-xs text-muted-foreground">{h}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-semibold">Outlet aktif belum masuk PJP</p>
            <div className="flex gap-1 rounded-md bg-muted p-1">
              {(["sales", "scope"] as const).map((k) => (
                <button key={k} onClick={() => setOnly(k)} className={cn("h-[26px] whitespace-nowrap rounded-sm px-2 text-xs font-medium", only === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
                  {k === "sales" ? "Salesman terpilih" : "Semua dalam cakupan"}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto mile-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Salesman</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 60).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.code}</p>
                    </TableCell>
                    <TableCell className="text-xs">{salesOf(o.salesId).name}</TableCell>
                    <TableCell>
                      {can("create_pjp") && (
                        <Button size="sm" variant="outline" onClick={() => onAdd(o)}>
                          <Plus /> Jadwalkan
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Semua outlet aktif sudah masuk PJP.</p>}
            {rows.length > 60 && <p className="p-3 text-center text-xs text-muted-foreground">Menampilkan 60 dari {rows.length} outlet</p>}
          </div>
        </Card>
        <Card>
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Beban kunjungan per salesman (rata-rata call / hari)</p>
            <p className="text-xs text-muted-foreground">Garis = target per kanal (cabang {settings.pjpCallTarget}, HQ key account {settings.hqCallTarget}). Klik nama untuk membuka PJP-nya.</p>
          </div>
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto p-4 mile-scroll">
            {data.load.map((l) => (
              <button key={l.s.id} onClick={() => onPickSales(l.s.id)} className={cn("grid w-full grid-cols-[150px_minmax(0,1fr)_92px] items-center gap-2 rounded-sm px-1 text-left text-xs hover:bg-muted", l.s.id === salesId && "bg-accent")}>
                <span className="truncate" title={l.s.name}>{l.s.name}</span>
                <span className="relative h-4 rounded-sm bg-muted">
                  <span className={cn("absolute inset-y-0 left-0 rounded-sm", l.avg > l.target ? "bg-[#F5B400]" : "bg-primary")} style={{ width: `${(l.avg / maxAvg) * 100}%` }} />
                  <span className="absolute inset-y-[-2px] w-0.5 bg-[#BF2130]" style={{ left: `${(l.target / maxAvg) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap text-right text-muted-foreground">
                  {l.avg.toFixed(1)} · maks {l.max}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardContent className="grid gap-6 p-4 md:grid-cols-2">
          {[
            ["Komposisi frekuensi — salesman terpilih", data.mixSales],
            ["Komposisi frekuensi — semua dalam cakupan", data.mixScope],
          ].map(([label, mix]) => {
            const m = mix as { f: Frequency; n: number }[];
            const tot = m.reduce((a, x) => a + x.n, 0) || 1;
            const COL: Record<Frequency, string> = { F1: "#C7C7C7", F2: "#6CD1FE", F4: "#02A8F3" };
            return (
              <div key={label as string} className="space-y-2">
                <p className="text-sm font-semibold">{label as string}</p>
                <div className="flex h-5 overflow-hidden rounded-sm">
                  {m.map((x) => (x.n ? <span key={x.f} style={{ width: `${(x.n / tot) * 100}%`, background: COL[x.f] }} title={`${x.f}: ${x.n}`} /> : null))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {m.map((x) => (
                    <span key={x.f} className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COL[x.f] }} /> {FREQ_META[x.f].label}: <b className="text-foreground">{x.n}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- execution (simulated Mile Field data) ---------------- */
const EXEC_BADGE: Record<ExecLine["status"], "success" | "danger" | "warning" | "neutral" | "info" | "orange"> = {
  Selesai: "success",
  Dilewati: "warning",
  "Dijadwalkan ulang": "orange",
  Terlewat: "danger",
  Berjalan: "info",
  Rencana: "neutral",
  Libur: "danger",
};
export function ExecutionPanel({ salesId, entries, outletMap, shifts }: { salesId: string; entries: PjpEntry[]; outletMap: Map<string, Outlet>; shifts: PjpShift[] }) {
  const { settings } = useApp();
  const s = salesOf(salesId);
  const [date, setDate] = useState(TODAY);
  const pool = useMemo(() => [...outletMap.values()].filter((o) => o.salesId === salesId).map((o) => o.id), [outletMap, salesId]);
  const linesFor = (d: string): ExecLine[] => {
    const plan = (x: string) => plannedFor(entries, x, 0, salesId, shifts).active.map((e) => ({ key: e.id, outletId: e.outletId }));
    const hol = !!dayOff(d, s.branchId, settings) && !shifts.some((x) => x.salesId === salesId && x.from === d);
    const prev = prevWorkday(d);
    return simulateDay({ date: d, today: TODAY, salesId, planned: plan(d), prevPlanned: plan(prev), prevDate: prev, extraPool: settings.extraCallAllowed ? pool : [], holiday: hol, skipReasons: settings.skipReasons, carryOver: settings.carryOverMode !== "off" });
  };
  const pos = cyclePos(date) ?? { week: 1, day: 0 };
  const weekDays = DAYS.map((_, di) => cycleDate(pos.week, di));
  const weekStats = weekDays.map((d) => {
    const l = linesFor(d);
    const pj = l.filter((x) => x.source === "PJP" && x.status !== "Libur");
    return { d, planned: pj.length, done: pj.filter((x) => x.status === "Selesai").length, hol: l.some((x) => x.status === "Libur") };
  });
  const lines = linesFor(date);
  const pjLines = lines.filter((l) => l.source === "PJP" && l.status !== "Libur");
  const count = (st: ExecLine["status"]) => pjLines.filter((l) => l.status === st).length;
  const extraDone = settings.extraInCompliance ? lines.filter((l) => l.source === "Extra" && l.status === "Selesai").length : 0;
  const denom = pjLines.length + extraDone;
  const done = count("Selesai") + extraDone;
  const actualCalls = lines.filter((l) => l.status === "Selesai").length;
  const inMarket = (() => {
    const t = lines.filter((l) => l.checkIn && l.checkOut).map((l) => [l.checkIn!, l.checkOut!]);
    if (!t.length) return "—";
    const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
    return fmtDur(m(t[t.length - 1][1]) - m(t[0][0]));
  })();
  const future = date > TODAY;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold">Eksekusi Minggu {pos.week} · {s.name}</p>
            <Badge variant="neutral">Data simulasi dari webhook Mile Field</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {weekStats.map((w, i) => (
              <button key={w.d} onClick={() => setDate(w.d)} className={cn("rounded-md border p-2 text-left text-xs", w.d === date ? "border-primary ring-1 ring-primary/30" : "border-border hover:bg-muted")}>
                <p className="font-semibold">
                  {DAY_SHORT[i]} {fmtShort(w.d)}
                  {w.d === TODAY && <span className="ml-1 text-primary">· hari ini</span>}
                </p>
                {w.hol ? (
                  <p className="text-[#BF2130]">Libur</p>
                ) : w.d > TODAY ? (
                  <p className="text-muted-foreground">{w.planned} rencana</p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      {w.done}/{w.planned} · {pct(w.done, w.planned)}%
                    </p>
                    <span className="mt-1 block h-1.5 rounded-full bg-muted">
                      <span className="block h-1.5 rounded-full bg-[#198754]" style={{ width: `${pct(w.done, w.planned)}%` }} />
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {[
          ["Rencana (PJP)", pjLines.length],
          ["Call compliance", `${done}/${denom} · ${pct(done, denom)}%`],
          ["Effective call", `${lines.filter((l) => l.effective).length} · ${pct(lines.filter((l) => l.effective).length, actualCalls)}%`],
          ["Dilewati + alasan", count("Dilewati")],
          ["Dijadwalkan ulang / terlewat", `${count("Dijadwalkan ulang")} / ${count("Terlewat")}`],
          ["Extra / carry-over", `${lines.filter((l) => l.source === "Extra").length} / ${lines.filter((l) => l.source === "Carry-over").length}`],
          ["Time-in-market", inMarket],
        ].map(([l, v]) => (
          <Card key={l as string}>
            <CardContent className="p-3">
              <p className="truncate text-xs text-muted-foreground" title={l as string}>{l}</p>
              <p className="text-lg font-bold">{future ? "—" : v}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Urut</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Sumber</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Task</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => {
              const o = outletMap.get(l.outletId);
              return (
                <TableRow key={l.key}>
                  <TableCell>{l.seq}</TableCell>
                  <TableCell>
                    <p className="font-medium">{o?.name}</p>
                    <p className="text-xs text-muted-foreground">{o?.code}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.source === "PJP" ? "info" : l.source === "Extra" ? "orange" : "warning"}>{l.source}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={EXEC_BADGE[l.status]}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{l.reason ?? (l.status === "Dijadwalkan ulang" ? "Pindah ke hari kerja berikutnya" : "—")}</TableCell>
                  <TableCell className="text-xs">{l.checkIn ?? "—"}</TableCell>
                  <TableCell className="text-xs">{l.checkOut ?? "—"}</TableCell>
                  <TableCell>{l.effective ? <CheckCircle2 className="h-4 w-4 text-[#198754]" /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-primary">
                      MF-{date.slice(5).replace("-", "")}-{l.seq} <ExternalLink className="h-3 w-3" />
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {lines.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Belum ada call plan untuk tanggal ini.</p>}
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Call compliance = kunjungan rencana selesai (check-in + check-out) ÷ kunjungan rencana{settings.extraInCompliance ? " (extra call dihitung, sesuai Pengaturan)" : "; extra call dan carry-over tidak masuk penyebut"}. Effective call = kunjungan dengan pesanan ÷ kunjungan aktual. Time-in-market = check-in pertama s.d. check-out terakhir.{" "}
          {settings.carryOverMode === "off" ? "Carry-over nonaktif." : `Kunjungan "Dijadwalkan ulang" kembali sebagai carry-over (${settings.carryOverMode === "auto" ? "otomatis hari kerja berikutnya" : "tanggal dipilih sales"}, maks ${settings.carryOverMaxDays} hari, minggu yang sama).`}
        </p>
      </Card>
    </div>
  );
}

/* ---------------- auto-generate dialog ---------------- */
export function GenerateDialog({ open, onOpenChange, salesId, validFrom, onApplied }: { open: boolean; onOpenChange: (v: boolean) => void; salesId: string; validFrom: string; onApplied: (salesIds: string[]) => void }) {
  const { outlets, pjp, setPjp, routes, settings, scopeSalesIds, toast, addAudit, setPjpHeaders } = useApp();
  const [scope, setScope] = useState<"one" | "all">("one");
  const [target, setTarget] = useState(withCapacity(settings, salesOf(salesId).branchId).pjpCallTarget);
  const ids = scope === "one" ? [salesId] : scopeSalesIds;
  const preview = useMemo(() => {
    if (!open) return [];
    return ids.map((id) => {
      const list = outlets.filter((o) => o.salesId === id && o.active && o.status !== "baru");
      const stats = { closedShifted: 0 };
      const gen = generatePjp({
        stats,
        salesId: id,
        outlets: list,
        routes,
        freqOf: () => settings.defaultFreq,
        target: scope === "one" ? target : withCapacity(settings, salesOf(id).branchId).pjpCallTarget,
        validFrom,
        nextId: () => "tmp",
        workDays: workDaysFor(settings, salesOf(id).branchId),
        keepRoute: settings.generateKeepRoute,
      });
      const before = loadMatrix(pjp.filter((e) => e.salesId === id && validOn(e, validFrom))).flat();
      const after = loadMatrix(gen).flat();
      return { id, gen, before, after, moved: gen.filter((e) => e.seq > 100).length, closed: stats.closedShifted };
    });
  }, [open, ids.join(","), outlets, routes, settings, target, validFrom, pjp, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const one = preview[0];
  const closedTotal = preview.reduce((a, p) => a + p.closed, 0);
  const apply = () => {
    const set = new Set(ids);
    const fresh = preview.flatMap((p) => p.gen.map((e) => ({ ...e, id: nextPjpId() })));
    const end = addDays(validFrom, -1);
    setPjp((list) => [
      ...list.flatMap((e) => (!set.has(e.salesId) || (e.validTo && e.validTo < validFrom) ? [e] : e.validFrom >= validFrom ? [] : [{ ...e, validTo: end }])),
      ...fresh,
    ]);
    setPjpHeaders((hs) => hs.map((h) => (set.has(h.salesId) ? { ...h, version: h.version + 1, status: settings.spvEditPjpDirect && settings.pjpApprovalRequired ? "Disetujui" : "Draft", validFrom, validTo: undefined, note: "Hasil generate otomatis, belum dipublikasikan" } : h)));
    addAudit({ module: "PJP", action: "Generate PJP otomatis", target: ids.length === 1 ? salesOf(ids[0]).name : `${ids.length} salesman`, detail: `${fresh.length} entri · target ${target} call/hari · berlaku ${fmtDate(validFrom)}` });
    toast({ tone: "success", title: "PJP hasil generate diterapkan", desc: `${fresh.length} entri untuk ${ids.length} salesman${closedTotal ? ` · ${closedTotal} outlet digeser karena hari tutup` : ""} · berlaku mulai ${fmtDate(validFrom)} · publish untuk mengirim ke Mile Field` });
    onApplied(ids);
    onOpenChange(false);
  };
  const stat = (flat: number[]) => ({ total: flat.reduce((a, b) => a + b, 0), max: Math.max(0, ...flat), over: flat.filter((n) => n > target).length });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[860px] gap-0 overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle>Generate PJP otomatis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            Semua outlet memakai frekuensi default dari Pengaturan (<b>{FREQ_META[settings.defaultFreq].label}</b>); ubah per entri setelah generate. Satu hari rute (beat) per outlet dan urutan rute. F2 / F1 ditempatkan pada minggu
            dengan beban terendah; bila hari rute melebihi target, outlet F1 / F2 digeser ke hari tetangga. Outlet yang tutup di hari rute ditempatkan di hari buka terdekat. {settings.generateKeepRoute ? "Rute dipertahankan" : "Rute diabaikan"}, hanya hari kerja cabang.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cakupan</Label>
              <div className="flex gap-1 rounded-md bg-muted p-1">
                {(["one", "all"] as const).map((k) => (
                  <button key={k} onClick={() => setScope(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", scope === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
                    {k === "one" ? salesOf(salesId).name : `Semua dalam cakupan (${scopeSalesIds.length})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-[160px] space-y-1">
              <Label className="text-xs text-muted-foreground">Target call / hari</Label>
              <Input type="number" min={4} max={40} value={target} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="text-xs text-muted-foreground">Berlaku mulai {fmtDate(validFrom)}</div>
          </div>
          {scope === "one" && one ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["PJP saat ini", one.before],
                  ["Hasil generate (preview)", one.after],
                ] as const
              ).map(([l, flat]) => {
                const st = stat(flat);
                return (
                  <div key={l} className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-semibold">{l}</p>
                    <p className="text-xs text-muted-foreground">
                      {st.total} call / 4 minggu · rata-rata {(st.total / 24).toFixed(1)} / hari · maks {st.max} · {st.over} hari di atas target
                    </p>
                    <LoadHeat matrix={[0, 1, 2, 3].map((w) => flat.slice(w * 6, w * 6 + 6))} settings={{ ...settings, pjpCallTarget: target }} />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground md:col-span-2">
                {one.gen.length} outlet masuk PJP · {one.moved} outlet F1 / F2 digeser ke hari tetangga untuk menyeimbangkan beban
                {one.closed > 0 && (
                  <>
                    {" · "}
                    <b className="text-[#6B5000]">{one.closed} outlet digeser karena hari tutup</b> (ke hari buka terdekat)
                  </>
                )}
                .
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto rounded-md border mile-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesman</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Call / siklus (lama → baru)</TableHead>
                    <TableHead>Rata-rata / hari</TableHead>
                    <TableHead>Hari &gt; target</TableHead>
                    <TableHead>Digeser (hari tutup)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((p) => {
                    const b = stat(p.before);
                    const a = stat(p.after);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{salesOf(p.id).name}</TableCell>
                        <TableCell className="text-xs">{p.gen.length}</TableCell>
                        <TableCell className="text-xs">
                          {b.total} → {a.total}
                        </TableCell>
                        <TableCell className="text-xs">{(a.total / 24).toFixed(1)}</TableCell>
                        <TableCell>
                          <Badge variant={a.over ? "warning" : "success"}>{a.over}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{p.closed ? `${p.closed} outlet digeser karena hari tutup` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="flex items-start gap-1 text-xs text-[#6B5000]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Menerapkan hasil generate mengganti entri PJP salesman terpilih (versi baru). Kunjungan yang sudah terbit di Mile Field tidak berubah sampai publish berikutnya.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={apply}>
            <Sparkles /> Terapkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Excel import (simulated) ---------------- */
interface ImportRow {
  line: number;
  code: string;
  name: string;
  day: string;
  freq: string;
  weeks: string;
  error?: string;
  apply?: { outletId: string; day: number; freq: Frequency; weeks: number[] };
}
export function ImportDialog({ open, onOpenChange, salesId, entries, validFrom }: { open: boolean; onOpenChange: (v: boolean) => void; salesId: string; entries: PjpEntry[]; validFrom: string }) {
  const { outlets, setPjp, toast, addAudit, setImportLogs, user, settings } = useApp();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const s = salesOf(salesId);
  const build = () => {
    const inPjp = new Set(entries.map((e) => e.outletId));
    const own = outlets.filter((o) => o.salesId === salesId && o.active && o.status !== "baru");
    const add = own.filter((o) => !inPjp.has(o.id)).slice(0, 4);
    const change = entries.slice(3, 7).map((e) => outlets.find((o) => o.id === e.outletId)!).filter(Boolean);
    const other = outlets.find((o) => o.branchId !== s.branchId)!;
    const r: ImportRow[] = [];
    let line = 2;
    const ok = (o: Outlet, day: number, f: Frequency, alt: number) => {
      const weeks = weeksFor(f, alt);
      day = nearestDay(day, outletDays(o));
      r.push({ line: line++, code: o.code, name: o.name, day: DAYS[day], freq: f, weeks: weeks.map((w) => `M${w}`).join(","), apply: { outletId: o.id, day, freq: f, weeks } });
    };
    add.forEach((o, i) => ok(o, (i * 2) % 6, settings.defaultFreq, i));
    change.forEach((o, i) => ok(o, (i + 3) % 6, i === 0 ? "F4" : settings.defaultFreq, i));
    r.push({ line: line++, code: `C-${s.branchId}-9999`, name: "—", day: "Senin", freq: "F2", weeks: "M1,M3", error: "Kode outlet tidak ditemukan" });
    r.push({ line: line++, code: other.code, name: other.name, day: "Selasa", freq: "F4", weeks: "M1-M4", error: "Outlet berada di cabang lain" });
    const shut = own.find((o) => !add.includes(o) && !change.includes(o) && outletDays(o).length < 6);
    if (shut) {
      const d = [0, 1, 2, 3, 4, 5].find((x) => isClosedOn(shut, x))!;
      r.push({ line: line++, code: shut.code, name: shut.name, day: DAYS[d], freq: settings.defaultFreq, weeks: weeksFor(settings.defaultFreq, 0).map((w) => `M${w}`).join(","), error: `Outlet tutup di hari ${DAYS[d]}` });
    }
    if (own[0]) r.push({ line: line++, code: own[0].code, name: own[0].name, day: "Minggu", freq: "F2", weeks: "M2,M4", error: "Hari harus Senin–Sabtu" });
    if (own[1]) r.push({ line: line++, code: own[1].code, name: own[1].name, day: "Rabu", freq: "F3", weeks: "M1", error: "Frekuensi harus F1 / F2 / F4" });
    if (own[2]) r.push({ line: line++, code: own[2].code, name: own[2].name, day: "Senin & Kamis", freq: "F4", weeks: "M1-M4", error: "Satu baris hanya satu hari kunjungan; kunjungan ke-2 dalam seminggu dibuat sebagai extra call" });
    setRows(r.sort((a, b) => a.line - b.line));
  };
  const valid = rows?.filter((r) => r.apply) ?? [];
  const apply = () => {
    setPjp((list) => {
      const next = [...list];
      for (const r of valid) {
        const a = r.apply!;
        const i = next.findIndex((e) => e.salesId === salesId && e.outletId === a.outletId && validOn(e, validFrom));
        if (i >= 0) next[i] = { ...next[i], day: a.day, freq: a.freq, weeks: a.weeks };
        else {
          const o = outlets.find((x) => x.id === a.outletId);
          next.push({ id: nextPjpId(), salesId, outletId: a.outletId, routeId: o?.routeId, day: a.day, freq: a.freq, weeks: a.weeks, seq: (o?.routeSeq ?? 50) + 0.5, validFrom });
        }
      }
      return next;
    });
    const file = `pjp-${s.code}-import.xlsx`;
    setImportLogs((l) => [{ id: `L${Date.now()}`, kind: "Import", template: "PJP", file, by: user?.name ?? "—", at: nowStamp(), accepted: valid.length, rejected: (rows?.length ?? 0) - valid.length }, ...l]);
    addAudit({ module: "PJP", action: "Import PJP dari Excel", target: s.name, detail: `${valid.length} baris diterapkan, ${(rows?.length ?? 0) - valid.length} ditolak` });
    toast({ tone: "success", title: "Import PJP diterapkan", desc: `${valid.length} baris valid diterapkan; baris error tidak diimpor` });
    setRows(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setRows(null); }}>
      <DialogContent className="max-h-[90vh] max-w-[900px] gap-0 overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle>Import PJP dari Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4">
          <p className="text-xs text-muted-foreground">
            Template kolom: Kode salesman, Kode outlet, Hari (satu hari, Senin–Sabtu), Frekuensi (F1 / F2 / F4), Minggu (M1–M4), Urutan, Berlaku mulai. Baris divalidasi dulu; hanya baris valid yang diterapkan.
          </p>
          {!rows ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
              <FileSpreadsheet className="h-8 w-8 text-primary" />
              <p className="text-sm">Pilih file .xlsx PJP untuk {s.name}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => toast({ tone: "info", title: "Template diunduh", desc: "template-pjp.xlsx" })}>
                  Unduh template
                </Button>
                <Button onClick={build}>
                  <Upload /> Pilih file (simulasi)
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{valid.length} baris valid</Badge>
                <Badge variant="danger">{rows.length - valid.length} baris error</Badge>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Baris</TableHead>
                      <TableHead>Kode outlet</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Hari</TableHead>
                      <TableHead>Frek.</TableHead>
                      <TableHead>Minggu</TableHead>
                      <TableHead>Validasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.line}>
                        <TableCell>{r.line}</TableCell>
                        <TableCell className="text-xs">{r.code}</TableCell>
                        <TableCell className="text-xs">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.day}</TableCell>
                        <TableCell className="text-xs">{r.freq}</TableCell>
                        <TableCell className="text-xs">{r.weeks}</TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="flex items-center gap-1 text-xs text-[#BF2130]">
                              <XCircle className="h-3.5 w-3.5 shrink-0" /> {r.error}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-[#198754]">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {entries.some((e) => e.outletId === r.apply!.outletId) ? "OK · ubah entri" : "OK · entri baru"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setRows(null); }}>
            Batal
          </Button>
          <Button disabled={!valid.length} onClick={apply}>
            Terapkan {valid.length} baris valid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { callsPerCycle, cycleStart, addDays };
