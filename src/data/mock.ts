import type {
  Assortment,
  AssortmentException,
  OwnershipLog,
  ApprovalRequest,
  Branch,
  CustomerStatus,
  ImportLog,
  ModuleUser,
  Opportunity,
  OppStage,
  OppType,
  Order,
  Outlet,
  PjpEntry,
  PjpChangeRequest,
  PriceList,
  Product,
  Region,
  Route,
  Salesman,
  Settings,
  Spv,
  SyncDomain,
  SyncError,
  TargetRow,
  FollowKind,
  Holiday,
  PjpHeader,
  Frequency,
} from "./types";
import { generatePjp, hash01, isOn, simulateDay, validOn } from "./pjp-engine";

/* ---------- deterministic RNG so the demo is identical every load ---------- */
let seed = 20261117;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));

export const TODAY = "2026-11-17";
export const CURRENT_MONTH = "2026-11";
/** Start (Monday) of the current 4-week PJP rotation. */
export const CYCLE_START = "2026-11-02";
export const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Date math in UTC so the result does not depend on the browser time zone (WIB = UTC+7). */
export function addDays(iso: string, n: number) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Map an ISO date to {week 1..4, day 0..5} of rotation `cycle` (0 = current, 1 = next), or null. */
export function cyclePos(iso: string, cycle = 0): { week: number; day: number } | null {
  const start = new Date(cycleStart(cycle) + "T00:00:00Z").getTime();
  const t = new Date(iso.slice(0, 10) + "T00:00:00Z").getTime();
  const diff = Math.round((t - start) / 86400000);
  if (diff < 0 || diff >= 28) return null;
  const day = diff % 7;
  if (day > 5) return null;
  return { week: Math.floor(diff / 7) + 1, day };
}
export function cycleStart(cycle = 0) {
  return addDays(CYCLE_START, cycle * 28);
}
export function cycleDate(week: number, day: number, cycle = 0) {
  return addDays(cycleStart(cycle), (week - 1) * 7 + day);
}
/** Previous working day (Mon-Sat) of an ISO date. */
export function prevWorkday(iso: string) {
  let d = addDays(iso, -1);
  if (new Date(d + "T00:00:00Z").getUTCDay() === 0) d = addDays(d, -1);
  return d;
}

/* ---------- org ---------- */
export const BRANCHES: Branch[] = [
  { id: "JKT", name: "Cabang Jakarta", city: "Jakarta Barat" },
  { id: "TGR", name: "Cabang Tangerang", city: "Tangerang" },
  { id: "BDG", name: "Cabang Bandung", city: "Bandung" },
  { id: "SMG", name: "Cabang Semarang", city: "Semarang" },
  { id: "SBY", name: "Cabang Surabaya", city: "Surabaya" },
  { id: "MDN", name: "Cabang Medan", city: "Medan" },
  { id: "PLG", name: "Cabang Palembang", city: "Palembang" },
  { id: "MKS", name: "Cabang Makassar", city: "Makassar" },
  { id: "DPS", name: "Cabang Denpasar", city: "Denpasar" },
  { id: "HQ", name: "HQ Direct Sales", city: "Jakarta" },
];

const FIRST = ["Andi", "Bayu", "Citra", "Dimas", "Eko", "Fajar", "Gilang", "Hadi", "Indra", "Joko", "Kurniawan", "Lukman", "Maya", "Nanda", "Oki", "Putri", "Rizky", "Slamet", "Taufik", "Umar", "Vina", "Wahyu", "Yoga", "Zainal", "Arif", "Bambang", "Dodi", "Ferry", "Galih", "Hendro", "Irfan", "Rudi", "Teguh", "Yusuf", "Wawan", "Agung"];
const LAST = ["Saputra", "Pratama", "Wibowo", "Hidayat", "Nugroho", "Santoso", "Setiawan", "Kurnia", "Siregar", "Gunawan", "Halim", "Purnomo", "Sitompul", "Rahman", "Firmansyah", "Susanto", "Hartono", "Lubis", "Wijaya", "Prasetyo"];

const SALES_COUNT: Record<string, number> = { JKT: 7, TGR: 6, BDG: 6, SMG: 6, SBY: 7, MDN: 6, PLG: 6, MKS: 6, DPS: 6, HQ: 5 };

export const SPVS: Spv[] = [];
export const SALESMEN: Salesman[] = [];

const usedNames = new Set<string>();
function personName() {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) {
      usedNames.add(n);
      return n;
    }
  }
}
// fixed demo personas
["Dewi Lestari", "Rina Kusuma"].forEach((n) => usedNames.add(n));

for (const b of BRANCHES) {
  const spvCount = b.id === "HQ" ? 1 : 2;
  for (let i = 1; i <= spvCount; i++) {
    const id = `SPV-${b.id}-${i}`;
    SPVS.push({ id, name: b.id === "SBY" && i === 1 ? "Dewi Lestari" : personName(), branchId: b.id });
  }
  const n = SALES_COUNT[b.id];
  for (let i = 1; i <= n; i++) {
    SALESMEN.push({
      id: `S-${b.id}-${String(i).padStart(2, "0")}`,
      code: `${b.id}${String(i).padStart(2, "0")}`,
      name: personName(),
      branchId: b.id,
      spvId: `SPV-${b.id}-${b.id === "HQ" ? 1 : i <= Math.ceil(n / 2) ? 1 : 2}`,
    });
  }
}

/* ---------- products ---------- */
export const PRODUCTS: Product[] = [
  { id: "P01", sku: "UP-KHD-2440", name: "Kantong Plastik HD 24x40", category: "Kantong", uoms: [{ uom: "pack", price: 18500, conv: 1 }, { uom: "karton", price: 362000, conv: 20 }] },
  { id: "P02", sku: "UP-KHD-3555", name: "Kantong Plastik HD 35x55", category: "Kantong", uoms: [{ uom: "pack", price: 27500, conv: 1 }, { uom: "karton", price: 540000, conv: 20 }] },
  { id: "P03", sku: "UP-GPP-16", name: "Gelas Plastik PP 16 oz", category: "Food Packaging", uoms: [{ uom: "pack", price: 21000, conv: 1 }, { uom: "karton", price: 1000000, conv: 50 }] },
  { id: "P04", sku: "UP-TW-500", name: "Thinwall 500 ml + Tutup", category: "Food Packaging", uoms: [{ uom: "pack", price: 32000, conv: 1 }, { uom: "karton", price: 780000, conv: 25 }] },
  { id: "P05", sku: "UP-PET-600", name: "Botol PET 600 ml", category: "Botol", uoms: [{ uom: "pcs", price: 850, conv: 1 }, { uom: "karton", price: 196000, conv: 240 }] },
  { id: "P06", sku: "UP-WRP-30", name: "Plastik Wrap 30 cm x 500 m", category: "Film", uoms: [{ uom: "pcs", price: 98000, conv: 1 }, { uom: "karton", price: 1150000, conv: 12 }] },
  { id: "P07", sku: "UP-EMB-15", name: "Ember Plastik 15 L", category: "Rumah Tangga", uoms: [{ uom: "pcs", price: 24500, conv: 1 }, { uom: "karton", price: 285000, conv: 12 }] },
  { id: "P08", sku: "UP-KFG-1000", name: "Kontainer Food Grade 1000 ml", category: "Food Packaging", uoms: [{ uom: "pack", price: 45000, conv: 1 }, { uom: "karton", price: 870000, conv: 20 }] },
  { id: "P09", sku: "UP-SDT-6", name: "Sedotan Steril 6 mm", category: "Food Packaging", uoms: [{ uom: "pack", price: 9500, conv: 1 }, { uom: "karton", price: 460000, conv: 50 }] },
  { id: "P10", sku: "UP-BPP-RG", name: "Biji Plastik PP Regrind", category: "Bahan Baku", uoms: [{ uom: "kg", price: 14200, conv: 1 }] },
  { id: "P11", sku: "UP-KRG-5090", name: "Karung Plastik 50x90", category: "Karung", uoms: [{ uom: "pcs", price: 2300, conv: 1 }, { uom: "bal", price: 225000, conv: 100 }] },
  { id: "P12", sku: "UP-STR-PE", name: "Stretch Film PE 50 cm", category: "Film", uoms: [{ uom: "pcs", price: 112000, conv: 1 }, { uom: "karton", price: 640000, conv: 6 }] },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)!;

/* ---------- outlets ---------- */
const PREFIX = ["Toko", "UD", "CV", "PT", "Toko Plastik", "Grosir"];
const OUTLET_NAMES = ["Sinar Jaya", "Makmur Abadi", "Sumber Rejeki", "Berkah Plastik", "Mitra Kemasan", "Cahaya Baru", "Maju Bersama", "Sentosa", "Harapan Jaya", "Mulia Pack", "Anugerah", "Karya Utama", "Indah Plastik", "Surya Kencana", "Bintang Timur", "Rejeki Lancar", "Sejahtera", "Murni", "Gemilang", "Nusantara Pack", "Prima Kemas", "Tunas Baru", "Lancar Jaya", "Abadi Sentosa", "Mega Plastik", "Jaya Mandiri", "Setia Kawan", "Bumi Kemasan", "Duta Plastik", "Kencana"];
const SEGMENTS = ["Grosir Plastik", "Toko Kemasan", "Industri F&B", "Horeka", "Agen / Sub-distributor", "Toko Kelontong"];
const STREETS = ["Jl. Raya", "Jl. Pasar", "Jl. Industri", "Jl. Merdeka", "Jl. Pahlawan", "Jl. Diponegoro", "Jl. Ahmad Yani", "Jl. Gatot Subroto"];

/* ---------- routes / beats (module 03 + 04): 6 beats per salesman, one per weekday ---------- */
const CITY_GEO: Record<string, { lat: number; lng: number; areas: string[] }> = {
  JKT: { lat: -6.168, lng: 106.79, areas: ["Grogol", "Kebon Jeruk", "Cengkareng", "Kalideres", "Tambora", "Taman Sari", "Palmerah", "Kembangan", "Pluit", "Tanjung Duren"] },
  TGR: { lat: -6.178, lng: 106.63, areas: ["Cikokol", "Karawaci", "Cipondoh", "Batuceper", "Jatiuwung", "Periuk", "Ciledug", "Serpong", "Cikupa", "Balaraja"] },
  BDG: { lat: -6.914, lng: 107.61, areas: ["Cibadak", "Kopo", "Astana Anyar", "Cicadas", "Antapani", "Buah Batu", "Sukajadi", "Cimahi", "Gedebage", "Soreang"] },
  SMG: { lat: -6.99, lng: 110.42, areas: ["Johar", "Kaligawe", "Genuk", "Tugu", "Banyumanik", "Pedurungan", "Ngaliyan", "Candisari", "Mranggen", "Ungaran"] },
  SBY: { lat: -7.257, lng: 112.75, areas: ["Rungkut", "Kenjeran", "Tandes", "Wonokromo", "Gubeng", "Pabean", "Sukolilo", "Benowo", "Waru", "Sidoarjo Kota"] },
  MDN: { lat: 3.595, lng: 98.672, areas: ["Medan Kota", "Belawan", "Amplas", "Helvetia", "Sunggal", "Tembung", "Marelan", "Petisah", "Deli Tua", "Binjai"] },
  PLG: { lat: -2.976, lng: 104.775, areas: ["Ilir Barat", "Ilir Timur", "Seberang Ulu", "Kertapati", "Sako", "Plaju", "Kalidoni", "Sukarami", "Gandus", "Banyuasin"] },
  MKS: { lat: -5.147, lng: 119.432, areas: ["Panakkukang", "Tallo", "Biringkanaya", "Tamalate", "Rappocini", "Mariso", "Ujung Tanah", "Manggala", "Gowa", "Maros"] },
  DPS: { lat: -8.65, lng: 115.216, areas: ["Denpasar Barat", "Denpasar Timur", "Kuta", "Sanur", "Ubung", "Gianyar", "Mengwi", "Jimbaran", "Tabanan", "Kerobokan"] },
  HQ: { lat: -6.21, lng: 106.82, areas: ["Pulogadung", "Cikarang", "Bekasi", "Cibitung", "Karawang", "Sunter", "Marunda", "Cakung", "Bogor", "Depok"] },
};
export const BRANCH_GEO = CITY_GEO;
const AREA_TYPES = ["Pusat Kota", "Pasar & Pergudangan", "Kawasan Industri"];
export const ROUTES: Route[] = [];
SALESMEN.forEach((s) => {
  const idx = Number(s.id.slice(-2)) - 1;
  const geo = CITY_GEO[s.branchId];
  for (let d = 0; d < 6; d++) {
    const area = geo.areas[(idx * 3 + d) % geo.areas.length];
    ROUTES.push({
      id: `R-${s.code}-${d + 1}`,
      code: `${s.code}-R${d + 1}`,
      name: `Rute ${DAYS[d]} – ${area}`,
      branchId: s.branchId,
      salesId: s.id,
      area: `${area} · ${AREA_TYPES[(idx + d) % 3]}`,
      active: true,
      day: d,
    });
  }
});

/* ---------- outlets: ~60-120 per salesman, grouped in beats with a route sequence ---------- */
export const OUTLETS: Outlet[] = [];
/** Seed only: the frequency the SPV picked per PJP entry (D-48: frequency lives on the PJP entry, not the outlet). */
const SEED_FREQ = new Map<string, Frequency>();
let outletSeq = 1;
for (const s of SALESMEN) {
  const b = BRANCHES.find((x) => x.id === s.branchId)!;
  const idx = Number(s.id.slice(-2)) - 1;
  const geo = CITY_GEO[s.branchId];
  const isHQ = s.branchId === "HQ";
  const count = isHQ ? between(40, 60) : between(72, 122);
  // beat cluster centre + travel direction per weekday
  const beats = [0, 1, 2, 3, 4, 5].map((d) => {
    const ang = ((idx * 6 + d) / 42) * Math.PI * 2 + rnd() * 0.4;
    const rad = 0.025 + rnd() * 0.05;
    const dir = rnd() * Math.PI * 2;
    return { lat: geo.lat + Math.sin(ang) * rad, lng: geo.lng + Math.cos(ang) * rad, dir, n: 0 };
  });
  for (let i = 0; i < count; i++) {
    // Outlet size (seed only, not stored): drives credit limit, price group and the seeded PJP frequency.
    const r0 = rnd();
    const size = isHQ ? (r0 < 0.5 ? 3 : r0 < 0.85 ? 2 : 1) : r0 < 0.36 ? 3 : r0 < 0.76 ? 2 : 1;
    const r = rnd();
    const status: CustomerStatus = r < 0.06 ? "baru" : r < 0.86 ? "lama_beli" : "lama_belum";
    const creditLimit = status === "baru" ? 0 : size === 3 ? between(15, 40) * 10_000_000 : size === 2 ? between(5, 15) * 10_000_000 : between(1, 5) * 10_000_000;
    const outstanding = status === "lama_beli" ? Math.round(creditLimit * (0.2 + rnd() * 0.75)) : 0;
    const hasOverdue = outstanding > 0 && rnd() < 0.3;
    const overdueDays = hasOverdue ? between(5, 52) : 0;
    const code = `C-${s.branchId}-${String(outletSeq).padStart(4, "0")}`;
    const d = i % 6;
    const beat = beats[d];
    beat.n++;
    const step = 0.0035 * beat.n;
    const jitter = (rnd() - 0.5) * 0.004;
    OUTLETS.push({
      id: `O${outletSeq}`,
      code,
      name: `${pick(PREFIX)} ${pick(OUTLET_NAMES)}${rnd() < 0.3 ? " " + geo.areas[(idx * 3 + d) % geo.areas.length] : ""}`,
      owner: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `08${between(11, 59)}-${between(1000, 9999)}-${between(1000, 9999)}`,
      address: `${pick(STREETS)} No. ${between(1, 250)}, ${geo.areas[(idx * 3 + d) % geo.areas.length]}`,
      city: b.city,
      branchId: s.branchId,
      salesId: s.id,
      status,
      segment: pick(SEGMENTS),
      creditLimit,
      outstanding,
      overdue: hasOverdue ? Math.round(outstanding * (0.2 + rnd() * 0.5)) : 0,
      overdueDays,
      top: status === "baru" ? 0 : pick([14, 30, 30, 45]),
      lastOrder: status === "lama_beli" ? addDays(TODAY, -between(2, 40)) : undefined,
      odooRef: status === "baru" ? undefined : `res.partner/${10400 + outletSeq}`,
      active: true,
      gps:
        status === "baru" && rnd() < 0.3
          ? undefined
          : {
              lat: Number((beat.lat + Math.sin(beat.dir) * step + Math.cos(beat.dir) * jitter).toFixed(5)),
              lng: Number((beat.lng + Math.cos(beat.dir) * step - Math.sin(beat.dir) * jitter).toFixed(5)),
            },
      npwp: rnd() < 0.45 ? `0${between(1, 9)}.${between(100, 999)}.${between(100, 999)}.${between(1, 9)}-${between(100, 999)}.000` : undefined,
      pkp: false,
      priceGroup: size === 3 ? "Grosir" : pick(["Retail", "Retail", "Grosir", "Horeka / Industri"]),
      routeId: `R-${s.code}-${d + 1}`,
      routeSeq: beat.n,
      visitDays: [0, 1, 2, 3, 4, 5],
      source: status === "baru" ? "noo" : "odoo",
    });
    const last = OUTLETS[OUTLETS.length - 1];
    SEED_FREQ.set(last.id, status === "lama_belum" ? "F2" : size === 3 ? "F4" : size === 2 ? "F2" : "F1");
    last.pkp = !!last.npwp && rnd() < 0.6;
    outletSeq++;
  }
}
/* D-51: ~15% of outlets have restricted visit days (deterministic hash, does not shift the rnd() sequence). */
const VISIT_PATTERNS = [[0, 1, 2, 3, 5], [0, 1, 2, 3, 4], [0, 2, 4], [1, 3, 5], [0, 1, 2, 3]];
for (const o of OUTLETS) {
  if (hash01(o.id + "vd") < 0.15) o.visitDays = VISIT_PATTERNS[Math.floor(hash01(o.id + "vp") * VISIT_PATTERNS.length)];
}
export function nextOutletSeq() {
  return outletSeq++;
}

/* ---------- PJP ---------- */
export { weeksFor } from "./pjp-engine";
export const PJP: PjpEntry[] = [];
let pjpSeq = 1;
export function nextPjpId() {
  return `PJP${pjpSeq++}`;
}
/** Outlets deliberately left out of the seeded PJP so the coverage panel has something to show. */
export const UNCOVERED_SEED = new Set<string>();
for (const s of SALESMEN) {
  const outlets = OUTLETS.filter((o) => o.salesId === s.id && o.status !== "baru");
  outlets.forEach((o, i) => {
    if (i === outlets.length - 1 || rnd() < 0.015) UNCOVERED_SEED.add(o.id);
  });
  PJP.push(
    ...generatePjp({
      salesId: s.id,
      outlets: outlets.filter((o) => !UNCOVERED_SEED.has(o.id)),
      routes: ROUTES,
      freqOf: (o) => SEED_FREQ.get(o.id) ?? "F2",
      target: 12,
      validFrom: "2026-10-05",
      nextId: nextPjpId,
    })
  );
}

/** D-51 demo: 2 outlets of S-SBY-01 changed their visit days after the PJP was made → entry flagged "Outlet tutup" (not moved). */
export const CLOSED_DAY_CONFLICT_SEED: string[] = [];
{
  const own = PJP.filter((e) => e.salesId === SALESMEN.find((x) => x.spvId === "SPV-SBY-1")!.id);
  for (const e of [own[3], own[17]].filter(Boolean)) {
    const o = OUTLETS.find((x) => x.id === e.outletId)!;
    o.visitDays = [0, 1, 2, 3, 4, 5].filter((d) => d !== e.day);
    CLOSED_DAY_CONFLICT_SEED.push(o.id);
  }
}

/** PJP header per salesman (version, status, validity). */
export const PJP_HEADERS: PjpHeader[] = SALESMEN.map((s, i) => ({
  salesId: s.id,
  version: 2 + (i % 3),
  status: s.id === "S-SBY-02" ? "Disetujui" : s.id === "S-SBY-03" ? "Menunggu Approval" : "Dipublikasikan",
  validFrom: "2026-10-05",
  publishedAt: s.id === "S-SBY-02" || s.id === "S-SBY-03" ? undefined : "2026-11-16 06:00",
  note: s.id === "S-SBY-02" ? "Disetujui, menunggu publish" : s.id === "S-SBY-03" ? "Diajukan SPV, menunggu approval" : undefined,
  submittedBy: s.id === "S-SBY-02" || s.id === "S-SBY-03" ? "SPV Surabaya" : undefined,
  submittedAt: s.id === "S-SBY-02" || s.id === "S-SBY-03" ? "2026-11-17 15:00" : undefined,
  approvedBy: s.id === "S-SBY-02" ? "Rina Kusuma" : undefined,
  approvedAt: s.id === "S-SBY-02" ? "2026-11-17 16:30" : undefined,
}));

/** Holiday calendar (dummy). National holidays apply to all branches; branchIds limits a local holiday. */
export const HOLIDAYS: Holiday[] = [
  { date: "2026-11-20", name: "Libur daerah (contoh)", branchIds: ["SBY", "SMG"] },
  { date: "2026-12-24", name: "Cuti bersama Natal" },
  { date: "2026-12-25", name: "Hari Raya Natal" },
  { date: "2027-01-01", name: "Tahun Baru 2027" },
];

/* ---------- pipeline ---------- */
const STAGES_SEED: OppStage[] = ["Prospek", "Prospek", "Dijadwalkan", "Dijadwalkan", "Kunjungan & Negosiasi", "Kunjungan & Negosiasi", "Kunjungan & Negosiasi", "Menang", "Batal"];
const PROSPECT_NAMES = ["Rumah Makan Padang Sederhana", "Kopi Kenangan Mantan Ruko", "Pabrik Roti Sari Wangi", "Katering Bu Ningsih", "Toko Kue Lestari", "Depot Air Isi Ulang Tirta", "Minimarket Barokah", "Pabrik Kerupuk Dua Putri", "Es Teh Nusantara Outlet", "Bakso Pak Kumis", "CV Snack Gurih Mandiri", "Laundry Kilat Bersih", "PT Sambal Ibu Nusa", "Frozen Food Mama Ina", "Warung Kopi Tepi Kali", "Toko Grosir Sembako Amanah", "Ayam Geprek Juara", "PT Mie Ayam Nusantara", "Kedai Jus Segar", "Bengkel Cuci Mobil Prima"];
const BATAL_REASONS = ["Harga", "Kompetitor", "Belum butuh", "Masalah kredit / pembayaran", "Tidak bisa dihubungi", "Lainnya"];
export { BATAL_REASONS };

export const OPPORTUNITIES: Opportunity[] = [];
let oppSeq = 1;
function seedOpp(salesId: string, stage: OppStage, type: OppType) {
  const s = SALESMEN.find((x) => x.id === salesId)!;
  const b = BRANCHES.find((x) => x.id === s.branchId)!;
  const nextOffset = stage === "Prospek" ? between(-6, 3) : between(-4, 10);
  const id = `OPP${oppSeq++}`;
  const name =
    type === "Pelanggan Baru (NOO)"
      ? pick(PROSPECT_NAMES)
      : `${OUTLETS.find((o) => o.salesId === salesId)?.name ?? "Toko"} – ${type.includes("proyek") ? "Proyek kemasan" : "Produk food grade"}`;
  OPPORTUNITIES.push({
    id,
    name,
    contact: `${pick(FIRST)} ${pick(LAST)}`,
    city: b.city,
    type,
    salesId,
    stage,
    value: between(3, 60) * 2_500_000,
    nextDate: addDays(TODAY, nextOffset),
    nextKind: pick<FollowKind>(["Kunjungan", "Kunjungan", "Telepon", "Kirim penawaran"]),
    batalReason: stage === "Batal" ? pick(BATAL_REASONS.slice(0, 5)) : undefined,
    createdAt: addDays(TODAY, -between(3, 40)),
    log: [{ at: addDays(TODAY, -between(3, 40)) + " 09:12", by: s.name, text: "Prospek dibuat dari Mile Field (NOO)" }],
  });
}
const sbyTeam1 = SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
const NOO: OppType = "Pelanggan Baru (NOO)";
const SBY_PLAN: [OppStage, OppType][][] = [
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO], ["Kunjungan & Negosiasi", "Pelanggan Lama – proyek"]],
  [["Prospek", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO], ["Batal", NOO], ["Dijadwalkan", "Pelanggan Lama – produk baru"]],
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO]],
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Batal", NOO], ["Kunjungan & Negosiasi", "Pelanggan Lama – produk baru"]],
];
sbyTeam1.forEach((s, i) => SBY_PLAN[i % SBY_PLAN.length].forEach(([st, ty]) => seedOpp(s.id, st, ty)));
SALESMEN.filter((s) => s.spvId !== "SPV-SBY-1").forEach((s, i) => {
  if (i % 2 === 0) seedOpp(s.id, pick(STAGES_SEED), "Pelanggan Baru (NOO)");
  if (i % 3 === 0) seedOpp(s.id, pick(STAGES_SEED), rnd() < 0.7 ? "Pelanggan Baru (NOO)" : "Pelanggan Lama – proyek");
});
export function nextOppId() {
  return `OPP${oppSeq++}`;
}

/* ---------- orders ---------- */
export const ORDERS: Order[] = [];
let orderSeq = 241;
const orderNoSeq: Record<string, number> = {};
/** Module 07 FR-001: order number per branch `SO-<branch>-<yyyymm>-<seq>`. */
export function orderNo(branchId: string) {
  orderNoSeq[branchId] = (orderNoSeq[branchId] ?? (branchId === "SBY" ? 240 : 120)) + 1;
  return `SO-${branchId}-202611-${String(orderNoSeq[branchId]).padStart(4, "0")}`;
}
function seedOrder(outlet: Outlet, items: [string, string, number, number?][], discountPct = 0, note?: string) {
  const s = SALESMEN.find((x) => x.id === outlet.salesId)!;
  ORDERS.push({
    id: `ORD${orderSeq}`,
    no: orderNo(s.branchId),
    mfRef: `MF-ORD-2611-${String(orderSeq).padStart(4, "0")}`,
    outletId: outlet.id,
    salesId: outlet.salesId,
    date: `${addDays(TODAY, -between(0, 1))} ${String(between(8, 16)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`,
    items: items.map(([pid, uom, qty, price]) => {
      const pr = productById(pid).uoms.find((u) => u.uom === uom);
      return { productId: pid, uom, qty, price: price ?? pr?.price ?? 0 };
    }),
    discountPct,
    status: "Menunggu Review",
    note,
    approvedTypes: [],
    log: [{ at: TODAY + " 08:00", by: s.name, text: "Pesanan dibuat di Mile Field saat kunjungan" }],
  });
  orderSeq++;
}
const sbyOutlets = OUTLETS.filter((o) => o.branchId === "SBY" && o.status === "lama_beli");
// guarantee one outlet that will exceed credit limit
const tight = sbyOutlets[1];
tight.creditLimit = 50_000_000;
tight.outstanding = 46_500_000;
tight.overdue = 0;
tight.overdueDays = 0;
const overdueOutlet = sbyOutlets[4];
overdueOutlet.overdue = 12_400_000;
overdueOutlet.overdueDays = 38;
overdueOutlet.outstanding = Math.max(overdueOutlet.outstanding, 20_000_000);
const cleanOutlets = sbyOutlets.filter((o) => o !== tight && o !== overdueOutlet).map((o) => {
  o.overdue = 0;
  o.overdueDays = 0;
  o.outstanding = Math.round(o.creditLimit * 0.3);
  return o;
});
seedOrder(cleanOutlets[0], [["P01", "karton", 10], ["P03", "karton", 4], ["P09", "pack", 30]]);
seedOrder(tight, [["P04", "karton", 6], ["P08", "karton", 3]], 0, "Minta kirim Kamis pagi");
seedOrder(cleanOutlets[1], [["P05", "karton", 15], ["P06", "pcs", 8]], 7, "Diskon 7% untuk pembelian rutin");
seedOrder(cleanOutlets[2], [["P02", "pack", 40, 25000], ["P07", "pcs", 24]], 0, "Harga mengikuti penawaran sales");
seedOrder(overdueOutlet, [["P11", "bal", 12], ["P12", "karton", 2]]);
seedOrder(cleanOutlets[3], [["P10", "kg", 500], ["P01", "pack", 60]], 2);
seedOrder(cleanOutlets[4], [["P03", "karton", 6], ["P04", "pack", 20]]);
const otherOutlets = OUTLETS.filter((o) => o.branchId !== "SBY" && o.status === "lama_beli");
seedOrder(otherOutlets[0], [["P01", "karton", 8], ["P02", "karton", 5]]);
seedOrder(otherOutlets[12], [["P06", "karton", 2], ["P12", "pcs", 6]], 3);
seedOrder(otherOutlets[30], [["P05", "karton", 20]]);
// some already processed (Variant A: SO draft already in Odoo)
ORDERS[6].status = "SO Draft di Odoo";
ORDERS[6].soNumber = "SO/UP/2611/00871";
ORDERS[9].status = "Dikonfirmasi di Odoo";
ORDERS[9].soNumber = "SO/UP/2611/00866";

export function nextOrderSeq() {
  return orderSeq++;
}

/* ---------- approvals ---------- */
export const APPROVALS: ApprovalRequest[] = [];
let apvSeq = 1;
export function nextApprovalNo(prefix: string) {
  const n = apvSeq++;
  return { id: `APV${n}`, no: `${prefix}-2611-${String(n).padStart(3, "0")}` };
}
export function outletTotal(o: Order) {
  const gross = o.items.reduce((a, i) => a + i.qty * i.price, 0);
  return Math.round(gross * (1 - o.discountPct / 100));
}

export const DEFAULT_SETTINGS: Settings = {
  variant: "A",
  pipelineStageApproval: false,
  pipelineBatalApproval: true,
  existingCustomerPipeline: false,
  overdueDays: 30,
  approvalTrigger: "auto",
  discountTierMode: "single",
  discountBasis: "order",
  creditApprover: "spv",
  slaHours: 24,
  orderReview: true,
  orderWithoutVisitHQ: true,
  nooOrderBeforeApproval: false,
  minOrder: false,
  geofenceM: 100,
  defaultFreq: "F2",
  pjpCallTarget: 12,
  pjpMaxCalls: 15,
  hqCallTarget: 8,
  hqMaxCalls: 10,
  visitMinutes: 25,
  travelMinutes: 15,
  cycleWeeks: 4,
  workDays: [0, 1, 2, 3, 4, 5],
  branchWorkDays: {},
  geofenceMode: "flag",
  photoRequired: true,
  minVisitMinutes: 5,
  checkoutRequired: true,
  extraCallAllowed: true,
  extraCallNeedsReason: true,
  extraInCompliance: false,
  skipReasons: ["Toko tutup", "Pemilik / PIC tidak ada", "Libur / tutup sementara", "Stok masih banyak", "Di luar jam kerja", "Cuaca / akses jalan", "Lainnya"],
  carryOverMode: "manual",
  carryOverMaxDays: 2,
  publishCutoff: "18:00",
  lockAfterPublish: true,
  changeRequestSlaHours: 24,
  generateKeepRoute: true,
  routeStartPoint: "branch",
  reminderTime: "07:00",
  spvEditPjpDirect: false,
  pjpApprover: "admin",
  loa: [
    { role: "sales", label: "Sales (tanpa approval)", max: 2 },
    { role: "spv", label: "Sales Supervisor", max: 5 },
    { role: "admin", label: "Admin", max: null },
  ],
  assortmentFallback: "all",
  odooWriteBackSalesperson: false,
};

/* ---------- targets & activity ---------- */
export const TARGETS_SALES: TargetRow[] = SALESMEN.map((s) => {
  const target = between(12, 40) * 10_000_000;
  return { key: s.id, month: CURRENT_MONTH, target, actual: Math.round(target * (0.35 + rnd() * 0.45)) };
});
export const TARGETS_BRANCH: TargetRow[] = BRANCHES.map((b) => {
  const sum = TARGETS_SALES.filter((t) => SALESMEN.find((s) => s.id === t.key)!.branchId === b.id);
  return { key: b.id, month: CURRENT_MONTH, target: sum.reduce((a, t) => a + t.target, 0), actual: sum.reduce((a, t) => a + t.actual, 0) };
});
export const TARGETS_PRODUCT: TargetRow[] = PRODUCTS.map((p) => {
  const target = between(15, 120) * 10_000_000;
  const actual = Math.round(target * (0.3 + rnd() * 0.5));
  const unit = p.uoms[0].price;
  return { key: p.id, month: CURRENT_MONTH, target, actual, targetQty: Math.round(target / unit), actualQty: Math.round(actual / unit) };
});
export const CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));
export const TARGETS_CATEGORY: TargetRow[] = CATEGORIES.map((c) => {
  const rows = TARGETS_PRODUCT.filter((t) => PRODUCTS.find((p) => p.id === t.key)!.category === c);
  return {
    key: c,
    month: CURRENT_MONTH,
    target: rows.reduce((a, r) => a + r.target, 0),
    actual: rows.reduce((a, r) => a + r.actual, 0),
    targetQty: rows.reduce((a, r) => a + (r.targetQty ?? 0), 0),
    actualQty: rows.reduce((a, r) => a + (r.actualQty ?? 0), 0),
  };
});

export interface VisitStat {
  salesId: string;
  planned: number;
  actual: number;
  effective: number;
  extra: number;
}
/** Visits of the current cycle up to yesterday, from the same simulated Mile Field execution as the PJP page. */
export const VISITS: VisitStat[] = (() => {
  const bySales = new Map<string, PjpEntry[]>();
  PJP.forEach((e) => bySales.set(e.salesId, [...(bySales.get(e.salesId) ?? []), e]));
  return SALESMEN.map((s) => {
    const entries = bySales.get(s.id) ?? [];
    const pool = OUTLETS.filter((o) => o.salesId === s.id).map((o) => o.id);
    const plannedOn = (date: string) => {
      const p = cyclePos(date);
      if (!p) return [];
      return entries
        .filter((e) => isOn(e, p.week, p.day) && validOn(e, date))
        .sort((a, b) => a.seq - b.seq)
        .map((e) => ({ key: e.id, outletId: e.outletId }));
    };
    const stat = { salesId: s.id, planned: 0, actual: 0, effective: 0, extra: 0 };
    for (let date = CYCLE_START; date < TODAY; date = addDays(date, 1)) {
      if (!cyclePos(date)) continue;
      const holiday = HOLIDAYS.some((h) => h.date === date && (!h.branchIds || h.branchIds.includes(s.branchId)));
      const prev = prevWorkday(date);
      const lines = simulateDay({ date, today: TODAY, salesId: s.id, planned: plannedOn(date), prevPlanned: plannedOn(prev), prevDate: prev, extraPool: pool, holiday });
      for (const l of lines) {
        if (l.source === "Extra") stat.extra++;
        else if (l.source === "PJP" && l.status !== "Libur") {
          stat.planned++;
          if (l.status === "Selesai") stat.actual++;
        }
        if (l.effective) stat.effective++;
      }
    }
    return stat;
  });
})();

/* ---------- users (synced from MileApp) ---------- */
export const USERS: ModuleUser[] = [
  { id: "U1", name: "Rina Kusuma", email: "rina.kusuma@unggulplastik.co.id", role: "admin", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U4", name: "Dewi Lestari", email: "dewi.lestari@unggulplastik.co.id", role: "spv", branchId: "SBY", spvId: "SPV-SBY-1", active: true, syncedAt: "2026-11-17 06:00" },
  ...SPVS.filter((s) => s.id !== "SPV-SBY-1").map((s, i) => ({
    id: `US${i}`,
    name: s.name,
    email: `${s.name.toLowerCase().replace(/\s+/g, ".")}@unggulplastik.co.id`,
    role: "spv" as const,
    branchId: s.branchId,
    spvId: s.id,
    active: true,
    syncedAt: "2026-11-17 06:00",
  })),
];

/* ---------- data sync (Variant A) & import (Variant B) ---------- */
export const SYNC_DOMAINS: SyncDomain[] = [
  { key: "partner", name: "Pelanggan (res.partner)", direction: "Odoo → Modul", schedule: "Tiap 15 menit", lastSync: "2026-11-17 10:45", records: OUTLETS.length, status: "ok", errors: 0 },
  { key: "product", name: "Produk", direction: "Odoo → Modul", schedule: "Tiap 1 jam", lastSync: "2026-11-17 10:00", records: PRODUCTS.length, status: "ok", errors: 0 },
  { key: "uom", name: "UoM & konversi", direction: "Odoo → Modul", schedule: "Harian 05:00", lastSync: "2026-11-17 05:00", records: 31, status: "ok", errors: 0 },
  { key: "pricelist", name: "Price list", direction: "Odoo → Modul", schedule: "Tiap 1 jam", lastSync: "2026-11-17 10:00", records: 248, status: "error", errors: 2 },
  { key: "receivable", name: "Piutang & limit kredit", direction: "Odoo → Modul", schedule: "Tiap 1 jam (+ cek saat kirim SO)", lastSync: "2026-11-17 10:30", records: 214, status: "ok", errors: 0 },
  { key: "so", name: "Pesanan → Sales Order", direction: "Modul → Odoo", schedule: "Real-time (saat konfirmasi)", lastSync: "2026-11-17 10:52", records: 86, status: "error", errors: 1 },
  { key: "so_status", name: "Status SO / invoice", direction: "Odoo → Modul", schedule: "Tiap 15 menit", lastSync: "2026-11-17 10:45", records: 86, status: "ok", errors: 0 },
  { key: "noo", name: "Pelanggan baru (NOO) → res.partner", direction: "Modul → Odoo", schedule: "Real-time (setelah approval)", lastSync: "2026-11-16 16:20", records: 9, status: "ok", errors: 0 },
];
export const SYNC_ERRORS: SyncError[] = [
  { id: "E1", domain: "pricelist", ref: "UP-GPP-16 / karton", message: "UoM 'karton' tidak ditemukan pada product.template (mapping UoM belum lengkap)", at: "2026-11-17 10:00", resolved: false },
  { id: "E2", domain: "pricelist", ref: "UP-STR-PE / pcs", message: "Harga 0 pada price list Grosir 2026 — dilewati", at: "2026-11-17 10:00", resolved: false },
  { id: "E3", domain: "so", ref: "SO-JKT-202611-0118", message: "Timeout 30 detik saat memanggil Odoo API (sale.order create)", at: "2026-11-17 10:52", resolved: false },
];
export const IMPORT_TEMPLATES = [
  { key: "customer", name: "Pelanggan", desc: "Kode, nama, alamat, cabang, sales, segmen, status beli" },
  { key: "product", name: "Produk & UoM", desc: "SKU, nama, kategori, UoM, konversi" },
  { key: "pricelist", name: "Price list", desc: "SKU, UoM, harga, berlaku mulai" },
  { key: "receivable", name: "Piutang & limit kredit", desc: "Kode pelanggan, limit, saldo, jatuh tempo" },
  { key: "order", name: "Pesanan", desc: "Export pesanan per periode / status" },
  { key: "target", name: "Target", desc: "Target per sales / cabang / produk per bulan" },
];
export const IMPORT_LOGS: ImportLog[] = [
  { id: "L1", kind: "Import", template: "Pelanggan", file: "import-awal-pelanggan-odoo.xlsx", by: "Rina Kusuma", at: "2026-11-02 09:10", accepted: 5784, rejected: 37 },
  { id: "L2", kind: "Import", template: "Produk & UoM", file: "import-awal-produk.xlsx", by: "Rina Kusuma", at: "2026-11-02 09:25", accepted: 412, rejected: 0 },
  { id: "L3", kind: "Import", template: "Piutang & limit kredit", file: "piutang-per-161126.xlsx", by: "Rina Kusuma", at: "2026-11-16 17:02", accepted: 1961, rejected: 4 },
  { id: "L4", kind: "Export", template: "Pesanan", file: "pesanan-sby-nov.xlsx", by: "Dewi Lestari", at: "2026-11-16 17:30", accepted: 128, rejected: 0 },
];

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  baru: "Pelanggan Baru",
  lama_beli: "Pelanggan Lama – sudah beli",
  lama_belum: "Pelanggan Lama – belum beli",
};

/* ---------- territory (module 03) ---------- */
export const REGIONS: Region[] = [
  { id: "RG-W", name: "Region Barat", branchIds: ["JKT", "TGR", "BDG", "MDN", "PLG", "HQ"], active: true },
  { id: "RG-E", name: "Region Timur", branchIds: ["SMG", "SBY", "MKS", "DPS"], active: true },
];
BRANCHES.forEach((b) => {
  b.regionId = REGIONS.find((r) => r.branchIds.includes(b.id))?.id;
  b.active = true;
});
/* ---------- price lists (module 02) ---------- */
export const PRICE_GROUPS = ["Retail", "Grosir", "Horeka / Industri"];
export const PRICE_LISTS: PriceList[] = [
  { id: "PL1", name: "Retail 2026", channel: "Retail", regionId: "all", validFrom: "2026-01-01", active: true, items: PRODUCTS.flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: u.price }))) },
  { id: "PL2", name: "Grosir 2026", channel: "Grosir", regionId: "all", validFrom: "2026-01-01", active: true, items: PRODUCTS.flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: Math.round((u.price * 0.96) / 100) * 100 }))) },
  { id: "PL3", name: "Horeka / Industri – Timur", channel: "Horeka / Industri", regionId: "RG-E", validFrom: "2026-07-01", active: true, items: PRODUCTS.slice(0, 9).flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: Math.round((u.price * 0.98) / 100) * 100 }))) },
  { id: "PL4", name: "Promo Akhir Tahun – Barat", channel: "Retail", regionId: "RG-W", validFrom: "2026-11-01", validTo: "2026-12-31", active: false, items: PRODUCTS.slice(0, 4).map((p) => ({ productId: p.id, uom: p.uoms[0].uom, price: Math.round((p.uoms[0].price * 0.93) / 100) * 100 })) },
];

/* ---------- PJP change requests (module 04) ---------- */
export const PJP_REQUESTS: PjpChangeRequest[] = (() => {
  const team = SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
  const o0 = OUTLETS.filter((o) => o.salesId === team[0].id);
  const add = o0.find((o) => UNCOVERED_SEED.has(o.id)) ?? o0[o0.length - 1];
  const e1 = PJP.find((e) => e.salesId === team[1].id && e.day === 0) ?? PJP.find((e) => e.salesId === team[1].id)!;
  const e3 = PJP.find((e) => e.salesId === team[0].id && e.freq === "F1")!;
  return [
    { id: "PCR1", salesId: team[0].id, outletId: add.id, kind: "Tambah", detail: "Rabu · F2 (M1, M3)", reason: "Outlet mulai order rutin", requestedBy: team[0].name, at: "2026-11-17 07:40", status: "pending" },
    { id: "PCR2", salesId: team[1].id, outletId: e1.outletId, kind: "Ubah hari", detail: `${DAYS[e1.day]} → Kamis`, reason: "Pemilik hanya ada di toko hari Kamis", requestedBy: team[1].name, at: "2026-11-16 16:05", status: "pending" },
    { id: "PCR3", salesId: team[0].id, outletId: e3.outletId, kind: "Hapus", detail: "Keluar dari PJP mulai minggu depan", reason: "Toko tutup permanen", requestedBy: team[0].name, at: "2026-11-14 10:20", status: "approved", decidedBy: "Dewi Lestari", decisionReason: "Sudah dicek" },
  ];
})();

/* ---------- assortment per segment (module 02) ---------- */
export const SEGMENT_LIST = ["Grosir Plastik", "Toko Kemasan", "Industri F&B", "Horeka", "Agen / Sub-distributor", "Toko Kelontong"];
const A_ = (segment: string, items: [string, boolean][]): Assortment => ({ id: `AS-${segment.slice(0, 3)}`.replace(/\s/g, ""), segment, items: items.map(([productId, mustSell]) => ({ productId, mustSell })), updatedBy: "Admin Sistem", updatedAt: "2026-11-10 09:00" });
export const ASSORTMENTS: Assortment[] = [
  A_("Grosir Plastik", [["P01", true], ["P02", true], ["P06", true], ["P11", false], ["P12", false], ["P07", false], ["P03", false]]),
  A_("Toko Kemasan", [["P03", true], ["P04", true], ["P08", true], ["P09", false], ["P01", false], ["P06", false]]),
  A_("Industri F&B", [["P05", true], ["P12", true], ["P06", false], ["P10", false], ["P08", false]]),
  A_("Horeka", [["P04", true], ["P03", true], ["P09", false], ["P08", false]]),
  A_("Agen / Sub-distributor", [["P01", true], ["P02", true], ["P03", true], ["P04", false], ["P11", false], ["P12", false]]),
];
export const ASSORTMENT_EXCEPTIONS: AssortmentException[] = [];
export const OWNERSHIP_LOG: OwnershipLog[] = [];
