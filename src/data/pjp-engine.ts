/* PJP engine: pure functions shared by the mock seed, the PJP page and the dashboard.
 * No imports from mock.ts (avoids a circular import). */
import type { Frequency, Holiday, Outlet, PjpEntry, Route } from "./types";

export const FREQS: Frequency[] = ["F4", "F2", "F1"];

/** Visit more than 1x/week = F4 + extra call (D-47); extra calls are not part of the PJP. */
export const FREQ_HINT = "Butuh kunjungan lebih dari 1× seminggu? Pakai F4 + extra call.";

export const FREQ_META: Record<Frequency, { label: string; short: string; rank: number }> = {
  F1: { label: "Bulanan (F1)", short: "1× / 4 mgg", rank: 1 },
  F2: { label: "2 Mingguan (F2)", short: "2× / 4 mgg", rank: 2 },
  F4: { label: "Mingguan (F4)", short: "4× / 4 mgg", rank: 4 },
};

/** Week pattern: F1 → one week (alt 0..3), F2 → M1&M3 (alt even) / M2&M4 (alt odd), F4 → all weeks. */
export function weeksFor(freq: Frequency, alt = 0): number[] {
  if (freq === "F1") return [(alt % 4) + 1];
  if (freq === "F2") return alt % 2 === 0 ? [1, 3] : [2, 4];
  return [1, 2, 3, 4];
}

/** One visit day per entry, so calls per cycle = number of weeks. */
export const callsPerCycle = (e: Pick<PjpEntry, "weeks">) => e.weeks.length;
/** D-51: outlet visit days (default all 6). */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5];
export const outletDays = (o?: Pick<Outlet, "visitDays">) => (o?.visitDays?.length ? o.visitDays : ALL_DAYS);
export const isAllDays = (days: number[]) => ALL_DAYS.every((d) => days.includes(d));
export const isClosedOn = (o: Pick<Outlet, "visitDays"> | undefined, day: number) => !outletDays(o).includes(day);
/** Short label: "Semua hari" or "Sen, Rab, Jum". */
export const DAY_ABBR = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const visitDaysLabel = (days?: number[]) => (!days?.length || isAllDays(days) ? "Semua hari" : [...days].sort().map((d) => DAY_ABBR[d]).join(", "));
/** Nearest open day to `d` (same day first, then +1, -1, +2, ...), limited to `allowed`. */
export function nearestDay(d: number, allowed: number[]) {
  return [d, d + 1, d - 1, d + 2, d - 2, d + 3, d - 3, d + 4, d - 4, d + 5, d - 5].find((x) => x >= 0 && x <= 5 && allowed.includes(x)) ?? allowed[0] ?? d;
}
export const isOn = (e: Pick<PjpEntry, "weeks" | "day">, week: number, day: number) => e.day === day && e.weeks.includes(week);
export const validOn = (e: Pick<PjpEntry, "validFrom" | "validTo">, date: string) => e.validFrom <= date && (!e.validTo || e.validTo >= date);

/** 4 x 6 load matrix [week-1][day]. */
export function loadMatrix(entries: Pick<PjpEntry, "weeks" | "day">[]): number[][] {
  const m = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0, 0]);
  for (const e of entries) for (const w of e.weeks) m[w - 1][e.day]++;
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
  /** false = ignore the beat day and place each outlet on the lightest day. */
  keepRoute?: boolean;
  /** Filled by generate: outlets placed on another day because the route day is closed (D-51). */
  stats?: { closedShifted: number };
}

/**
 * Builds PJP entries from the given frequency (Settings default, D-48) + route (beat day) + route sequence, balancing the workload:
 * F4 is fixed on the beat day; F2 picks the week pattern and F1 the week with the lowest load,
 * and moves to a neighbouring day only when the beat day is above the daily target.
 */
export function generatePjp(inp: GenerateInput): PjpEntry[] {
  const load = [0, 1, 2, 3].map(() => [0, 0, 0, 0, 0, 0]);
  const work = inp.workDays?.length ? inp.workDays : [0, 1, 2, 3, 4, 5];
  const nearestWork = (d: number) => [d, d + 1, d - 1, d + 2, d - 2, d + 3, d - 3].find((x) => x >= 0 && x <= 5 && work.includes(x)) ?? work[0];
  const routeDay = new Map(inp.routes.filter((r) => r.salesId === inp.salesId).map((r) => [r.id, r.day ?? 0]));
  const dayTotal = (d: number) => load.reduce((a, w) => a + w[d], 0);
  const list = inp.outlets
    .map((o) => ({ o, f: inp.freqOf(o) }))
    .sort((a, b) => FREQ_META[b.f].rank - FREQ_META[a.f].rank || (a.o.routeId ?? "").localeCompare(b.o.routeId ?? "") || (a.o.routeSeq ?? 0) - (b.o.routeSeq ?? 0));
  const out: PjpEntry[] = [];
  for (const { o, f } of list) {
    let base = inp.keepRoute !== false && o.routeId !== undefined ? routeDay.get(o.routeId) : undefined;
    const fromRoute = base !== undefined;
    if (base === undefined) {
      const free = outletDays(o).filter((d) => work.includes(d));
      const cand = free.length ? free : work;
      base = cand.reduce((m, d) => (dayTotal(d) < dayTotal(m) ? d : m), cand[0]);
    }
    base = nearestWork(base);
    const open = outletDays(o).filter((d) => work.includes(d));
    const allowed = open.length ? open : outletDays(o);
    if (!allowed.includes(base)) {
      base = nearestDay(base, allowed);
      if (inp.stats && fromRoute) inp.stats.closedShifted++;
    }
    let day = base;
    let weeks = [1, 2, 3, 4];
    let moved = false;
    if (f === "F1" || f === "F2") {
      const weekOpts = f === "F1" ? [[1], [2], [3], [4]] : [[1, 3], [2, 4]];
      const dayOpts = [base, base - 1, base + 1].filter((d) => d >= 0 && d <= 5 && allowed.includes(d));
      let best = { cost: Infinity, d: base, w: weekOpts[0] };
      for (const d of dayOpts)
        for (const w of weekOpts) {
          const peak = Math.max(...w.map((x) => load[x - 1][d])) + 1;
          const cost = Math.max(0, peak - inp.target) * 100 + peak + (d !== base ? 6 : 0);
          if (cost < best.cost) best = { cost, d, w };
        }
      day = best.d;
      weeks = best.w;
      moved = best.d !== base;
    }
    for (const w of weeks) load[w - 1][day]++;
    out.push({
      id: inp.nextId(),
      salesId: inp.salesId,
      outletId: o.id,
      routeId: o.routeId,
      day,
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
