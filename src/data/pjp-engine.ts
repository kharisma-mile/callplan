/* PJP engine: pure functions shared by the mock seed, the PJP page and the dashboard.
 * No imports from mock.ts (avoids a circular import). */
import type { Frequency, Holiday, Outlet, PjpEntry, Route } from "./types";

export const FREQS: Frequency[] = ["F1", "F2", "F4", "F8", "F12"];

export const FREQ_META: Record<Frequency, { label: string; short: string; perWeek: number; allWeeks: boolean; rank: number }> = {
  F1: { label: "F1 · 1×/4 minggu", short: "1× / 4 mgg", perWeek: 1, allWeeks: false, rank: 1 },
  F2: { label: "F2 · 2 minggu sekali", short: "2× / 4 mgg", perWeek: 1, allWeeks: false, rank: 2 },
  F4: { label: "F4 · tiap minggu", short: "4× / 4 mgg", perWeek: 1, allWeeks: true, rank: 4 },
  F8: { label: "F8 · 2×/minggu", short: "8× / 4 mgg", perWeek: 2, allWeeks: true, rank: 8 },
  F12: { label: "F12 · 3×/minggu", short: "12× / 4 mgg", perWeek: 3, allWeeks: true, rank: 12 },
};

/** Week pattern: F1 → one week (alt 0..3), F2 → M1&M3 (alt even) / M2&M4 (alt odd), F4+ → all weeks. */
export function weeksFor(freq: Frequency, alt = 0): number[] {
  if (freq === "F1") return [(alt % 4) + 1];
  if (freq === "F2") return alt % 2 === 0 ? [1, 3] : [2, 4];
  return [1, 2, 3, 4];
}

/** Default visit days from a base day: F8 → base + 3 days (Mon & Thu), F12 → every 2 days (Mon, Wed, Fri). */
export function daysFor(freq: Frequency, base: number): number[] {
  if (freq === "F8") return [base, (base + 3) % 6].sort((a, b) => a - b);
  if (freq === "F12") return [base, (base + 2) % 6, (base + 4) % 6].sort((a, b) => a - b);
  return [base];
}

export const callsPerCycle = (e: Pick<PjpEntry, "weeks" | "days">) => e.weeks.length * e.days.length;
export const isOn = (e: Pick<PjpEntry, "weeks" | "days">, week: number, day: number) => e.weeks.includes(week) && e.days.includes(day);
export const validOn = (e: Pick<PjpEntry, "validFrom" | "validTo">, date: string) => e.validFrom <= date && (!e.validTo || e.validTo >= date);

/** 4 x 6 load matrix [week-1][day]. */
export function loadMatrix(entries: Pick<PjpEntry, "weeks" | "days">[]): number[][] {
  const m = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0, 0]);
  for (const e of entries) for (const w of e.weeks) for (const d of e.days) m[w - 1][d]++;
  return m;
}

/** Deterministic 0..1 hash (FNV-1a) so simulated execution is stable across reloads. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function pathKm(points: { lat: number; lng: number }[]) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

/* ---------------- auto-generate ---------------- */
export interface GenerateInput {
  salesId: string;
  outlets: Outlet[];
  routes: Route[];
  freqOf: (o: Outlet) => Frequency;
  target: number;
  validFrom: string;
  nextId: () => string;
  /** Working days of the branch (default Mon-Sat). */
  workDays?: number[];
  /** Load weight per outlet: 1 = balance by call count; visit minutes / average = balance by duration. */
  weightOf?: (o: Outlet) => number;
  /** false = ignore the beat day and place each outlet on the lightest day. */
  keepRoute?: boolean;
}

/**
 * Builds PJP entries from outlet frequency + route (beat day) + route sequence, balancing the workload:
 * F4/F8/F12 are fixed on the beat day(s); F2 picks the week pattern and F1 the week with the lowest load,
 * and moves to a neighbouring day only when the beat day is above the daily target.
 */
export function generatePjp(inp: GenerateInput): PjpEntry[] {
  const load = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0, 0]);
  const work = inp.workDays?.length ? inp.workDays : [0, 1, 2, 3, 4, 5];
  const nearestWork = (d: number) => [d, d + 1, d - 1, d + 2, d - 2, d + 3, d - 3].find((x) => x >= 0 && x <= 5 && work.includes(x)) ?? work[0];
  const weight = inp.weightOf ?? (() => 1);
  const routeDay = new Map(inp.routes.filter((r) => r.salesId === inp.salesId).map((r) => [r.id, r.day ?? 0]));
  const dayTotal = (d: number) => load.reduce((a, w) => a + w[d], 0);
  const list = inp.outlets
    .map((o) => ({ o, f: inp.freqOf(o) }))
    .sort((a, b) => FREQ_META[b.f].rank - FREQ_META[a.f].rank || (a.o.routeId ?? "").localeCompare(b.o.routeId ?? "") || (a.o.routeSeq ?? 0) - (b.o.routeSeq ?? 0));
  const out: PjpEntry[] = [];
  for (const { o, f } of list) {
    const wt = weight(o);
    let base = inp.keepRoute !== false && o.routeId !== undefined ? routeDay.get(o.routeId) : undefined;
    if (base === undefined) base = work.reduce((m, d) => (dayTotal(d) < dayTotal(m) ? d : m), work[0]);
    base = nearestWork(base);
    let days = [...new Set(daysFor(f, base).map(nearestWork))].sort((a, b) => a - b);
    let weeks = [1, 2, 3, 4];
    let moved = false;
    if (f === "F1" || f === "F2") {
      const weekOpts = f === "F1" ? [[1], [2], [3], [4]] : [[1, 3], [2, 4]];
      const dayOpts = [base, base - 1, base + 1].filter((d) => d >= 0 && d <= 5 && work.includes(d));
      let best = { cost: Infinity, d: base, w: weekOpts[0] };
      for (const d of dayOpts)
        for (const w of weekOpts) {
          const peak = Math.max(...w.map((x) => load[x - 1][d])) + wt;
          const cost = Math.max(0, peak - inp.target) * 100 + peak + (d !== base ? 6 : 0);
          if (cost < best.cost) best = { cost, d, w };
        }
      days = [best.d];
      weeks = best.w;
      moved = best.d !== base;
    }
    for (const w of weeks) for (const d of days) load[w - 1][d] += wt;
    out.push({
      id: inp.nextId(),
      salesId: inp.salesId,
      outletId: o.id,
      routeId: o.routeId,
      days,
      freq: f,
      weeks,
      seq: (o.routeSeq ?? 50) + (moved ? 100 : 0),
      validFrom: inp.validFrom,
    });
  }
  return out;
}

/* ---------------- simulated execution (Mile Field webhook data) ---------------- */
export type ExecStatus = "Selesai" | "Dilewati" | "Dijadwalkan ulang" | "Terlewat" | "Berjalan" | "Rencana" | "Libur";
export const SKIP_REASONS = ["Toko tutup", "Pemilik tidak ada", "Di luar jam kerja", "Stok masih banyak", "Lainnya"];

export interface ExecLine {
  key: string;
  outletId: string;
  seq: number;
  source: "PJP" | "Carry-over" | "Extra";
  status: ExecStatus;
  reason?: string;
  checkIn?: string;
  checkOut?: string;
  effective: boolean;
  movedTo?: string;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function outcome(key: string, date: string, reasons: string[] = SKIP_REASONS) {
  const r = hash01(key + date);
  if (r < 0.8) return { status: "Selesai" as const };
  if (r < 0.89) return { status: "Dilewati" as const, reason: reasons[Math.floor(hash01(key + date + "r") * reasons.length)] };
  if (r < 0.95) return { status: "Dijadwalkan ulang" as const, reason: "Dijadwalkan ulang" };
  return { status: "Terlewat" as const };
}

/**
 * Simulates one salesman-day. `planned` = PJP lines in route order, `prevPlanned` = lines of the previous working day
 * (their "Dijadwalkan ulang" lines come back today as carry-over), `extraPool` = other outlets for unplanned extra calls.
 */
export function simulateDay(opts: {
  date: string;
  today: string;
  salesId: string;
  planned: { key: string; outletId: string }[];
  prevPlanned?: { key: string; outletId: string }[];
  prevDate?: string;
  extraPool?: string[];
  holiday?: boolean;
  skipReasons?: string[];
  /** false = rescheduled visits do not come back as carry-over (setting "off"). */
  carryOver?: boolean;
}): ExecLine[] {
  const { date, today } = opts;
  if (opts.holiday) return opts.planned.map((p, i) => ({ key: p.key, outletId: p.outletId, seq: i + 1, source: "PJP", status: "Libur", effective: false }));
  const lines: ExecLine[] = opts.planned.map((p, i) => ({ key: p.key, outletId: p.outletId, seq: i + 1, source: "PJP", status: "Rencana", effective: false }));
  if (opts.carryOver !== false && opts.prevPlanned && opts.prevDate && opts.prevDate < today)
    for (const p of opts.prevPlanned)
      if (outcome(p.key, opts.prevDate).status === "Dijadwalkan ulang") lines.push({ key: p.key + "@co", outletId: p.outletId, seq: lines.length + 1, source: "Carry-over", status: "Rencana", effective: false });
  const nExtra = date > today ? 0 : Math.floor(hash01(opts.salesId + date + "x") * 3);
  const pool = opts.extraPool ?? [];
  for (let k = 0; k < nExtra && pool.length; k++) {
    const id = pool[Math.floor(hash01(opts.salesId + date + "e" + k) * pool.length)];
    if (!lines.some((l) => l.outletId === id)) lines.push({ key: `X-${id}-${date}`, outletId: id, seq: lines.length + 1, source: "Extra", status: "Selesai", effective: false });
  }
  if (date > today) return lines.filter((l) => l.source !== "Extra");
  let clock = 8 * 60 + Math.floor(hash01(opts.salesId + date) * 25);
  const doneUntil = date < today ? lines.length : Math.round(lines.length * 0.4);
  lines.forEach((l, i) => {
    const res = l.source === "Extra" ? { status: "Selesai" as const } : outcome(l.key, date, opts.skipReasons);
    if (i >= doneUntil) {
      l.status = i === doneUntil && date === today ? "Berjalan" : "Rencana";
      if (l.status === "Berjalan") l.checkIn = hhmm(clock);
      return;
    }
    l.status = res.status;
    l.reason = "reason" in res ? res.reason : undefined;
    if (res.status === "Selesai") {
      const dur = 18 + Math.floor(hash01(l.key + date + "d") * 25);
      l.checkIn = hhmm(clock);
      l.checkOut = hhmm(clock + dur);
      clock += dur + 10 + Math.floor(hash01(l.key + "t") * 15);
      l.effective = hash01(l.key + date + "e") < 0.58;
    }
  });
  return lines;
}

export function isHoliday(holidays: Holiday[], date: string, branchId: string) {
  return holidays.find((h) => h.date === date && (!h.branchIds || h.branchIds.includes(branchId)));
}
