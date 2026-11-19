import { useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarOff, CalendarPlus, Check, Copy, Download, GripVertical, MapPin, Plus, Send, Sparkles, Trash2, Undo2, Upload, UserRoundCog, X } from "lucide-react";
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
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { DAYS, HOLIDAYS, SALESMEN, TODAY, addDays, cycleDate, cyclePos, cycleStart, nextPjpId } from "@/data/mock";
import { FREQS, FREQ_HINT, FREQ_META, callsPerCycle, isClosedOn, isHoliday, isOn, loadMatrix, nearestDay, outletDays, validOn, weeksFor } from "@/data/pjp-engine";
import type { Frequency, Outlet, PjpChangeRequest, PjpEntry } from "@/data/types";
import { fmtDate, nowStamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayOff, withCapacity, CoveragePanel, DAY_SHORT, ExecutionPanel, GenerateDialog, ImportDialog, LoadHeat, TONE_CLS, capTone, dayEstimate, fmtDur, fmtShort, plannedFor } from "./pjp-panels";

const CURRENT_WEEK = cyclePos(TODAY)?.week ?? 3;
/** Default "Berlaku mulai": the next Monday after today. */
function nextMonday(iso: string) {
  const d = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(iso, d === 1 ? 7 : (8 - d) % 7 || 7);
}
const weekAlt = (e: Pick<PjpEntry, "freq" | "weeks">) => (e.freq === "F1" ? e.weeks[0] - 1 : e.freq === "F2" ? (e.weeks[0] === 1 ? 0 : 1) : 0);
type Tab = "plan" | "coverage" | "exec" | "requests" | "approval";
const STEPS_APPROVAL = ["Draft", "Menunggu Approval", "Disetujui", "Dipublikasikan"] as const;
const STEPS_DIRECT = ["Draft", "Dipublikasikan"] as const;

/** Small status stepper: Draft → Dipublikasikan (default, D-53) or Draft → Menunggu Approval → Disetujui → Dipublikasikan (setting on). */
function Stepper({ status, approval }: { status: string; approval: boolean }) {
  const STEPS: readonly string[] = approval ? STEPS_APPROVAL : STEPS_DIRECT;
  const cur = STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]">
      {STEPS.map((st, i) => (
        <li key={st} className="flex items-center gap-1">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", i < cur ? "bg-[#DDF3E4] text-[#1E6B3A]" : i === cur ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {i < cur ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {st}
          </span>
          {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
        </li>
      ))}
    </ol>
  );
}

export function PjpPage() {
  const app = useApp();
  const { scopeSalesIds, pjp, setPjp, outlets, setOutlets, opps, can, toast, settings: baseSettings, pjpRequests, setPjpRequests, inScope, addAudit, user, pjpHeaders, setPjpHeaders, pjpShifts, setPjpShifts, routes } = app;
  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const [salesId, setSalesId] = useState(salesList[0]?.id ?? "");
  const [cycle, setCycle] = useState(0);
  const [week, setWeek] = useState<number | "all">(CURRENT_WEEK);
  const [tabSel, setTab] = useState<Tab>("plan");
  /** D-53/D-54: PJP approval is optional (default off) — holders of publish_pjp publish directly; when on, holders of approve_pjp approve. */
  const approvalOn = baseSettings.pjpApprovalRequired;
  const tab: Tab = tabSel === "approval" && !approvalOn ? "plan" : tabSel;
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ outletId: string; day: string; freq: Frequency; alt: string; validFrom: string; validTo: string }>({ outletId: "", day: "0", freq: "F2", alt: "0", validFrom: nextMonday(TODAY), validTo: "" });
  const [delId, setDelId] = useState<string | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [pjpDecision, setPjpDecision] = useState<{ salesId: string; reason: string } | null>(null);
  const [decision, setDecision] = useState<{ id: string; approve: boolean; reason: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; day: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const requests = pjpRequests.filter((r) => inScope(r.salesId)).sort((a, b) => b.at.localeCompare(a.at));
  const pendingReq = requests.filter((r) => r.status === "pending").length;
  const s = salesOf(salesId);
  const header = pjpHeaders.find((h) => h.salesId === salesId);
  /** Capacity by channel (HQ key account vs branch). */
  const settings = useMemo(() => withCapacity(baseSettings, s?.branchId), [baseSettings, s?.branchId]);
  /** Lock after publish: with "edit PJP terbit langsung" on, holders of update_pjp change a published PJP directly; others go through a change request. */
  const bypass = settings.spvEditPjpDirect && can("update_pjp");
  const pendingLock = approvalOn && header?.status === "Menunggu Approval";
  /** Status as shown: with approval off, unpublished states collapse to Draft. */
  const shownStatus = header && !approvalOn && header.status !== "Dipublikasikan" ? "Draft" : header?.status;
  const locked = pendingLock || (settings.lockAfterPublish && header?.status === "Dipublikasikan" && !bypass);
  /** D-54: when PJP approval is on, any holder of approve_pjp whose data scope covers the salesman approves. */
  const canApprovePjp = can("approve_pjp");
  const pendingPjps = pjpHeaders.filter((h) => h.status === "Menunggu Approval" && inScope(h.salesId));
  const canApprove = can("update_pjp");
  const canCreate = can("create_pjp") && !locked;
  const canUpdate = can("update_pjp") && !locked;
  const canDelete = can("delete_pjp") && !locked;
  const slaOver = (at: string) => (new Date(nowStamp().replace(" ", "T")).getTime() - new Date(at.replace(" ", "T")).getTime()) / 3600000 > settings.changeRequestSlaHours;
  const cStart = cycleStart(cycle);

  const outletMap = useMemo(() => new Map(outlets.map((o) => [o.id, o])), [outlets]);
  const routeMap = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  /** Version shown: entries valid on the Monday of the selected week (or today / cycle start for the summary view). */
  const refDate = week === "all" || tab === "coverage" || tab === "exec" ? (cycle === 0 ? TODAY : cStart) : cycleDate(week, 0, cycle);
  const entries = useMemo(() => pjp.filter((e) => e.salesId === salesId && validOn(e, refDate)).sort((a, b) => a.seq - b.seq), [pjp, salesId, refDate]);
  /** D-53: approval off → holders of publish_pjp publish a Draft directly; approval on → only a Disetujui PJP can be published. */
  const canPublishNow = approvalOn ? header?.status === "Disetujui" : shownStatus === "Draft" && entries.length > 0;
  const weekOf = (date: string) => cyclePos(date, cycle)?.week;
  const matrix = useMemo(() => loadMatrix(entries), [entries]);
  const extra = opps.filter((o) => o.salesId === salesId && o.nextKind === "Kunjungan" && (o.stage === "Prospek" || o.stage === "Dijadwalkan" || o.stage === "Kunjungan & Negosiasi") && cyclePos(o.nextDate, cycle));
  const totalCalls = entries.reduce((a, e) => a + callsPerCycle(e), 0);
  const inAnyPjp = useMemo(() => new Set(pjp.filter((e) => validOn(e, TODAY) || e.validFrom > TODAY).map((e) => e.outletId)), [pjp]);
  const candidates = useMemo(() => (s ? outlets.filter((o) => o.active && o.branchId === s.branchId && o.status !== "baru" && !inAnyPjp.has(o.id)).sort((a, b) => Number(b.salesId === salesId) - Number(a.salesId === salesId)) : []), [outlets, s, inAnyPjp, salesId]);
  const nextStart = cycleStart(cycle + 1);
  const hasNextVersion = pjp.some((e) => e.salesId === salesId && e.validFrom >= cycleStart(1));

  /** Any change returns the PJP to Draft (published version stays locked: change creates a new Draft version). With approval on, the bypass setting (default off) jumps to Disetujui. */
  const markChanged = (ids: string[], note = "Perubahan belum dipublikasikan") =>
    setPjpHeaders((hs) =>
      hs.map((h) => {
        if (!ids.includes(h.salesId)) return h;
        const nv = h.status === "Dipublikasikan" ? h.version + 1 : h.version;
        return { ...h, version: nv, status: bypass && approvalOn ? "Disetujui" : "Draft", note: h.status === "Dipublikasikan" ? `Versi ${nv} (Draft) dari perubahan setelah publish` : note, publishedAt: h.status === "Dipublikasikan" ? undefined : h.publishedAt };
      }),
    );
  const closedConflicts = useMemo(() => entries.filter((e) => isClosedOn(outletMap.get(e.outletId), e.day)).length, [entries, outletMap]);
  const submitApproval = () => {
    setPjpHeaders((hs) => hs.map((h) => (h.salesId === salesId ? { ...h, status: "Menunggu Approval", submittedBy: user?.name, submittedAt: nowStamp(), rejectReason: undefined, note: `Diajukan ${user?.name ?? ""}, menunggu pemegang approve_pjp` } : h)));
    addAudit({ module: "PJP", action: "PJP diajukan untuk approval", target: s.name, detail: `Versi ${header?.version} · penyetuju: pemegang approve_pjp` });
    toast({ tone: "success", title: "PJP diajukan untuk approval", desc: `${s.name} · versi ${header?.version} menunggu pemegang approve_pjp. PJP terkunci sampai diputuskan.` });
    if (closedConflicts) toast({ tone: "warning", title: `${closedConflicts} kunjungan di hari outlet tutup`, desc: "PJP tetap diajukan. Penyetuju akan melihat peringatan ini; pindahkan harinya bila perlu." });
  };
  const approvePjp = (id: string) => {
    const h = pjpHeaders.find((x) => x.salesId === id);
    setPjpHeaders((hs) => hs.map((x) => (x.salesId === id ? { ...x, status: "Disetujui", approvedBy: user?.name, approvedAt: nowStamp(), rejectReason: undefined, note: "Disetujui, siap dipublikasikan" } : x)));
    addAudit({ module: "PJP", action: "PJP disetujui", target: salesOf(id).name, detail: `Versi ${h?.version} (approve_pjp)` });
    toast({ tone: "success", title: "PJP disetujui", desc: `${salesOf(id).name} · versi ${h?.version}. Sekarang bisa dipublikasikan ke Mile Field.` });
  };
  const rejectPjp = () => {
    if (!pjpDecision) return;
    const { salesId: id, reason } = pjpDecision;
    setPjpHeaders((hs) => hs.map((x) => (x.salesId === id ? { ...x, status: "Draft", rejectReason: reason, note: `Ditolak ${user?.name ?? ""}: ${reason}` } : x)));
    addAudit({ module: "PJP", action: "PJP ditolak", target: salesOf(id).name, detail: `${reason} (approve_pjp)` });
    toast({ tone: "danger", title: "PJP ditolak", desc: `${salesOf(id).name} kembali ke Draft · ${reason}` });
    setPjpDecision(null);
  };

  /** Calls planned in one cell (incl. holiday shifts and follow-up extra calls). */
  const cellInfo = (w: number, d: number) => {
    const date = cycleDate(w, d, cycle);
    const p = plannedFor(entries, date, cycle, salesId, pjpShifts);
    const ex = extra.filter((o) => o.nextDate === date);
    const hol = dayOff(date, s.branchId, settings);
    return { date, ...p, ex, hol, n: p.active.length + ex.length };
  };

  const capacityWarn = (n: number, who: string, label: string) => {
    if (n > settings.pjpMaxCalls) toast({ tone: "danger", title: "Melebihi kapasitas harian", desc: `${who} · ${label}: ${n} call (maks ${settings.pjpMaxCalls}). Pertimbangkan hari lain.` });
    else if (n > settings.pjpCallTarget) toast({ tone: "warning", title: "Di atas target call harian", desc: `${who} · ${label}: ${n} call (target ${settings.pjpCallTarget}).` });
  };

  /* ---------- edits ---------- */
  const update = (id: string, patch: Partial<PjpEntry>) => {
    setPjp((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    markChanged([salesId]);
  };
  const moveToDay = (id: string, from: number, to: number) => {
    const e = entries.find((x) => x.id === id);
    if (!e || from === to) return;
    const eo = outletMap.get(e.outletId);
    if (isClosedOn(eo, to)) {
      toast({ tone: "danger", title: `Outlet tutup di hari ${DAYS[to]}`, desc: `${eo?.name} hanya bisa dikunjungi ${outletDays(eo).map((d) => DAYS[d]).join(", ")}. Kunjungan tidak dipindah.` });
      return;
    }
    const seq = Math.max(0, ...entries.filter((x) => x.day === to).map((x) => x.seq)) + 1;
    update(id, { day: to, seq });
    const peak = Math.max(...e.weeks.map((w) => matrix[w - 1][to] + 1));
    toast({ tone: "info", title: "Kunjungan dipindah", desc: `${outletMap.get(e.outletId)?.name}: ${DAYS[from]} → ${DAYS[to]} (${e.freq})` });
    capacityWarn(peak, s.name, DAYS[to]);
  };
  const reorder = (id: string, beforeId: string, day: number) => {
    const dayList = entries.filter((x) => x.day === day && x.id !== id);
    const i = dayList.findIndex((x) => x.id === beforeId);
    const dragged = entries.find((x) => x.id === id);
    if (!dragged || i < 0) return;
    dayList.splice(i, 0, dragged);
    const seqMap = new Map(dayList.map((x, k) => [x.id, k + 1]));
    setPjp((list) => list.map((x) => (seqMap.has(x.id) ? { ...x, seq: seqMap.get(x.id)! } : x)));
    markChanged([salesId]);
  };
  const reassign = (id: string, toSales: string) => {
    const e = entries.find((x) => x.id === id);
    if (!e || toSales === salesId) return;
    const t = salesOf(toSales);
    const route = routes.find((r) => r.salesId === toSales && r.day === e.day);
    const tEntries = pjp.filter((x) => x.salesId === toSales && validOn(x, TODAY));
    const tm = loadMatrix([...tEntries, e]);
    const peak = Math.max(...e.weeks.map((w) => tm[w - 1][e.day]));
    setPjp((list) => list.map((x) => (x.id === id ? { ...x, salesId: toSales, routeId: route?.id, seq: 99 } : x)));
    setOutlets((list) => list.map((o) => (o.id === e.outletId ? { ...o, salesId: toSales, routeId: route?.id } : o)));
    markChanged([salesId, toSales]);
    const name = outletMap.get(e.outletId)?.name;
    addAudit({ module: "PJP", action: "Kunjungan dipindah ke salesman lain", target: name ?? e.outletId, detail: `${s.name} → ${t.name} · ${DAYS[e.day]} (update_pjp)` });
    toast({ tone: "success", title: "Outlet dipindah ke salesman lain", desc: `${name} → ${t.name}${route ? ` · ${route.name}` : ""}` });
    capacityWarn(peak, t.name, DAYS[e.day]);
  };
  const move = (id: string, dir: -1 | 1, day: number) => {
    const dayList = entries.filter((x) => x.day === day);
    const i = dayList.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= dayList.length) return;
    [dayList[i], dayList[j]] = [dayList[j], dayList[i]];
    const seqMap = new Map(dayList.map((x, k) => [x.id, k + 1]));
    setPjp((list) => list.map((x) => (seqMap.has(x.id) ? { ...x, seq: seqMap.get(x.id)! } : x)));
    markChanged([salesId]);
  };
  const changeFreq = (e: PjpEntry, f: Frequency) => update(e.id, { freq: f, weeks: weeksFor(f, weekAlt(e)) });

  const addEntry = () => {
    const o = outletMap.get(form.outletId);
    if (!o) return;
    const day = Number(form.day);
    if (isClosedOn(o, day)) {
      toast({ tone: "danger", title: `Outlet tutup di hari ${DAYS[day]}`, desc: "Pilih hari kunjungan outlet." });
      return;
    }
    const route = routes.find((r) => r.salesId === salesId && r.day === day);
    const entry: PjpEntry = { id: nextPjpId(), salesId, outletId: o.id, routeId: route?.id, day, freq: form.freq, weeks: weeksFor(form.freq, Number(form.alt)), seq: Math.max(0, ...entries.filter((x) => x.day === day).map((x) => x.seq)) + 1, validFrom: form.validFrom || nextMonday(TODAY), validTo: form.validTo || undefined };
    setPjp((list) => [...list, entry]);
    if (o.salesId !== salesId) setOutlets((list) => list.map((x) => (x.id === o.id ? { ...x, salesId, routeId: route?.id } : x)));
    markChanged([salesId]);
    toast({ tone: "success", title: "Outlet ditambahkan ke PJP", desc: `${o.name} · ${DAYS[day]} · ${form.freq} · berlaku mulai ${fmtDate(entry.validFrom)}` });
    capacityWarn(Math.max(...entry.weeks.map((w) => matrix[w - 1][day] + 1)), s.name, DAYS[day]);
    const wk = weekOf(entry.validFrom);
    if (wk && week !== "all" && wk > week) setWeek(wk);
    setAddOpen(false);
  };
  const openAdd = (o?: Outlet) => {
    const c = o ?? candidates[0];
    const route = c?.routeId ? routeMap.get(c.routeId) : undefined;
    const base = route?.salesId === salesId && route.day !== undefined ? route.day : matrix[0].reduce((m, _, d) => (matrix.reduce((a, w) => a + w[d], 0) < matrix.reduce((a, w) => a + w[m], 0) ? d : m), 0);
    const day = nearestDay(base, outletDays(c));
    if (o && o.salesId !== salesId) setSalesId(o.salesId);
    setForm({ outletId: c?.id ?? "", day: String(day), freq: settings.defaultFreq, alt: "0", validFrom: nextMonday(TODAY), validTo: "" });
    setAddOpen(true);
  };
  const removeEntry = (id: string) => {
    const e = pjp.find((x) => x.id === id);
    setPjp((list) => list.filter((x) => x.id !== id));
    markChanged([salesId]);
    toast({ tone: "info", title: "Outlet dihapus dari PJP", desc: e ? outletMap.get(e.outletId)?.name : undefined });
    setDelId(null);
  };

  /* ---------- change requests ---------- */
  const decide = () => {
    if (!decision) return;
    const r = pjpRequests.find((x) => x.id === decision.id);
    if (!r) return;
    if (decision.approve) applyRequest(r);
    setPjpRequests((list) => list.map((x) => (x.id === r.id ? { ...x, status: decision.approve ? "approved" : "rejected", decidedBy: user?.name, decisionReason: decision.reason } : x)));
    const outletName = outletMap.get(r.outletId)?.name ?? r.outletId;
    addAudit({ module: "PJP", action: decision.approve ? "Permintaan perubahan disetujui" : "Permintaan perubahan ditolak", target: `${salesOf(r.salesId).name} · ${outletName}`, detail: `${r.kind}: ${r.detail}${decision.reason ? ` · ${decision.reason}` : ""} (update_pjp)` });
    toast({ tone: decision.approve ? "success" : "danger", title: decision.approve ? "Permintaan disetujui" : "Permintaan ditolak", desc: `${r.kind} · ${outletName}${decision.approve ? " · PJP diperbarui, berlaku pada publish berikutnya" : ""}` });
    setDecision(null);
  };
  const applyRequest = (r: PjpChangeRequest) => {
    const existing = pjp.find((x) => x.salesId === r.salesId && x.outletId === r.outletId && validOn(x, TODAY));
    if (r.kind === "Hapus") {
      setPjp((list) => list.filter((x) => !(x.salesId === r.salesId && x.outletId === r.outletId)));
      markChanged([r.salesId]);
      return;
    }
    // detail format: Tambah "Rabu · F2 (M1, M3)", Ubah hari "Senin → Kamis"
    const parts = r.kind === "Ubah hari" ? r.detail.split("→").map((x) => x.trim()) : [r.detail.split("·")[0]?.trim()];
    const toIdx = DAYS.findIndex((d) => d === parts[parts.length - 1]);
    if (r.kind === "Ubah hari") {
      if (existing && toIdx >= 0) setPjp((list) => list.map((x) => (x.id === existing.id ? { ...x, day: toIdx } : x)));
      markChanged([r.salesId]);
      return;
    }
    if (!existing) {
      const o = outletMap.get(r.outletId);
      const freq = settings.defaultFreq;
      const day = toIdx >= 0 ? toIdx : 0;
      setPjp((list) => [...list, { id: nextPjpId(), salesId: r.salesId, outletId: r.outletId, routeId: o?.routeId, day, freq, weeks: weeksFor(freq, 0), seq: 99, validFrom: nextMonday(TODAY) }]);
      markChanged([r.salesId]);
    }
  };

  /* ---------- publish / version / holidays / export ---------- */
  const pubWeek = week === "all" ? (cycle === 0 ? CURRENT_WEEK : 1) : week;
  const pubCount = DAYS.reduce((a, _, d) => {
    const c = cellInfo(pubWeek, d);
    return a + (c.hol && !c.shiftedTo ? c.ex.length + c.incoming.length : c.n);
  }, 0);
  const publish = () => {
    setPubOpen(false);
    setPjpHeaders((hs) => hs.map((h) => (h.salesId === salesId ? { ...h, status: "Dipublikasikan", publishedAt: nowStamp(), note: undefined } : h)));
    addAudit({ module: "PJP", action: "PJP dipublikasikan", target: s.name, detail: `Versi ${header?.version ?? 1} · minggu ${pubWeek} · ${pubCount} task (publish_pjp)` });
    toast({ tone: "success", title: "PJP dipublikasikan ke Mile Field", desc: `Minggu ${pubWeek} (${fmtDate(cycleDate(pubWeek, 0, cycle))} – ${fmtDate(cycleDate(pubWeek, 5, cycle))}): ${pubCount} task kunjungan dibuat untuk ${s.name}, urut rute.` });
  };
  const copyNext = () => {
    const end = addDays(nextStart, -1);
    const src = entries.filter((e) => !e.validTo || e.validTo >= nextStart);
    const copies = src.map((e) => ({ ...e, id: nextPjpId(), validFrom: nextStart, validTo: undefined }));
    const srcIds = new Set(src.map((e) => e.id));
    setPjp((list) => [...list.map((x) => (srcIds.has(x.id) ? { ...x, validTo: end } : x)), ...copies]);
    setPjpHeaders((hs) => hs.map((h) => (h.salesId === salesId ? { ...h, version: h.version + 1, status: "Draft", validFrom: nextStart, validTo: undefined, note: `Disalin dari versi ${h.version} (berlaku s.d. ${fmtDate(end)})` } : h)));
    addAudit({ module: "PJP", action: "PJP disalin ke siklus berikutnya", target: s.name, detail: `${copies.length} entri · berlaku mulai ${fmtDate(nextStart)}` });
    toast({ tone: "success", title: "PJP disalin ke siklus berikutnya", desc: `${copies.length} entri · versi baru (Draft) berlaku mulai ${fmtDate(nextStart)}` });
    setCopyOpen(false);
    setCycle(cycle + 1);
    setWeek(1);
  };
  const suggestShift = (w: number, d: number) => {
    const opts = [d + 1, d + 2, d - 1, d - 2, d + 3, d - 3].filter((x) => x >= 0 && x <= 5);
    let best: { d: number; n: number } | null = null;
    for (const x of opts) {
      const c = cellInfo(w, x);
      if (c.hol) continue;
      if (!best || c.n < best.n - 1) best = { d: x, n: c.n };
    }
    return best;
  };
  const shift = (from: string, to: string, n: number) => {
    setPjpShifts((l) => [...l.filter((x) => !(x.salesId === salesId && x.from === from)), { salesId, from, to }]);
    addAudit({ module: "PJP", action: "Kunjungan hari libur digeser", target: s.name, detail: `${fmtDate(from)} → ${fmtDate(to)} · ${n} kunjungan` });
    toast({ tone: "success", title: "Kunjungan hari libur digeser", desc: `${n} kunjungan ${fmtDate(from)} → ${fmtDate(to)} (hanya tanggal ini; pola PJP tidak berubah)` });
  };
  const exportXlsx = () => toast({ tone: "success", title: "Export Excel dibuat", desc: `pjp-${s.code}-${cStart}.xlsx · ${entries.length} baris (kode outlet, rute, urutan, hari, frekuensi, minggu, berlaku)` });

  if (!s) return <p className="text-sm text-muted-foreground">Tidak ada salesman dalam cakupan Anda.</p>;

  const sameBranchSales = salesList.filter((x) => x.branchId === s.branchId && x.id !== salesId);
  const weekDates = [0, 1, 2, 3].map((w) => [cycleDate(w + 1, 0, cycle), cycleDate(w + 1, 5, cycle)]);
  const tableRows = entries.filter((e) => {
    if (!q) return true;
    const o = outletMap.get(e.outletId);
    return `${o?.name} ${o?.code}`.toLowerCase().includes(q.toLowerCase());
  });
  const statusVariant = shownStatus === "Dipublikasikan" ? "success" : shownStatus === "Disetujui" ? "info" : shownStatus === "Menunggu Approval" ? "orange" : "warning";
  const onDragStart = (ev: DragEvent, id: string, day: number) => {
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", id);
    setDrag({ id, day });
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="PJP / Call Plan"
        subtitle="Rencana kunjungan rotasi 4 minggu per salesman: rute (beat) per hari, banyak kunjungan per hari dalam urutan rute, frekuensi F1 / F2 / F4 (satu hari kunjungan per outlet). Follow-up prospek dan kunjungan tambahan tampil sebagai extra call."
        action={
          <>
            <Button variant="outline" onClick={() => toast({ tone: "info", title: "Peta rute tersedia di MileApp web (native)" })}>
              <MapPin /> Lihat rute di MileApp
            </Button>
            {canCreate && (
              <Button variant="outline" onClick={() => setImpOpen(true)}>
                <Upload /> Import
              </Button>
            )}
            <Button variant="outline" onClick={exportXlsx}>
              <Download /> Export
            </Button>
            {canCreate && (
              <Button variant="outline" onClick={() => setGenOpen(true)}>
                <Sparkles /> Generate otomatis
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" onClick={() => openAdd()}>
                <Plus /> Tambah outlet
              </Button>
            )}
            {approvalOn && (can("create_pjp") || can("update_pjp")) && header?.status === "Draft" && (
              <Button variant="outline" onClick={submitApproval} disabled={entries.length === 0}>
                <Check /> Ajukan Approval
              </Button>
            )}
            {can("publish_pjp") && (
              <Button
                onClick={() => setPubOpen(true)}
                disabled={!canPublishNow}
                title={
                  canPublishNow
                    ? undefined
                    : approvalOn
                      ? "Publish hanya untuk PJP berstatus Disetujui (approval aktif di Pengaturan)"
                      : shownStatus === "Dipublikasikan"
                        ? "Versi ini sudah dipublikasikan"
                        : "PJP masih kosong"
                }
              >
                <Send /> Publish ke Mile Field
              </Button>
            )}
          </>
        }
      />

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {(
          [
            ["plan", "Rencana PJP"],
            ["coverage", "Cakupan & Beban"],
            ["exec", "Eksekusi"],
            ["approval", `Approval PJP (${pendingPjps.length})`],
            ["requests", `Permintaan Perubahan (${pendingReq})`],
          ] as const
        ).filter(([k]) => k !== "approval" || approvalOn).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>

      {tab !== "requests" && tab !== "approval" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-full space-y-1 sm:w-[280px]">
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
              {tab !== "coverage" && tab !== "exec" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Siklus</Label>
                    <div className="flex gap-1 rounded-md bg-muted p-1">
                      {[0, 1].map((c) => (
                        <button key={c} onClick={() => { setCycle(c); setWeek(c === 0 ? CURRENT_WEEK : 1); }} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", cycle === c ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
                          {c === 0 ? "Siklus ini" : "Berikutnya"} · {fmtShort(cycleStart(c))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Minggu</Label>
                    <div className="flex gap-1 rounded-md bg-muted p-1">
                      {(["all", 1, 2, 3, 4] as const).map((w) => (
                        <button key={w} onClick={() => setWeek(w)} className={cn("h-[30px] rounded-sm px-3 text-sm font-medium", week === w ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
                          {w === "all" ? "Ringkas" : `M${w}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {header && shownStatus && <Stepper status={shownStatus} approval={approvalOn} />}
            {approvalOn && header?.status === "Draft" && header.rejectReason && <p className="text-xs text-[#DC3545]">Ditolak penyetuju: {header.rejectReason}. Perbaiki lalu ajukan ulang.</p>}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="neutral">{branchOf(s.branchId).name}</Badge>
              {header && (
                <Badge variant={statusVariant} title={header.note}>
                  Versi {header.version} · {shownStatus}
                </Badge>
              )}
              <Badge variant="neutral">
                Berlaku {fmtDate(header?.validFrom ?? cStart)} – {header?.validTo ? fmtDate(header.validTo) : "tanpa batas"}
              </Badge>
              <Badge variant="info">{entries.length} outlet di PJP</Badge>
              <Badge variant="info">{totalCalls} call / 4 minggu</Badge>
              <Badge variant={totalCalls / 24 > settings.pjpCallTarget ? "warning" : "success"}>
                rata-rata {(totalCalls / 24).toFixed(1)} call/hari · target {settings.pjpCallTarget}
              </Badge>
              <Badge variant="orange">{extra.length} extra call follow-up</Badge>
              {header?.note && <span className="text-muted-foreground">{header.note}</span>}
              {approvalOn && header && canApprovePjp && header.status === "Menunggu Approval" && (
                <span className="ml-auto flex gap-2">
                  <Button size="sm" onClick={() => approvePjp(salesId)}>
                    <Check /> Setujui PJP
                  </Button>
                  <Button size="sm" variant="outline" className="text-[#DC3545] hover:bg-[#FAE5E7] hover:text-[#68121A]" onClick={() => setPjpDecision({ salesId, reason: "" })}>
                    <X /> Tolak
                  </Button>
                </span>
              )}
              {canCreate && cycle === 0 && !hasNextVersion && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setCopyOpen(true)}>
                  <Copy /> Salin ke siklus berikutnya
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {closedConflicts > 0 && tab === "plan" && (
        <p className="flex items-start gap-2 rounded-md border border-[#F5C2C7] bg-[#FDECEE] px-3 py-2 text-xs text-[#842029]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {closedConflicts} kunjungan jatuh di hari outlet tutup (tanda merah "Outlet tutup"). Ini peringatan: PJP tetap bisa diajukan dan dipublikasikan; pindahkan ke hari kunjungan outlet bila perlu.
        </p>
      )}
      {locked && tab !== "requests" && tab !== "approval" && (
        <p className="flex items-start gap-2 rounded-md border border-[#F5D77A] bg-[#FFF4D1] px-3 py-2 text-xs text-[#6B5000]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {pendingLock
            ? `PJP menunggu approval (pemegang approve_pjp) dan terkunci sampai diputuskan.`
            : `PJP sudah dipublikasikan dan terkunci. Perubahan diajukan lewat tab Permintaan Perubahan (diputuskan pemegang update_pjp); hasilnya menjadi versi Draft baru yang ${approvalOn ? `perlu approval pemegang approve_pjp sebelum publish` : "dipublikasikan ulang oleh pemegang publish_pjp"}.`}
        </p>
      )}

      {tab === "approval" && (
        <Card>
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              Alur: Draft → Menunggu Approval → Disetujui → Dipublikasikan. Penyetuju: pemegang permission <code className="font-mono">approve_pjp</code> dalam cakupan datanya (approval aktif lewat Pengaturan). Publish hanya untuk PJP Disetujui.
            </p>
          </CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Salesman</TableHead>
                <TableHead>Versi</TableHead>
                <TableHead>Diajukan</TableHead>
                <TableHead>Entri</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingPjps.map((h, i) => (
                <TableRow key={h.salesId}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{salesOf(h.salesId).name}</TableCell>
                  <TableCell>Versi {h.version}</TableCell>
                  <TableCell className="text-xs">
                    {h.submittedAt ? fmtDate(h.submittedAt) : "-"}
                    <span className="block text-muted-foreground">{h.submittedBy}</span>
                  </TableCell>
                  <TableCell>{pjp.filter((e) => e.salesId === h.salesId).length} outlet</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setSalesId(h.salesId); setTab("plan"); }}>
                        Lihat PJP
                      </Button>
                      {canApprovePjp && (
                        <>
                          <Button size="sm" onClick={() => approvePjp(h.salesId)}>
                            <Check /> Setujui
                          </Button>
                          <Button size="sm" variant="outline" className="text-[#DC3545] hover:bg-[#FAE5E7] hover:text-[#68121A]" onClick={() => setPjpDecision({ salesId: h.salesId, reason: "" })}>
                            <X /> Tolak
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pendingPjps.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Tidak ada PJP yang menunggu approval</p>}
        </Card>
      )}

      {tab === "requests" && (
        <Card>
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              Sales mengajukan perubahan PJP (tambah, hapus, ubah hari); pemegang permission <code className="font-mono">update_pjp</code> dalam cakupan datanya memutuskan (tanpa permission approval terpisah) dalam SLA {settings.changeRequestSlaHours} jam. Perubahan yang disetujui berlaku pada publish berikutnya.
            </p>
            {settings.spvEditPjpDirect && <p>Pengaturan "edit PJP terbit langsung" aktif: pemegang update_pjp juga dapat mengubah PJP langsung di tab Rencana PJP (geser, generate, import).</p>}
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
                    {r.status === "pending" && slaOver(r.at) && <Badge variant="danger" className="mt-1">Lewat SLA {settings.changeRequestSlaHours} jam</Badge>}
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
                    ) : canApprove ? (
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
      )}

      {tab === "coverage" && <CoveragePanel salesId={salesId} onAdd={(o) => openAdd(o)} onPickSales={(id) => { setSalesId(id); setTab("plan"); }} />}

      {tab === "exec" && <ExecutionPanel key={salesId} salesId={salesId} entries={pjp.filter((e) => e.salesId === salesId)} outletMap={outletMap} shifts={pjpShifts} />}

      {tab === "plan" && (
        <>
          {week === "all" ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-semibold">Beban call per hari (4 minggu) — klik minggu untuk membuka detail</p>
                <LoadHeat matrix={matrix} settings={settings} onPick={(w) => setWeek(w)} current={cycle === 0 ? CURRENT_WEEK : undefined} cycle={cycle} branchId={s.branchId} />
              </CardContent>
            </Card>
          ) : (
            <>
              {canUpdate && drag && sameBranchSales.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-primary bg-accent/50 p-2 text-xs">
                  <UserRoundCog className="h-4 w-4 text-primary" />
                  <span className="font-medium">Lepas di salesman lain untuk memindahkan outlet:</span>
                  {sameBranchSales.map((x) => (
                    <span
                      key={x.id}
                      onDragOver={(ev) => { ev.preventDefault(); setOver(`s:${x.id}`); }}
                      onDragLeave={() => setOver(null)}
                      onDrop={(ev) => { ev.preventDefault(); if (drag) reassign(drag.id, x.id); endDrag(); }}
                      className={cn("rounded-full border px-3 py-1", over === `s:${x.id}` ? "border-primary bg-primary text-white" : "border-border bg-background")}
                    >
                      {x.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto mile-scroll">
                <div className="grid min-w-[1080px] grid-cols-6 gap-2">
                  {DAYS.map((dName, di) => {
                    const w = week;
                    const c = cellInfo(w, di);
                    const shiftedOut = !!c.shiftedTo;
                    const tone = capTone(c.n, settings.pjpCallTarget, settings.pjpMaxCalls);
                    const isToday = c.date === TODAY;
                    const sug = c.hol && !shiftedOut && c.base.length ? suggestShift(w, di) : null;
                    const items = [...(shiftedOut ? [] : c.base), ...c.incoming];
                    return (
                      <div
                        key={dName}
                        onDragOver={(ev) => { if (canUpdate && drag) { ev.preventDefault(); setOver(`d:${di}`); } }}
                        onDragLeave={() => setOver((o) => (o === `d:${di}` ? null : o))}
                        onDrop={(ev) => { ev.preventDefault(); if (drag) moveToDay(drag.id, drag.day, di); endDrag(); }}
                        className={cn("flex min-w-0 flex-col rounded-md border bg-background", isToday ? "border-primary ring-1 ring-primary/30" : "border-border", over === `d:${di}` && "bg-accent/60 ring-2 ring-primary", c.hol && "border-[#F0B6BC]")}
                      >
                        <div className={cn("space-y-1 rounded-t-md px-2.5 py-2", c.hol ? "bg-[#FAE5E7]" : "bg-muted")}>
                          <div className="flex items-center gap-1">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {dName} <span className="font-normal text-muted-foreground">{fmtShort(c.date)}</span>
                            </p>
                            <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE_CLS[tone])} title={`Target ${settings.pjpCallTarget}, maks ${settings.pjpMaxCalls}`}>
                              {c.n}/{settings.pjpCallTarget}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-background">
                            <div className={cn("h-1.5 rounded-full", tone === "over" ? "bg-[#DC3545]" : tone === "warn" ? "bg-[#F5B400]" : "bg-[#198754]")} style={{ width: `${Math.min(100, (c.n / settings.pjpMaxCalls) * 100)}%` }} />
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {isToday ? "Hari ini · " : ""}± {fmtDur(dayEstimate(items.length + c.ex.length, settings))}
                            {(() => {
                              const rIds = [...new Set(items.map((e) => e.routeId).filter(Boolean))] as string[];
                              const main = rIds.map((id) => routeMap.get(id)).find((r) => r?.day === di);
                              return main ? ` · ${main.name.replace(/^Rute \S+ – /, "")}` : "";
                            })()}
                          </p>
                          {c.hol && (
                            <div className="space-y-1 text-[11px] text-[#68121A]">
                              <p className="flex items-center gap-1 font-semibold">
                                <CalendarOff className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Libur: {c.hol.name}</span>
                              </p>
                              {shiftedOut ? (
                                <p className="flex items-center gap-1">
                                  {c.base.length} kunjungan digeser ke {fmtDate(c.shiftedTo!)}
                                  {canUpdate && (
                                    <button className="text-primary underline" onClick={() => setPjpShifts((l) => l.filter((x) => !(x.salesId === salesId && x.from === c.date)))} title="Batalkan geser">
                                      <Undo2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </p>
                              ) : c.base.length > 0 && sug && canUpdate ? (
                                <Button size="sm" variant="outline" className="h-6 w-full px-2 text-[11px]" onClick={() => shift(c.date, cycleDate(w, sug.d, cycle), c.base.length)}>
                                  Geser {c.base.length} ke {DAY_SHORT[sug.d]} {fmtShort(cycleDate(w, sug.d, cycle))}
                                </Button>
                              ) : c.base.length > 0 ? (
                                <p>{c.base.length} kunjungan perlu digeser</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="min-h-[120px] flex-1 space-y-1 p-1.5">
                          {items.map((e, k) => {
                            const o = outletMap.get(e.outletId);
                            if (!o) return null;
                            const moved = c.incoming.includes(e);
                            return (
                              <div
                                key={e.id + (moved ? "-in" : "")}
                                draggable={canUpdate && !moved}
                                onDragStart={(ev) => onDragStart(ev, e.id, di)}
                                onDragEnd={endDrag}
                                onDragOver={(ev) => { if (canUpdate && drag) ev.preventDefault(); }}
                                onDrop={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  if (drag && drag.id !== e.id) drag.day === di ? reorder(drag.id, e.id, di) : moveToDay(drag.id, drag.day, di);
                                  endDrag();
                                }}
                                title={`${k + 1}. ${o.name} · ${o.code} · ${FREQ_META[e.freq].label} · ${e.weeks.map((x) => `M${x}`).join(",")}`}
                                className={cn("group flex items-center gap-1 rounded-sm px-1 py-1 text-xs", moved ? "border border-dashed border-[#DC3545] bg-[#FAE5E7] text-[#68121A]" : "bg-accent text-[#01496A]", canUpdate && !moved && "cursor-grab", drag?.id === e.id && "opacity-40")}
                              >
                                {canUpdate && !moved && <GripVertical className="h-3 w-3 shrink-0 opacity-40" />}
                                <span className="w-4 shrink-0 text-right text-[10px] font-semibold opacity-70">{k + 1}</span>
                                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                                {isClosedOn(o, e.day) && (
                                  <span className="shrink-0 rounded-sm bg-[#DC3545] px-1 text-[9px] font-semibold text-white" title={`Outlet tutup di hari ${DAYS[e.day]} (buka: ${outletDays(o).map((d) => DAYS[d]).join(", ")})`}>
                                    Outlet tutup
                                  </span>
                                )}
                                <span className="shrink-0 text-[10px] font-semibold opacity-70">{moved ? "Geser" : e.freq}</span>
                                {canDelete && !moved && (
                                  <button onClick={() => setDelId(e.id)} className="hidden shrink-0 text-[#BF2130] group-hover:block" title="Hapus dari PJP">
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {c.hol && shiftedOut && c.base.length > 0 && <p className="px-1 text-[11px] text-muted-foreground">Kunjungan hari ini dipindah karena libur.</p>}
                          {c.ex.map((o) => (
                            <div key={o.id} className="flex items-center gap-1.5 rounded-sm border border-dashed border-[#E45C20] bg-[#FCEEE8] px-1.5 py-1 text-xs text-[#8D3711]" title="Extra call dari follow-up pipeline">
                              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{o.name}</span>
                              <span className="text-[10px] font-semibold">Extra</span>
                            </div>
                          ))}
                          {items.length === 0 && c.ex.length === 0 && <p className="p-2 text-center text-[11px] text-muted-foreground">Tidak ada kunjungan</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>Minggu {week}: {fmtDate(weekDates[week - 1][0])} – {fmtDate(weekDates[week - 1][1])}{cycle === 0 && week === CURRENT_WEEK ? " · minggu ini" : ""}</span>
                {canUpdate && <span>Seret kartu untuk memindah hari (pola semua minggu ikut berubah), seret ke kartu lain untuk mengubah urutan, atau ke salesman lain untuk memindah outlet.</span>}
                <span>Estimasi durasi = {settings.visitMinutes} menit kunjungan + {settings.travelMinutes} menit perjalanan per kunjungan.</span>
              </p>
            </>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <p className="min-w-0 flex-1 text-sm font-semibold">Entri PJP ({entries.length})</p>
              <Input className="h-[31px] w-full sm:w-[240px]" placeholder="Cari outlet / kode" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No.</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Rute · urutan</TableHead>
                    <TableHead>Frekuensi</TableHead>
                    <TableHead>Hari kunjungan</TableHead>
                    <TableHead>Minggu</TableHead>
                    <TableHead>Call</TableHead>
                    <TableHead>Berlaku</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.slice(0, 200).map((e, i) => {
                    const o = outletMap.get(e.outletId);
                    if (!o) return null;
                    const route = e.routeId ? routeMap.get(e.routeId) : undefined;
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{o.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.code} · {o.address}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs">
                          <p className="whitespace-nowrap">{route?.name ?? "—"}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">#{Math.round(e.seq)}</span>
                            {canUpdate && (
                              <>
                                <button onClick={() => move(e.id, -1, e.day)} className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Naikkan urutan">
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button onClick={() => move(e.id, 1, e.day)} className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Turunkan urutan">
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canUpdate ? (
                            <Select value={e.freq} onValueChange={(v) => changeFreq(e, v as Frequency)}>
                              <SelectTrigger className="h-[31px] w-[170px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FREQS.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {FREQ_META[f].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="whitespace-nowrap text-xs">{FREQ_META[e.freq].label}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canUpdate ? (
                            <Select value={String(e.day)} onValueChange={(v) => moveToDay(e.id, e.day, Number(v))}>
                              <SelectTrigger className="h-[31px] w-[110px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DAYS.map((d, di) => (
                                  <SelectItem key={d} value={String(di)} disabled={isClosedOn(o, di)}>
                                    {d}
                                    {isClosedOn(o, di) ? " (tutup)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="whitespace-nowrap text-xs">{DAYS[e.day]}</span>
                          )}
                          {isClosedOn(o, e.day) && (
                            <Badge variant="danger" className="mt-1 whitespace-nowrap" title={`Hari kunjungan outlet: ${outletDays(o).map((d) => DAYS[d]).join(", ")}. Pindahkan ke hari buka.`}>
                              <AlertTriangle className="mr-1 h-3 w-3" /> Outlet tutup
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canUpdate && (e.freq === "F1" || e.freq === "F2") ? (
                            <Select value={String(weekAlt(e))} onValueChange={(v) => update(e.id, { weeks: weeksFor(e.freq, Number(v)) })}>
                              <SelectTrigger className="h-[31px] w-[104px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(e.freq === "F2" ? [0, 1] : [0, 1, 2, 3]).map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {weeksFor(e.freq, n).map((w) => `M${w}`).join(" & ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs">{e.weeks.length === 4 ? "Semua" : e.weeks.map((w) => `M${w}`).join(", ")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{callsPerCycle(e)}×</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtDate(e.validFrom)}
                          <span className="block text-muted-foreground">s.d. {e.validTo ? fmtDate(e.validTo) : "tanpa batas"}</span>
                        </TableCell>
                        <TableCell>
                          {canDelete && (
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
              {entries.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Belum ada outlet di PJP. Klik Tambah outlet atau Generate otomatis.</p>}
              {tableRows.length > 200 && <p className="p-3 text-center text-xs text-muted-foreground">Menampilkan 200 dari {tableRows.length} entri; gunakan pencarian.</p>}
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
          <div className="space-y-2 p-4 text-sm">
            <p>
              Terbitkan call plan <b>Minggu {pubWeek}</b> ({fmtDate(cycleDate(pubWeek, 0, cycle))} – {fmtDate(cycleDate(pubWeek, 5, cycle))}) untuk <b>{s.name}</b>? <b>{pubCount}</b> task kunjungan dibuat di Mile Field, urut rute per hari (termasuk extra call follow-up).
            </p>
            {DAYS.some((_, d) => { const c = cellInfo(pubWeek, d); return c.hol && !c.shiftedTo && c.base.length > 0; }) && (
              <p className="flex items-start gap-1 text-xs text-[#6B5000]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ada kunjungan pada hari libur yang belum digeser; kunjungan tersebut tidak diterbitkan.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Batas publish: H-1 pukul {settings.publishCutoff} ({approvalOn ? "bila belum dipublikasikan, job malam menerbitkan versi Disetujui terakhir; PJP yang belum Disetujui tidak diterbitkan" : "bila belum dipublikasikan, Mile Field tetap memakai versi terbit terakhir"}). Pengingat call plan dikirim ke Mile Field pukul {settings.reminderTime}.
              {settings.lockAfterPublish ? " Setelah publish, perubahan lewat Permintaan Perubahan (kecuali pengaturan edit langsung untuk pemegang update_pjp aktif)." : ""}
            </p>
            <p className="text-xs text-muted-foreground">Status PJP menjadi Dipublikasikan. Perubahan sesudahnya berlaku pada publish berikutnya (idempotent: tidak ada task ganda).</p>
          </div>
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

      <Dialog open={!!pjpDecision} onOpenChange={(o) => !o && setPjpDecision(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Tolak PJP {pjpDecision ? salesOf(pjpDecision.salesId).name : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 p-4 text-sm">
            <Label>Alasan penolakan (wajib)</Label>
            <Textarea value={pjpDecision?.reason ?? ""} onChange={(e) => setPjpDecision((d) => (d ? { ...d, reason: e.target.value } : d))} />
            <p className="text-xs text-muted-foreground">PJP kembali ke Draft; pembuat memperbaiki lalu mengajukan ulang.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPjpDecision(null)}>
              Batal
            </Button>
            <Button disabled={!pjpDecision?.reason.trim()} onClick={rejectPjp}>
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Salin PJP ke siklus berikutnya</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 p-4 text-sm">
            <p>
              Versi {header?.version} ({entries.length} entri) berlaku s.d. <b>{fmtDate(addDays(nextStart, -1))}</b>. Salinannya menjadi versi {(header?.version ?? 1) + 1} berstatus <b>Draft</b>, berlaku mulai <b>{fmtDate(nextStart)}</b>, dan bisa diubah tanpa mengganggu siklus berjalan.
            </p>
            <p className="text-xs text-muted-foreground">Hari libur di siklus berikutnya (mis. Natal) ditandai di grid dan bisa digeser sebelum publish.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Batal
            </Button>
            <Button onClick={copyNext}>
              <Copy /> Salin
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
              <Label>Outlet ({branchOf(s.branchId).name}, belum di PJP)</Label>
              <Select
                value={form.outletId}
                onValueChange={(v) => {
                  const o = outletMap.get(v);
                  const r = o?.routeId ? routeMap.get(o.routeId) : undefined;
                  const want = r?.salesId === salesId && r.day !== undefined ? r.day : Number(form.day);
                  setForm((f) => ({ ...f, outletId: v, day: String(nearestDay(want, outletDays(o))) }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih outlet" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.slice(0, 150).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} · {o.code}
                      {o.salesId !== salesId ? ` · ${salesOf(o.salesId).name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {candidates.length === 0 && <p className="text-xs text-muted-foreground">Semua outlet aktif cabang ini sudah ada di PJP.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Frekuensi</Label>
                <Select value={form.freq} onValueChange={(v) => setForm((f) => ({ ...f, freq: v as Frequency, alt: "0" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQ_META[f].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Hari</Label>
                <Select value={form.day} onValueChange={(v) => setForm((f) => ({ ...f, day: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => {
                      const shut = isClosedOn(outletMap.get(form.outletId), i);
                      return (
                        <SelectItem key={d} value={String(i)} disabled={shut}>
                          {d} {shut ? "(tutup)" : `(${Math.max(...matrix.map((w) => w[i]))} call)`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Minggu</Label>
                <Select value={form.alt} onValueChange={(v) => setForm((f) => ({ ...f, alt: v }))} disabled={!(form.freq === "F1" || form.freq === "F2")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {form.freq === "F2"
                      ? [<SelectItem key="0" value="0">M1 &amp; M3</SelectItem>, <SelectItem key="1" value="1">M2 &amp; M4</SelectItem>]
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
            <p className="rounded-md bg-muted px-3 py-2 text-xs">
              Jadwal: <b>{DAYS[Number(form.day)]}</b> · {weeksFor(form.freq, Number(form.alt)).map((w) => `M${w}`).join(", ")} = <b>{callsPerCycle({ weeks: weeksFor(form.freq, Number(form.alt)) })} call / 4 minggu</b>
              {(() => {
                const peak = Math.max(...weeksFor(form.freq, Number(form.alt)).map((w) => matrix[w - 1][Number(form.day)] + 1));
                return peak > settings.pjpCallTarget ? <span className="mt-1 block text-[#6B5000]">Hari terpilih menjadi {peak} call (target {settings.pjpCallTarget}{peak > settings.pjpMaxCalls ? `, melebihi maks ${settings.pjpMaxCalls}` : ""}).</span> : null;
              })()}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
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
              Default frekuensi dari Pengaturan: {FREQ_META[settings.defaultFreq].label}; ubah bila perlu. {FREQ_HINT}
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

      <GenerateDialog open={genOpen} onOpenChange={setGenOpen} salesId={salesId} validFrom={cycle === 0 ? nextMonday(TODAY) : cStart} onApplied={() => setWeek(weekOf(cycle === 0 ? nextMonday(TODAY) : cStart) ?? 1)} />
      <ImportDialog open={impOpen} onOpenChange={setImpOpen} salesId={salesId} entries={entries} validFrom={cycle === 0 ? nextMonday(TODAY) : cStart} />
    </div>
  );
}

export { isOn };
